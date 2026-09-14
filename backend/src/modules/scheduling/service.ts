import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { etag } from '../context/service.js'
import { executeIdempotent } from '../content/idempotency.js'
import {
  assessmentFreshness,
  currentApprovalProjection,
  getContentAggregate,
  readContentFromDb,
  type CompleteContentRow,
  type ContentReadConfig,
} from '../content/service.js'
import type { PlatformCode } from '../content/constants.js'
import type { Clock } from '../../shared/time/clock.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface ScheduleInput {
  platform: PlatformCode
  scheduledAt: Date
  timezone: string
}

export interface PublicationInput {
  publishedAt: Date
  postUrl: string | null
}

export interface CalendarQuery {
  start: Date
  end: Date
  platform?: PlatformCode
  status?: CalendarStatus
  productId?: string
  contextType?: 'company' | 'product'
}

export type CalendarStatus = 'scheduled' | 'ready_to_publish' | 'published'

type ContentDto = Awaited<ReturnType<typeof readContentFromDb>>
type PublicationDto = ContentDto['publications'][number]

interface SchedulingConfig extends ContentReadConfig {
  clock: Clock
}

export async function createOrUpdateSchedules(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  schedules: ScheduleInput[],
  idempotencyKey: string,
  requestId: string,
  config: SchedulingConfig,
) {
  return executeIdempotent(prisma, {
    companyId,
    operation: `content.schedules:${contentId}`,
    key: idempotencyKey,
    normalizedRequest: {
      actorId,
      contentId,
      expectedVersion,
      schedules: schedules.map((schedule) => ({
        platform: schedule.platform,
        scheduledAt: schedule.scheduledAt.toISOString(),
        timezone: schedule.timezone,
      })),
    },
    execute: async (tx) => {
      await lockContent(tx, companyId, contentId, expectedVersion)
      await lockContentVariants(tx, contentId)
      await lockContentSchedules(tx, contentId)
      const content = await getContentAggregate(tx, companyId, contentId)
      const now = config.clock.now()
      assertNotArchived(content)
      validateScheduleInputs(schedules, now)
      const approvalActionId = await currentApprovalId(tx, companyId, content, config)
      const prepared = schedules.map((input) => {
        const variant = content.variants.find((candidate) => candidate.platform === input.platform)
        if (!variant) throw notFound()
        if (!variant.enabled) throw conflict('Only enabled Variants can be scheduled.')
        if (variant.publication) throw conflict('A published Variant cannot be scheduled again.')
        return { input, variant, schedule: variant.schedule }
      })

      for (const item of prepared) {
        if (item.schedule) {
          await tx.contentSchedule.update({
            where: { id: item.schedule.id },
            data: {
              scheduledAt: item.input.scheduledAt,
              timezone: item.input.timezone,
              approvalActionId,
              cancelledAt: null,
              cancellationReason: null,
              version: { increment: 1 },
            },
          })
          await appendEvent(tx, {
            contentId,
            variantId: item.variant.id,
            actorId,
            eventType: 'schedule_updated',
            metadata: {
              scheduleId: item.schedule.id,
              variantId: item.variant.id,
              platform: item.variant.platform,
              scheduledAt: item.input.scheduledAt.toISOString(),
              timezone: item.input.timezone,
            },
            requestId,
          })
        } else {
          const schedule = await tx.contentSchedule.create({
            data: {
              variantId: item.variant.id,
              scheduledAt: item.input.scheduledAt,
              timezone: item.input.timezone,
              approvalActionId,
              createdBy: actorId,
            },
          })
          await appendEvent(tx, {
            contentId,
            variantId: item.variant.id,
            actorId,
            eventType: 'schedule_created',
            metadata: {
              scheduleId: schedule.id,
              variantId: item.variant.id,
              platform: item.variant.platform,
              scheduledAt: item.input.scheduledAt.toISOString(),
              timezone: item.input.timezone,
            },
            requestId,
          })
        }
      }

      await bumpContent(tx, contentId)
      const mapped = await readContentFromDb(tx, companyId, contentId, config, now)
      return { resourceId: contentId, status: 200, body: { data: mapped }, etag: etag(mapped.version) }
    },
  })
}

