import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, reviewLocked, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { encodeCursor, etag } from '../context/service.js'
import { executeIdempotent } from '../content/idempotency.js'
import {
  approvalIsCurrent,
  assessmentFreshness,
  currentBrandInputHash,
  currentApprovalProjection,
  getContentAggregate,
  readContentFromDb,
  type CompleteContentRow,
} from '../content/service.js'
import { hasCompleteVariantCopy } from '../content/lifecycle.js'
import type { PlatformCode } from '../content/constants.js'
import { M4_MODULE, M4_OPERATION, M4_OVERRIDABLE_FAILURE_CODES } from '../ai/constants.js'
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
  failedAiRequestId: string | null
  failedAiRequestErrorCode: string | null
  evidenceCurrent: boolean | null
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

export interface OverrideEvidence {
  assessmentId: string | null
  failedAiRequestId: string | null
  manualCheck?: boolean
}

function isOverridableBrandCheckFailure(code: string | null): code is (typeof M4_OVERRIDABLE_FAILURE_CODES)[number] {
  return Boolean(code && M4_OVERRIDABLE_FAILURE_CODES.includes(code as (typeof M4_OVERRIDABLE_FAILURE_CODES)[number]))
}

export async function recordOverride(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  platform: PlatformCode,
  evidence: OverrideEvidence,
  justification: string,
  idempotencyKey: string,
  requestId: string,
  config: { openaiModel: string | null; aiProviderMode?: 'mock' | 'openai' | undefined },
) {
  return executeIdempotent(prisma, {
    companyId,
    operation: 'review.override',
    key: idempotencyKey,
    normalizedRequest: { actorId, contentId, expectedVersion, platform, evidence, justification },
    execute: async (tx) => {
      await lockReviewContent(tx, companyId, contentId, expectedVersion)
      const content = await getContentAggregate(tx, companyId, contentId)
      await assertEditableReviewState(tx, companyId, content, config, false)
      const freshness = await assessmentFreshness(tx, companyId, content, config)
      const target = content.variants.find((variant) => variant.platform === platform)
      if (!target) throw notFound()
      if (!target.enabled) throw conflict('Only enabled Variants can be reviewed.')
      if (!['ready_for_review', 'needs_revision'].includes(content.editorialStage)) throw conflict('Content is not in a review-capable state.')
      const normalizedJustification = justification.trim()
      if (!normalizedJustification || normalizedJustification.length > 4_000) throw validationError('An override justification is required.', { justification: 'Use a nonblank justification of at most 4000 characters.' })
      const hasAssessmentEvidence = Boolean(evidence.assessmentId)
      const hasFailureEvidence = Boolean(evidence.failedAiRequestId)
      const hasManualEvidence = evidence.manualCheck === true
      if (Number(hasAssessmentEvidence) + Number(hasFailureEvidence) + Number(hasManualEvidence) !== 1) throw validationError('Choose one Brand Check override method.', { evidence: 'Provide an Assessment ID, a failed AI request ID, or a manual check override.' })

      let assessmentId: string | null = null
      let failedAiRequestId: string | null = null
      let failureCode: string | null = null
      let manualEvidence: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull
      if (evidence.assessmentId) {
        const assessment = target.currentAssessment
        if (!assessment || assessment.id !== evidence.assessmentId || assessment.variantId !== target.id) throw conflict('The Assessment is not the current Assessment for this Variant.')
        if (assessment.result !== 'needs_attention') throw conflict('Only a Needs Attention Assessment can be overridden.')
        if (freshness.get(target.id) !== 'current' || assessment.variantRevision !== target.revision) throw conflict('The Assessment is stale and must be rerun.')
        assessmentId = assessment.id
      } else if (evidence.failedAiRequestId) {
        const currentAssessment = target.currentAssessment
        if (currentAssessment && freshness.get(target.id) === 'current' && currentAssessment.variantRevision === target.revision) {
          throw conflict('A current Brand Assessment exists for this Variant. Override that Assessment only when it Needs Attention.')
        }
        const failedRequest = await tx.aiRequestLog.findFirst({
          where: {
            id: evidence.failedAiRequestId!,
            companyId,
            contentId,
            variantId: target.id,
            module: M4_MODULE,
            operation: M4_OPERATION,
          },
          select: {
            id: true,
            status: true,
            errorCode: true,
            completedAt: true,
            editorialRevision: true,
            variantRevision: true,
            inputHash: true,
          },
        })
        if (!failedRequest || failedRequest.status !== 'failed' || !failedRequest.completedAt || !isOverridableBrandCheckFailure(failedRequest.errorCode)) {
          throw conflict('The selected Brand Check failure cannot be overridden.')
        }
        if (failedRequest.editorialRevision !== content.editorialRevision || failedRequest.variantRevision !== target.revision) {
          throw conflict('The failed Brand Check is stale. Run Brand Consistency Check again.')
        }
        const currentInputHash = await currentBrandInputHash(tx, companyId, content, target.id, config)
        if (!currentInputHash || failedRequest.inputHash !== currentInputHash) {
          throw conflict('The inputs changed after the failed Brand Check. Run Brand Consistency Check again.')
        }
        failedAiRequestId = failedRequest.id
        failureCode = failedRequest.errorCode
      } else {
        manualEvidence = {
          evidenceType: 'manual_brand_check_override',
          variantRevision: target.revision,
          effectiveAssetIds: effectiveAssetIds(target, content.variants),
        }
      }

      const action = await tx.approvalAction.create({
        data: {
          contentId,
          variantId: target.id,
          assessmentId,
          failedAiRequestId,
          editorialRevision: content.editorialRevision,
          action: 'override',
          actorId,
          justification: normalizedJustification,
          checklist: Prisma.DbNull,
          reviewedVariants: manualEvidence,
        },
        include: {
          actor: { select: { id: true, name: true } },
          failedAiRequest: { select: { errorCode: true } },
        },
      })
      await tx.content.update({ where: { id: contentId }, data: { version: { increment: 1 } } })
      await appendReviewEvent(tx, {
        contentId,
        variantId: target.id,
        actorId,
        eventType: 'review_override_recorded',
        metadata: {
          actionId: action.id,
          platform,
          evidenceType: evidence.manualCheck ? 'manual_brand_check_override' : failedAiRequestId ? 'failed_brand_check' : 'assessment',
          assessmentId,
          failedAiRequestId,
          failureCode,
        },
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
  config: { openaiModel: string | null; aiProviderMode?: 'mock' | 'openai' | undefined },
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
        const assetIds = effectiveAssetIds(variant, content.variants)
        if (content.designStatus === 'ready' && assetIds.length === 0) throw validationError('Every enabled Variant needs effective creative before approval.', { assets: `${variant.platform} requires an effective creative Asset.` })

        const manualOverride = await findCurrentManualOverride(tx, content.id, variant.id, variant.revision, content.editorialRevision, assetIds)
        if (manualOverride) {
          reviewedVariants.push({
            variantId: variant.id,
            platform: variant.platform,
            variantRevision: variant.revision,
            evidenceType: 'manual_brand_check_override',
            assessmentId: null,
            assessmentStatus: null,
            failedAiRequestId: null,
            failureCode: null,
            overrideId: manualOverride.id,
            effectiveAssetIds: assetIds,
          })
          continue
        }

        const assessmentIsCurrent = Boolean(
          assessment
          && assessment.variantId === variant.id
          && assessment.variantRevision === variant.revision
          && freshness.get(variant.id) === 'current',
        )
        if (assessmentIsCurrent && assessment) {
          const override = assessment.result === 'needs_attention'
            ? await findCurrentOverride(tx, content.id, variant.id, assessment.id, content.editorialRevision)
            : null
          if (assessment.result === 'needs_attention' && !override) throw conflict('Every Needs Attention Assessment needs a current human override.')
          if (assessment.result !== 'aligned' && assessment.result !== 'needs_attention') throw conflict('The current Brand Assessment is invalid.')
          reviewedVariants.push({
            variantId: variant.id,
            platform: variant.platform,
            variantRevision: variant.revision,
            evidenceType: 'assessment',
            assessmentId: assessment.id,
            assessmentStatus: assessment.result,
            failedAiRequestId: null,
            failureCode: null,
            overrideId: override?.id ?? null,
            effectiveAssetIds: assetIds,
          })
          continue
        }

        const currentInputHash = await currentBrandInputHash(tx, companyId, content, variant.id, config)
        const failureOverride = currentInputHash
          ? await findCurrentFailureOverride(tx, companyId, content.id, variant.id, variant.revision, content.editorialRevision, currentInputHash)
          : null
        if (!failureOverride?.failedAiRequest) {
          throw conflict('Every enabled Variant needs a current Brand Assessment or an explicit override of its current failed Brand Check.')
        }
        reviewedVariants.push({
          variantId: variant.id,
          platform: variant.platform,
          variantRevision: variant.revision,
          evidenceType: 'failed_brand_check',
          assessmentId: null,
          assessmentStatus: null,
          failedAiRequestId: failureOverride.failedAiRequest.id,
          failureCode: failureOverride.failedAiRequest.errorCode,
          overrideId: failureOverride.id,
          effectiveAssetIds: assetIds,
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
  config: { openaiModel: string | null; aiProviderMode?: 'mock' | 'openai' | undefined },
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
      const approved = await approvalIsCurrent(tx, companyId, content, freshness, config)
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

export async function listReviewActions(
  prisma: PrismaClient,
  companyId: string,
  contentId: string,
  options: { limit: number; cursor?: { createdAt: Date; id: string } },
  config: { openaiModel: string | null; aiProviderMode?: 'mock' | 'openai' | undefined },
) {
  const content = await getContentAggregate(prisma, companyId, contentId)
  const freshness = await assessmentFreshness(prisma, companyId, content, config)
  const filters: Prisma.ApprovalActionWhereInput[] = [{ contentId, content: { companyId } }]
  if (options.cursor) filters.push({ OR: [{ createdAt: { lt: options.cursor.createdAt } }, { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.approvalAction.findMany({
    where: { AND: filters },
    include: {
      actor: { select: { id: true, name: true } },
      failedAiRequest: {
        select: {
          id: true,
          companyId: true,
          contentId: true,
          variantId: true,
          module: true,
          operation: true,
          status: true,
          errorCode: true,
          completedAt: true,
          editorialRevision: true,
          variantRevision: true,
          inputHash: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const pageRows = rows.slice(0, options.limit)
  const currentHashByVariant = new Map<string, Promise<string | null>>()
  const evidenceStates = await Promise.all(pageRows.map(async (action) => {
    if (action.action !== 'override' || !action.justification?.trim() || action.editorialRevision !== content.editorialRevision || !action.variantId) return null
    const variant = content.variants.find((candidate) => candidate.id === action.variantId)
    if (!variant || !variant.enabled) return false
    if (!action.assessmentId && !action.failedAiRequestId && isRecord(action.reviewedVariants)) {
      const evidence = action.reviewedVariants
      const currentAssets = effectiveAssetIds(variant, content.variants)
      return evidence.evidenceType === 'manual_brand_check_override'
        && evidence.variantRevision === variant.revision
        && Array.isArray(evidence.effectiveAssetIds)
        && sameStrings(evidence.effectiveAssetIds as string[], currentAssets)
    }
    if (action.assessmentId) {
      const assessment = variant.currentAssessment
      return Boolean(
        !action.failedAiRequestId
        && assessment?.id === action.assessmentId
        && assessment.result === 'needs_attention'
        && assessment.variantRevision === variant.revision
        && freshness.get(variant.id) === 'current',
      )
    }
    const failedRequest = action.failedAiRequest
    if (!failedRequest || action.failedAiRequestId !== failedRequest.id) return false
    const currentAssessmentExists = Boolean(variant.currentAssessment && variant.currentAssessment.variantRevision === variant.revision && freshness.get(variant.id) === 'current')
    if (currentAssessmentExists || failedRequest.companyId !== companyId || failedRequest.contentId !== content.id || failedRequest.variantId !== variant.id || failedRequest.module !== M4_MODULE || failedRequest.operation !== M4_OPERATION || failedRequest.status !== 'failed' || !failedRequest.completedAt || failedRequest.editorialRevision !== content.editorialRevision || failedRequest.variantRevision !== variant.revision || !isOverridableBrandCheckFailure(failedRequest.errorCode)) return false
    let hashPromise = currentHashByVariant.get(variant.id)
    if (!hashPromise) {
      hashPromise = currentBrandInputHash(prisma, companyId, content, variant.id, config)
      currentHashByVariant.set(variant.id, hashPromise)
    }
    return (await hashPromise) === failedRequest.inputHash
  }))
  const last = pageRows.at(-1)
  return {
    data: pageRows.map((action, index) => mapReviewAction(action, evidenceStates[index] ?? null)),
    nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  }
}

function sameStrings(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function assertEditableReviewState(db: Db, companyId: string, content: CompleteContentRow, config: { openaiModel: string | null; aiProviderMode?: 'mock' | 'openai' | undefined }, allowApproved: boolean) {
  if (content.archivedAt) throw conflict('Archived Content cannot be changed.')
  const freshness = await assessmentFreshness(db, companyId, content, config)
  if (!allowApproved && await approvalIsCurrent(db, companyId, content, freshness, config)) throw reviewLocked()
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

async function findCurrentFailureOverride(
  db: Db,
  companyId: string,
  contentId: string,
  variantId: string,
  variantRevision: number,
  editorialRevision: number,
  inputHash: string,
) {
  const action = await db.approvalAction.findFirst({
    where: {
      contentId,
      variantId,
      assessmentId: null,
      failedAiRequestId: { not: null },
      editorialRevision,
      action: 'override',
      failedAiRequest: {
        is: {
          companyId,
          contentId,
          variantId,
          module: M4_MODULE,
          operation: M4_OPERATION,
          status: 'failed',
          variantRevision,
          editorialRevision,
          inputHash,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      justification: true,
      failedAiRequestId: true,
      failedAiRequest: { select: { id: true, errorCode: true, completedAt: true } },
    },
  })
  if (!action?.justification?.trim() || !action.failedAiRequest?.completedAt || !isOverridableBrandCheckFailure(action.failedAiRequest.errorCode)) return null
  return action
}

async function findCurrentManualOverride(
  db: Db,
  contentId: string,
  variantId: string,
  variantRevision: number,
  editorialRevision: number,
  effectiveAssetIds: string[],
) {
  const actions = await db.approvalAction.findMany({
    where: { contentId, variantId, assessmentId: null, failedAiRequestId: null, editorialRevision, action: 'override' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, justification: true, reviewedVariants: true },
  })
  return actions.find((action) => {
    if (!action.justification?.trim() || !isRecord(action.reviewedVariants)) return false
    const evidence = action.reviewedVariants
    return evidence.evidenceType === 'manual_brand_check_override'
      && evidence.variantRevision === variantRevision
      && Array.isArray(evidence.effectiveAssetIds)
      && sameStrings(evidence.effectiveAssetIds as string[], effectiveAssetIds)
  }) ?? null
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

function commandResult(action: { id: string; action: string; editorialRevision: number; variantId: string | null; assessmentId: string | null; failedAiRequestId: string | null; justification: string | null; checklist: Prisma.JsonValue | null; reviewedVariants: Prisma.JsonValue | null; createdAt: Date; actor: { id: string; name: string }; failedAiRequest?: { errorCode: string | null } | null }, content: Awaited<ReturnType<typeof readContentFromDb>>): ReviewCommandResult {
  return {
    resourceId: action.id,
    status: 201,
    body: { data: { action: mapReviewAction(action), content } },
    etag: etag(content.version),
  }
}

function mapReviewAction(action: { id: string; action: string; editorialRevision: number; variantId: string | null; assessmentId: string | null; failedAiRequestId: string | null; justification: string | null; checklist: Prisma.JsonValue | null; reviewedVariants: Prisma.JsonValue | null; createdAt: Date; actor: { id: string; name: string }; failedAiRequest?: { errorCode: string | null } | null }, evidenceCurrent: boolean | null = action.action === 'override' ? true : null): ReviewActionDto {
  return {
    id: action.id,
    action: action.action as ReviewActionDto['action'],
    actor: action.actor,
    editorialRevision: action.editorialRevision,
    variantId: action.variantId,
    assessmentId: action.assessmentId,
    failedAiRequestId: action.failedAiRequestId,
    failedAiRequestErrorCode: action.failedAiRequest?.errorCode ?? null,
    evidenceCurrent,
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
