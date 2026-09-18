import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, reviewLocked, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { encodeCursor, etag } from '../context/service.js'
import { executeIdempotent } from '../content/idempotency.js'
import {
  approvalIsCurrent,
  assessmentFreshness,
  currentApprovalProjection,
  getContentAggregate,
  readContentFromDb,
  type CompleteContentRow,
} from '../content/service.js'
import { hasCompleteVariantCopy } from '../content/lifecycle.js'
import type { PlatformCode } from '../content/constants.js'
import { systemClock, type Clock } from '../../shared/time/clock.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface ReviewChecklist {
  copyReviewed: boolean
  creativeReviewed: boolean
  visualCopyConsistent: boolean
  noErrors: boolean
  readyForPublication: boolean
}

export interface ReviewActionDto {
  id: string
  action: 'approve' | 'request_revision' | 'override'
  actor: { id: string; name: string }
  editorialRevision: number
  variantId: string | null
  assessmentId: string | null
  justification: string | null
  checklist: Prisma.JsonValue | null
  reviewedVariants: Prisma.JsonValue | null
  createdAt: string
}

interface ReviewResult {
  action: ReviewActionDto
  content: Awaited<ReturnType<typeof readContentFromDb>>
}

interface ReviewCommandResult {
  resourceId: string
  status: 201
  body: { data: ReviewResult }
  etag: string
}

const REVIEW_ACTIONS = ['approve', 'request_revision', 'override'] as const

export async function recordOverride(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  platform: PlatformCode,
  assessmentId: string,
  justification: string,
  idempotencyKey: string,
  requestId: string,
  config: { openaiModel: string | null },
) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'review.override',
    key: idempotencyKey,
    normalizedRequest: { actorId, contentId, expectedVersion, platform, assessmentId, justification },
    execute: async (tx) => {
      await lockReviewContent(tx, companyId, contentId, expectedVersion)
      const content = await getContentAggregate(tx, companyId, contentId)
      await assertEditableReviewState(tx, companyId, content, config, false)
      const freshness = await assessmentFreshness(tx, companyId, content, config)
      const target = content.variants.find((variant) => variant.platform === platform)
      if (!target) throw notFound()
      if (!target.enabled) throw conflict('Only enabled Variants can be reviewed.')
      const assessment = target.currentAssessment
      if (!assessment || assessment.id !== assessmentId || assessment.variantId !== target.id) throw conflict('The Assessment is not the current Assessment for this Variant.')
      if (assessment.result !== 'needs_attention') throw conflict('Only a warning Assessment can be overridden.')
      if (freshness.get(target.id) !== 'current' || assessment.variantRevision !== target.revision) throw conflict('The Assessment is stale and must be rerun.')
      if (!justification.trim() || justification.length > 4_000) throw validationError('An override justification is required.', { justification: 'Use a nonblank justification of at most 4000 characters.' })
      if (!['ready_for_review', 'needs_revision'].includes(content.editorialStage)) throw conflict('Content is not in a review-capable state.')

      const action = await tx.approvalAction.create({
        data: {
          contentId,
          variantId: target.id,
          assessmentId,
          editorialRevision: content.editorialRevision,
          action: 'override',
          actorId,
          justification,
          checklist: Prisma.DbNull,
          reviewedVariants: Prisma.DbNull,
        },
        include: { actor: { select: { id: true, name: true } } },
      })
      await tx.content.update({ where: { id: contentId }, data: { version: { increment: 1 } } })
      await appendReviewEvent(tx, {
        contentId,
        variantId: target.id,
        actorId,
        eventType: 'review_override_recorded',
        metadata: { actionId: action.id, assessmentId, platform },
        requestId,
      })
      const mappedContent = await readContentFromDb(tx, companyId, contentId, config)
      return commandResult(action, mappedContent)
    },
  })
}