export async function reschedule(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  scheduleId: string,
  expectedVersion: number,
  input: Pick<ScheduleInput, 'scheduledAt' | 'timezone'>,
  requestId: string,
  config: SchedulingConfig,
) {
  const owner = await findScheduleOwner(prisma, scheduleId)
  if (!owner || owner.companyId !== companyId) throw notFound()
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, owner.contentId, expectedVersion)
    await lockVariant(tx, owner.contentId, owner.variantId)
    await lockSchedule(tx, scheduleId, owner.variantId)
    const content = await getContentAggregate(tx, companyId, owner.contentId)
    const now = config.clock.now()
    assertNotArchived(content)
    const variant = content.variants.find((candidate) => candidate.id === owner.variantId)
    const schedule = variant?.schedule
    if (!variant || !schedule || schedule.id !== scheduleId) throw notFound()
    if (!variant.enabled) throw conflict('Only enabled Variants can be scheduled.')
    if (variant.publication) throw conflict('A published Variant cannot be rescheduled.')
    validateScheduleInputs([{ ...input, platform: variant.platform as PlatformCode }], now)
    const approvalActionId = await currentApprovalId(tx, companyId, content, config)
    await tx.contentSchedule.update({
      where: { id: scheduleId },
      data: {
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
        approvalActionId,
        cancelledAt: null,
        cancellationReason: null,
        version: { increment: 1 },
      },
    })
    await bumpContent(tx, content.id)
    await appendEvent(tx, {
      contentId: content.id,
      variantId: variant.id,
      actorId,
      eventType: 'schedule_updated',
      metadata: {
        scheduleId,
        variantId: variant.id,
        platform: variant.platform,
        scheduledAt: input.scheduledAt.toISOString(),
        timezone: input.timezone,
        reactivated: schedule.cancelledAt !== null,
      },
      requestId,
    })
    const mapped = await readContentFromDb(tx, companyId, content.id, config, now)
    return { content: mapped, etag: etag(mapped.version) }
  })
}

export async function cancelSchedule(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  scheduleId: string,
  expectedVersion: number,
  requestId: string,
  config: SchedulingConfig,
) {
  const owner = await findScheduleOwner(prisma, scheduleId)
  if (!owner || owner.companyId !== companyId) throw notFound()
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, owner.contentId, expectedVersion)
    await lockVariant(tx, owner.contentId, owner.variantId)
    await lockSchedule(tx, scheduleId, owner.variantId)
    const content = await getContentAggregate(tx, companyId, owner.contentId)
    assertNotArchived(content)
    const variant = content.variants.find((candidate) => candidate.id === owner.variantId)
    const schedule = variant?.schedule
    if (!variant || !schedule || schedule.id !== scheduleId) throw notFound()
    if (variant.publication) throw conflict('A published schedule cannot be cancelled.')
    if (schedule.cancelledAt) {
      const mapped = await readContentFromDb(tx, companyId, content.id, config, config.clock.now())
      return { content: mapped, etag: etag(mapped.version) }
    }
    const now = config.clock.now()
    await tx.contentSchedule.update({
      where: { id: scheduleId },
      data: {
        cancelledAt: now,
        cancellationReason: 'user_cancelled',
        version: { increment: 1 },
      },
    })
    await bumpContent(tx, content.id)
    await appendEvent(tx, {
      contentId: content.id,
      variantId: variant.id,
      actorId,
      eventType: 'schedule_cancelled',
      metadata: { scheduleId, variantId: variant.id, platform: variant.platform, reason: 'user_cancelled' },
      requestId,
    })
    const mapped = await readContentFromDb(tx, companyId, content.id, config, now)
    return { content: mapped, etag: etag(mapped.version) }
  })
}

export async function publishSchedule(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  scheduleId: string,
  expectedVersion: number,
  input: PublicationInput,
  idempotencyKey: string,
  requestId: string,
  config: SchedulingConfig,
) {
  const owner = await findScheduleOwner(prisma, scheduleId)
  if (!owner || owner.companyId !== companyId) throw notFound()
  return executeIdempotent(prisma, {
    companyId,
    operation: `schedule.publish:${scheduleId}`,
    key: idempotencyKey,
    normalizedRequest: {
      actorId,
      scheduleId,
      expectedVersion,
      publishedAt: input.publishedAt.toISOString(),
      postUrl: input.postUrl,
    },
    execute: async (tx) => {
      await lockContent(tx, companyId, owner.contentId, expectedVersion)
      await lockVariant(tx, owner.contentId, owner.variantId)
      await lockSchedule(tx, scheduleId, owner.variantId)
      const content = await getContentAggregate(tx, companyId, owner.contentId)
      const now = config.clock.now()
      assertNotArchived(content)
      validatePublicationInput(input, now)
      const variant = content.variants.find((candidate) => candidate.id === owner.variantId)
      const schedule = variant?.schedule
      if (!variant || !schedule || schedule.id !== scheduleId) throw notFound()
      if (schedule.cancelledAt) throw conflict('A cancelled schedule cannot be published.')
      if (!variant.enabled) throw conflict('Only enabled Variants can be published.')
      const existing = variant.publication

      if (existing) {
        await lockPublication(tx, existing.id)
        if (existing.publishedAt.getTime() === input.publishedAt.getTime() && existing.postUrl === input.postUrl) {
          const mapped = await readContentFromDb(tx, companyId, content.id, config, now)
          const publication = publicationFromContent(mapped, existing.id)
          return { resourceId: existing.id, status: 200, body: { data: { publication, content: mapped } }, etag: etag(mapped.version) }
        }
        await tx.publicationRecord.update({
          where: { id: existing.id },
          data: {
            publishedAt: input.publishedAt,
            postUrl: input.postUrl,
            updatedAt: now,
            version: { increment: 1 },
          },
        })
        await bumpContent(tx, content.id)
        await appendEvent(tx, {
          contentId: content.id,
          variantId: variant.id,
          actorId,
          eventType: 'publication_corrected',
          metadata: {
            publicationId: existing.id,
            scheduleId,
            variantId: variant.id,
            platform: variant.platform,
            publishedAt: input.publishedAt.toISOString(),
          },
          requestId,
        })
        const mapped = await readContentFromDb(tx, companyId, content.id, config, now)
        const publication = publicationFromContent(mapped, existing.id)
        return { resourceId: existing.id, status: 200, body: { data: { publication, content: mapped } }, etag: etag(mapped.version) }
      }

      const approvalActionId = await currentApprovalId(tx, companyId, content, config)
      if (schedule.approvalActionId !== approvalActionId) throw conflict('The schedule is not authorized by the current approval.')
      const publicationRecord = await tx.publicationRecord.create({
        data: {
          variantId: variant.id,
          scheduleId: schedule.id,
          scheduledAtSnapshot: schedule.scheduledAt,
          publishedAt: input.publishedAt,
          postUrl: input.postUrl,
          markedBy: actorId,
          recordedAt: now,
        },
      })
      await bumpContent(tx, content.id)
      await appendEvent(tx, {
        contentId: content.id,
        variantId: variant.id,
        actorId,
        eventType: 'publication_recorded',
        metadata: {
          publicationId: publicationRecord.id,
          scheduleId: schedule.id,
          variantId: variant.id,
          platform: variant.platform,
          publishedAt: input.publishedAt.toISOString(),
        },
        requestId,
      })
      const mapped = await readContentFromDb(tx, companyId, content.id, config, now)
      const publication = publicationFromContent(mapped, publicationRecord.id)
      return { resourceId: publicationRecord.id, status: 200, body: { data: { publication, content: mapped } }, etag: etag(mapped.version) }
    },
  })
}

export async function readCalendar(prisma: PrismaClient, companyId: string, query: CalendarQuery, clock: Clock) {
  const asOf = clock.now()
  const rows = await prisma.contentSchedule.findMany({
    where: {
      cancelledAt: null,
      scheduledAt: { gte: query.start, lt: query.end },
      variant: {
        enabled: true,
        ...(query.platform ? { platform: query.platform } : {}),
        content: {
          companyId,
          archivedAt: null,
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.contextType ? { contextType: query.contextType } : {}),
        },
      },
    },
    include: {
      variant: {
        include: {
          publication: true,
          content: {
            include: {
              company: { select: { id: true, name: true } },
              product: { select: { id: true, name: true } },
              brief: { select: { topic: true, pillarCode: true } },
            },
          },
        },
      },
    },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
  })
  const entries = rows.map((row) => {
    const brief = row.variant.content.brief
    if (!brief) throw conflict('Content persistence is incomplete: the required Brief is missing.')
    const publication = row.variant.publication
    const status: CalendarStatus = publication
      ? 'published'
      : row.scheduledAt <= asOf
        ? 'ready_to_publish'
        : 'scheduled'
    return {
      id: row.id,
      contentId: row.variant.content.id,
      variantId: row.variantId,
      platform: row.variant.platform,
      title: titleFrom(row.variant.content.masterContent, brief.topic),
      company: row.variant.content.company,
      product: row.variant.content.product,
      pillarCode: brief.pillarCode,
      scheduledAt: row.scheduledAt.toISOString(),
      timezone: row.timezone,
      status,
      contentVersion: row.variant.content.version,
    }
  }).filter((entry) => !query.status || entry.status === query.status)

  return {
    start: query.start.toISOString(),
    end: query.end.toISOString(),
    asOf: asOf.toISOString(),
    entries,
  }
}

async function currentApprovalId(db: Db, companyId: string, content: CompleteContentRow, config: ContentReadConfig) {
  const freshness = await assessmentFreshness(db, companyId, content, config)
  const approval = await currentApprovalProjection(db, companyId, content, freshness)
  if (!approval || !content.currentApprovalId || content.currentApproval?.editorialRevision !== content.editorialRevision) {
    throw conflict('Current valid human approval is required.')
  }
  return content.currentApprovalId
}