export async function approveContent(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  checklist: ReviewChecklist,
  idempotencyKey: string,
  requestId: string,
  config: { openaiModel: string | null },
) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'review.approve',
    key: idempotencyKey,
    normalizedRequest: { actorId, contentId, expectedVersion, checklist },
    execute: async (tx) => {
      await lockReviewContent(tx, companyId, contentId, expectedVersion)
      // The parent lock serializes the command with every child mutation. Lock
      // enabled variants in a deterministic order before reading review
      // evidence so approval cannot be assembled from a moving set.
      await lockReviewVariants(tx, contentId)
      const content = await getContentAggregate(tx, companyId, contentId)
      await assertEditableReviewState(tx, companyId, content, config, false)
      assertChecklist(checklist)
      const freshness = await assessmentFreshness(tx, companyId, content, config)
      if (content.archivedAt) throw conflict('Archived Content cannot be approved.')
      if (content.editorialStage !== 'ready_for_review') throw conflict('Content must be Ready for Review before approval.')
      const enabled = content.variants.filter((variant) => variant.enabled).sort((a, b) => a.id.localeCompare(b.id))
      if (enabled.length === 0) throw validationError('At least one enabled Variant is required for approval.', { variants: 'Enable at least one platform.' })
      if (!isCompleteMaster(content.masterContent)) throw validationError('Master Content is required for approval.', { master: 'Complete the Master Content first.' })

      const reviewedVariants: Array<Record<string, unknown>> = []
      for (const variant of enabled) {
        const assessment = variant.currentAssessment
        if (!hasCompleteVariantCopy(variant) || variant.adaptedFromMasterRevision !== content.masterRevision) throw conflict('Every enabled Variant needs a current complete adaptation.')
        if (!assessment || assessment.variantId !== variant.id || assessment.variantRevision !== variant.revision || freshness.get(variant.id) !== 'current') throw conflict('Every enabled Variant needs a current Brand Assessment.')
        const override = assessment.result === 'needs_attention'
          ? await findCurrentOverride(tx, content.id, variant.id, assessment.id, content.editorialRevision)
          : null
        if (assessment.result === 'needs_attention' && !override) throw conflict('Every warning Assessment needs a current human override.')
        if (assessment.result !== 'aligned' && assessment.result !== 'needs_attention') throw conflict('The current Brand Assessment is invalid.')
        if (content.designStatus === 'ready' && effectiveAssetIds(variant, content.variants).length === 0) throw validationError('Every enabled Variant needs effective creative before approval.', { assets: `${variant.platform} requires an effective creative Asset.` })
        reviewedVariants.push({
          variantId: variant.id,
          platform: variant.platform,
          variantRevision: variant.revision,
          assessmentId: assessment.id,
          assessmentStatus: assessment.result,
          overrideId: override?.id ?? null,
          effectiveAssetIds: effectiveAssetIds(variant, content.variants),
        })
      }

      const action = await tx.approvalAction.create({
        data: {
          contentId,
          editorialRevision: content.editorialRevision,
          action: 'approve',
          actorId,
          checklist: toJson(checklist),
          reviewedVariants: toJson(reviewedVariants),
        },
        include: { actor: { select: { id: true, name: true } } },
      })
      await tx.content.update({ where: { id: contentId }, data: { currentApprovalId: action.id, version: { increment: 1 } } })
      await appendReviewEvent(tx, {
        contentId,
        actorId,
        eventType: 'content_approved',
        metadata: { approvalActionId: action.id, editorialRevision: content.editorialRevision, reviewedVariantIds: reviewedVariants.map((item) => item.variantId) },
        requestId,
      })
      const mappedContent = await readContentFromDb(tx, companyId, contentId, config)
      return commandResult(action, mappedContent)
    },
  })
}

export async function requestRevision(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  reason: string,
  idempotencyKey: string,
  requestId: string,
  config: { openaiModel: string | null },
  clock: Clock = systemClock,
) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'review.request-revision',
    key: idempotencyKey,
    normalizedRequest: { actorId, contentId, expectedVersion, reason },
    execute: async (tx) => {
      await lockReviewContent(tx, companyId, contentId, expectedVersion)
      await lockReviewVariants(tx, contentId)
      await lockReviewSchedules(tx, contentId)
      const content = await getContentAggregate(tx, companyId, contentId)
      if (content.archivedAt) throw conflict('Archived Content cannot request revision.')
      if (!reason.trim() || reason.length > 4_000) throw validationError('A revision reason is required.', { reason: 'Use a nonblank reason of at most 4000 characters.' })
      const freshness = await assessmentFreshness(tx, companyId, content, config)
      const approved = await approvalIsCurrent(tx, companyId, content, freshness)
      if (!approved && !['ready_for_review', 'needs_revision'].includes(content.editorialStage)) throw conflict('Content is not in a review workflow.')
      const enabled = content.variants.filter((variant) => variant.enabled)
      if (enabled.length > 0 && enabled.every((variant) => variant.publication)) throw conflict('Fully published Content cannot request revision.')

      const cancelledAt = clock.now()
      for (const variant of content.variants) {
        const schedule = variant.schedule
        if (!schedule || schedule.cancelledAt || variant.publication) continue
        await tx.contentSchedule.update({
          where: { id: schedule.id },
          data: { cancelledAt, cancellationReason: 'request_revision', version: { increment: 1 } },
        })
        await appendReviewEvent(tx, {
          contentId,
          variantId: variant.id,
          actorId,
          eventType: 'schedule_cancelled',
          metadata: { scheduleId: schedule.id, variantId: variant.id, platform: variant.platform, reason: 'request_revision' },
          requestId,
        })
      }

      const action = await tx.approvalAction.create({
        data: {
          contentId,
          editorialRevision: content.editorialRevision,
          action: 'request_revision',
          actorId,
          justification: reason,
          checklist: Prisma.DbNull,
          reviewedVariants: Prisma.DbNull,
        },
        include: { actor: { select: { id: true, name: true } } },
      })
      await tx.content.update({ where: { id: contentId }, data: { currentApprovalId: null, editorialStage: 'needs_revision', version: { increment: 1 } } })
      await appendReviewEvent(tx, {
        contentId,
        actorId,
        eventType: 'revision_requested',
        metadata: { actionId: action.id, reason },
        requestId,
      })
      const mappedContent = await readContentFromDb(tx, companyId, contentId, config)
      return commandResult(action, mappedContent)
    },
  })
}