async function findScheduleOwner(db: Db, scheduleId: string) {
  return db.contentSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      variantId: true,
      variant: { select: { contentId: true, content: { select: { companyId: true } } } },
    },
  }).then((row) => row ? { id: row.id, variantId: row.variantId, contentId: row.variant.contentId, companyId: row.variant.content.companyId } : null)
}

async function lockContent(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version"
    FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const row = rows[0]
  if (!row) throw notFound()
  if (row.version !== expectedVersion) throw revisionConflict()
}

async function lockContentVariants(tx: Prisma.TransactionClient, contentId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "platform_variants"
    WHERE "content_id" = CAST(${contentId} AS UUID)
    ORDER BY "id"
    FOR UPDATE
  `
}

async function lockContentSchedules(tx: Prisma.TransactionClient, contentId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT schedules."id"
    FROM "content_schedules" AS schedules
    INNER JOIN "platform_variants" AS variants ON variants."id" = schedules."variant_id"
    WHERE variants."content_id" = CAST(${contentId} AS UUID)
    ORDER BY schedules."id"
    FOR UPDATE OF schedules
  `
}

async function lockVariant(tx: Prisma.TransactionClient, contentId: string, variantId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "platform_variants"
    WHERE "id" = CAST(${variantId} AS UUID) AND "content_id" = CAST(${contentId} AS UUID)
    FOR UPDATE
  `
  if (!rows[0]) throw notFound()
}

async function lockSchedule(tx: Prisma.TransactionClient, scheduleId: string, variantId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "content_schedules"
    WHERE "id" = CAST(${scheduleId} AS UUID) AND "variant_id" = CAST(${variantId} AS UUID)
    FOR UPDATE
  `
  if (!rows[0]) throw notFound()
}

async function lockPublication(tx: Prisma.TransactionClient, publicationId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "publication_records" WHERE "id" = CAST(${publicationId} AS UUID) FOR UPDATE
  `
}

function assertNotArchived(content: CompleteContentRow) {
  if (content.archivedAt) throw conflict('Archived Content cannot be scheduled or published.')
}

function validateScheduleInputs(inputs: ScheduleInput[], now: Date) {
  if (inputs.length === 0) throw validationError('At least one schedule is required.', { schedules: 'Choose at least one platform.' })
  const platforms = new Set<PlatformCode>()
  for (const input of inputs) {
    if (platforms.has(input.platform)) throw validationError('Platforms must be unique in a schedule request.', { schedules: 'Do not submit a platform more than once.' })
    platforms.add(input.platform)
    if (!validDate(input.scheduledAt) || input.scheduledAt.getTime() <= now.getTime()) throw validationError('Scheduled time must be in the future.', { scheduledAt: 'Use a future RFC3339 timestamp.' })
    assertTimezone(input.timezone)
  }
}

function validatePublicationInput(input: PublicationInput, now: Date) {
  if (!validDate(input.publishedAt) || input.publishedAt.getTime() > now.getTime()) throw validationError('Publication time cannot be in the future.', { publishedAt: 'Use a current or past RFC3339 timestamp.' })
  if (input.postUrl !== null) assertPostUrl(input.postUrl)
}

export function assertTimezone(value: string) {
  if (!value.trim()) throw validationError('Timezone is required.', { timezone: 'Use a valid IANA timezone.' })
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
  } catch {
    throw validationError('The timezone is invalid.', { timezone: 'Use a valid IANA timezone such as Asia/Jakarta.' })
  }
}

export function assertPostUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
  } catch {
    throw validationError('The post URL is invalid.', { postUrl: 'Use an HTTP or HTTPS URL, or null.' })
  }
}

function validDate(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

async function bumpContent(tx: Prisma.TransactionClient, contentId: string) {
  await tx.content.update({ where: { id: contentId }, data: { version: { increment: 1 } } })
}

async function appendEvent(tx: Prisma.TransactionClient, input: { contentId: string; variantId: string; actorId: string; eventType: string; metadata: Record<string, unknown>; requestId: string }) {
  await tx.contentEvent.create({
    data: {
      contentId: input.contentId,
      variantId: input.variantId,
      actorId: input.actorId,
      actorKind: 'user',
      eventType: input.eventType,
      metadata: toJson(input.metadata),
      requestId: input.requestId,
    },
  })
}

function publicationFromContent(content: ContentDto, publicationId: string): PublicationDto {
  const publication = content.publications.find((candidate) => candidate.id === publicationId)
  if (!publication) throw conflict('Publication evidence could not be read after the transaction.')
  return publication
}

function titleFrom(value: Prisma.JsonValue | null, fallback: string) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const title = (value as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim()) return title
  }
  return fallback
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