export async function listReviewActions(prisma: PrismaClient, companyId: string, contentId: string, options: { limit: number; cursor?: { createdAt: Date; id: string } }) {
  await getContentAggregate(prisma, companyId, contentId)
  const filters: Prisma.ApprovalActionWhereInput[] = [{ contentId, content: { companyId } }]
  if (options.cursor) filters.push({ OR: [{ createdAt: { lt: options.cursor.createdAt } }, { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.approvalAction.findMany({
    where: { AND: filters },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  return {
    data: pageRows.map(mapReviewAction),
    nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  }
}

async function assertEditableReviewState(db: Db, companyId: string, content: CompleteContentRow, config: { openaiModel: string | null }, allowApproved: boolean) {
  if (content.archivedAt) throw conflict('Archived Content cannot be changed.')
  const freshness = await assessmentFreshness(db, companyId, content, config)
  if (!allowApproved && await approvalIsCurrent(db, companyId, content, freshness)) throw reviewLocked()
}

async function lockReviewContent(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version" FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const row = rows[0]
  if (!row) throw notFound()
  if (row.version !== expectedVersion) throw revisionConflict()
}

async function lockReviewVariants(tx: Prisma.TransactionClient, contentId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "platform_variants"
    WHERE "content_id" = CAST(${contentId} AS UUID) AND "enabled" = TRUE
    ORDER BY "id"
    FOR UPDATE
  `
}

async function lockReviewSchedules(tx: Prisma.TransactionClient, contentId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT schedules."id"
    FROM "content_schedules" AS schedules
    INNER JOIN "platform_variants" AS variants ON variants."id" = schedules."variant_id"
    WHERE variants."content_id" = CAST(${contentId} AS UUID)
    ORDER BY schedules."id"
    FOR UPDATE OF schedules
  `
}

async function findCurrentOverride(db: Db, contentId: string, variantId: string, assessmentId: string, editorialRevision: number) {
  return db.approvalAction.findFirst({
    where: { contentId, variantId, assessmentId, editorialRevision, action: 'override' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, justification: true },
  }).then((action) => action?.justification?.trim() ? action : null)
}

function effectiveAssetIds(variant: CompleteContentRow['variants'][number], variants: CompleteContentRow['variants']) {
  const source = variant.platform === 'linkedin' && variant.reuseCreativeFromVariant
    ? variants.find((candidate) => candidate.id === variant.reuseCreativeFromVariant?.id)
    : variant
  return source?.assetLinks.map((link) => link.assetId) ?? []
}

function isCompleteMaster(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return JSON.stringify(keys) === JSON.stringify(['body', 'coreMessage', 'cta', 'hook', 'title'])
    && ['title', 'coreMessage', 'hook', 'body', 'cta'].every((key) => typeof record[key] === 'string' && Boolean((record[key] as string).trim()))
}

function assertChecklist(checklist: ReviewChecklist) {
  const keys = ['copyReviewed', 'creativeReviewed', 'visualCopyConsistent', 'noErrors', 'readyForPublication']
  if (!checklist || typeof checklist !== 'object' || Object.keys(checklist).sort().join(',') !== keys.slice().sort().join(',') || keys.some((key) => checklist[key as keyof ReviewChecklist] !== true)) {
    throw validationError('All five checklist confirmations must be true.', { checklist: 'Confirm copy, creative, visual consistency, errors, and publication readiness.' })
  }
}

function commandResult(action: { id: string; action: string; editorialRevision: number; variantId: string | null; assessmentId: string | null; justification: string | null; checklist: Prisma.JsonValue | null; reviewedVariants: Prisma.JsonValue | null; createdAt: Date; actor: { id: string; name: string } }, content: Awaited<ReturnType<typeof readContentFromDb>>): ReviewCommandResult {
  return {
    resourceId: action.id,
    status: 201,
    body: { data: { action: mapReviewAction(action), content } },
    etag: etag(content.version),
  }
}

function mapReviewAction(action: { id: string; action: string; editorialRevision: number; variantId: string | null; assessmentId: string | null; justification: string | null; checklist: Prisma.JsonValue | null; reviewedVariants: Prisma.JsonValue | null; createdAt: Date; actor: { id: string; name: string } }): ReviewActionDto {
  return {
    id: action.id,
    action: action.action as ReviewActionDto['action'],
    actor: action.actor,
    editorialRevision: action.editorialRevision,
    variantId: action.variantId,
    assessmentId: action.assessmentId,
    justification: action.justification,
    checklist: action.checklist,
    reviewedVariants: action.reviewedVariants,
    createdAt: action.createdAt.toISOString(),
  }
}

async function appendReviewEvent(tx: Prisma.TransactionClient, input: { contentId: string; variantId?: string; actorId: string; eventType: string; metadata: Record<string, unknown>; requestId: string }) {
  await tx.contentEvent.create({
    data: {
      contentId: input.contentId,
      variantId: input.variantId ?? null,
      actorId: input.actorId,
      actorKind: 'user',
      eventType: input.eventType,
      metadata: toJson(input.metadata),
      requestId: input.requestId,
    },
  })
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
