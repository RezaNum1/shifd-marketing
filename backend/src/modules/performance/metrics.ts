import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { decodeCursor, encodeCursor, etag } from '../context/service.js'
import { mapAsset } from '../assets/service.js'

type Db = PrismaClient | Prisma.TransactionClient

export const PERFORMANCE_PLATFORMS = ['instagram', 'linkedin'] as const
export const INQUIRY_SOURCE = 'manual' as const
export const LINKEDIN_SOURCE = 'linkedin_manual' as const
export const REPORTING_TIMEZONE = 'Asia/Jakarta' as const

export type PerformancePlatform = typeof PERFORMANCE_PLATFORMS[number]

export interface WeeklyMetricInput {
  weekStart: Date
  weekEnd: Date
  followers: number
  reach: number | null
  impressions: number
  likes: number
  comments: number
  saves: number
  publishedPosts: number
  evidenceAssetId: string | null
  notes: string | null
}

export interface InquiryInput {
  weekStart: Date
  weekEnd: Date
  count: number
}

export interface MetricListOptions {
  start?: Date
  end?: Date
  limit: number
  cursor?: { createdAt: Date; id: string }
}

export function parseDateOnly(value: unknown, path: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError('The date is invalid.', { [path]: 'Use YYYY-MM-DD.' })
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw validationError('The date is invalid.', { [path]: 'Use a valid YYYY-MM-DD date.' })
  }
  return date
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function assertCanonicalInterval(weekStart: Date, weekEnd: Date) {
  if (weekStart.getUTCDay() !== 1 || dateOnly(addDays(weekStart, 6)) !== dateOnly(weekEnd)) {
    throw validationError('The reporting interval is invalid.', { weekStart: 'Use a Monday start.', weekEnd: 'Use the following Sunday as weekEnd.' })
  }
}

export function assertReportingTimezone(timezone: string) {
  if (timezone !== REPORTING_TIMEZONE) {
    throw validationError('The reporting timezone is invalid.', { timezone: `New research observations use ${REPORTING_TIMEZONE}.` })
  }
}

export function assertSafeCount(value: unknown, path: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw validationError('Metric counts are invalid.', { [path]: 'Use a non-negative integer.' })
  }
  return value
}

export function assertOptionalSafeCount(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null
  return assertSafeCount(value, path)
}

function assertIntCount(value: number, path: string) {
  return assertSafeCount(value, path, 2_147_483_647)
}

function metricData(input: WeeklyMetricInput, actorId: string, now: Date) {
  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    followers: BigInt(input.followers),
    reach: input.reach === null ? null : BigInt(input.reach),
    impressions: BigInt(input.impressions),
    likes: BigInt(input.likes),
    comments: BigInt(input.comments),
    saves: BigInt(input.saves),
    reportedPublishedPosts: input.publishedPosts,
    source: LINKEDIN_SOURCE,
    evidenceAssetId: input.evidenceAssetId,
    notes: input.notes,
    recordedBy: actorId,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export async function listLinkedInMetrics(prisma: PrismaClient, companyId: string, options: MetricListOptions) {
  const filters: Prisma.WeeklyMetricWhereInput[] = [{ socialAccount: { companyId, platform: 'linkedin' } }]
  if (options.start) filters.push({ weekEnd: { gte: options.start } })
  if (options.end) filters.push({ weekStart: { lte: options.end } })
  if (options.cursor) filters.push({ OR: [{ updatedAt: { lt: options.cursor.createdAt } }, { updatedAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.weeklyMetric.findMany({
    where: { AND: filters },
    include: { socialAccount: { select: { platform: true } }, evidenceAsset: true, recorder: { select: { id: true, name: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const hasNext = rows.length > options.limit
  const page = hasNext ? rows.slice(0, options.limit) : rows
  const last = page.at(-1)
  return {
    data: page.map(mapWeeklyMetric),
    nextCursor: hasNext && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  }
}

export async function createLinkedInMetric(prisma: PrismaClient, companyId: string, actorId: string, input: WeeklyMetricInput) {
  validateWeeklyMetricInput(input)
  return runMetricWrite(prisma, async (tx) => {
    const account = await tx.socialAccount.findFirst({ where: { companyId, platform: 'linkedin' } })
    if (!account) throw notFound()
    assertReportingTimezone(account.reportingTimezone)
    await assertEvidence(tx, companyId, input.evidenceAssetId)
    const now = new Date()
    try {
      const row = await tx.weeklyMetric.create({
        data: { socialAccountId: account.id, ...metricData(input, actorId, now) },
        include: { socialAccount: { select: { platform: true } }, evidenceAsset: true, recorder: { select: { id: true, name: true } } },
      })
      return { status: 201 as const, body: { data: mapWeeklyMetric(row) }, etag: etag(row.version) }
    } catch (error) {
      throw mapMetricConstraint(error)
    }
  })
}

export async function updateLinkedInMetric(prisma: PrismaClient, companyId: string, actorId: string, metricId: string, expectedVersion: number, input: WeeklyMetricInput) {
  validateWeeklyMetricInput(input)
  return runMetricWrite(prisma, async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; version: number }>>`
      SELECT metrics."id", metrics."version"
      FROM "weekly_metrics" AS metrics
      INNER JOIN "social_accounts" AS accounts ON accounts."id" = metrics."social_account_id"
      WHERE metrics."id" = CAST(${metricId} AS UUID)
        AND accounts."company_id" = CAST(${companyId} AS UUID)
        AND accounts."platform" = 'linkedin'
      FOR UPDATE OF metrics
    `
    const current = locked[0]
    if (!current) throw notFound()
    if (current.version !== expectedVersion) throw revisionConflict()
    const currentRow = await tx.weeklyMetric.findUnique({ where: { id: metricId }, include: { socialAccount: true } })
    if (!currentRow) throw notFound()
    assertReportingTimezone(currentRow.socialAccount.reportingTimezone)
    await assertEvidence(tx, companyId, input.evidenceAssetId)
    const now = new Date()
    try {
      const row = await tx.weeklyMetric.update({
        where: { id: metricId },
        data: {
          weekStart: input.weekStart,
          weekEnd: input.weekEnd,
          followers: BigInt(input.followers),
          reach: input.reach === null ? null : BigInt(input.reach),
          impressions: BigInt(input.impressions),
          likes: BigInt(input.likes),
          comments: BigInt(input.comments),
          saves: BigInt(input.saves),
          reportedPublishedPosts: input.publishedPosts,
          source: LINKEDIN_SOURCE,
          evidenceAssetId: input.evidenceAssetId,
          notes: input.notes,
          recordedBy: actorId,
          updatedAt: now,
          version: { increment: 1 },
        },
        include: { socialAccount: { select: { platform: true } }, evidenceAsset: true, recorder: { select: { id: true, name: true } } },
      })
      return { status: 200 as const, body: { data: mapWeeklyMetric(row) }, etag: etag(row.version) }
    } catch (error) {
      throw mapMetricConstraint(error)
    }
  })
}

export async function listInquiries(prisma: PrismaClient, companyId: string, options: MetricListOptions) {
  const filters: Prisma.InboundInquiryMetricWhereInput[] = [{ socialAccount: { companyId, platform: 'whatsapp' } }]
  if (options.start) filters.push({ weekEnd: { gte: options.start } })
  if (options.end) filters.push({ weekStart: { lte: options.end } })
  if (options.cursor) filters.push({ OR: [{ updatedAt: { lt: options.cursor.createdAt } }, { updatedAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.inboundInquiryMetric.findMany({
    where: { AND: filters },
    include: { socialAccount: { select: { platform: true } }, recorder: { select: { id: true, name: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const hasNext = rows.length > options.limit
  const page = hasNext ? rows.slice(0, options.limit) : rows
  const last = page.at(-1)
  return {
    data: page.map(mapInquiry),
    nextCursor: hasNext && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  }
}

export async function createInquiry(prisma: PrismaClient, companyId: string, actorId: string, input: InquiryInput) {
  validateInquiryInput(input)
  return runMetricWrite(prisma, async (tx) => {
    const account = await tx.socialAccount.findFirst({ where: { companyId, platform: 'whatsapp' } })
    if (!account) throw notFound()
    assertReportingTimezone(account.reportingTimezone)
    const now = new Date()
    try {
      const row = await tx.inboundInquiryMetric.create({
        data: { socialAccountId: account.id, weekStart: input.weekStart, weekEnd: input.weekEnd, count: input.count, source: INQUIRY_SOURCE, recordedBy: actorId, createdAt: now, updatedAt: now, version: 1 },
        include: { socialAccount: { select: { platform: true } }, recorder: { select: { id: true, name: true } } },
      })
      return { status: 201 as const, body: { data: mapInquiry(row) }, etag: etag(row.version) }
    } catch (error) {
      throw mapMetricConstraint(error)
    }
  })
}

export async function updateInquiry(prisma: PrismaClient, companyId: string, actorId: string, metricId: string, expectedVersion: number, input: InquiryInput) {
  validateInquiryInput(input)
  return runMetricWrite(prisma, async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; version: number }>>`
      SELECT inquiries."id", inquiries."version"
      FROM "inbound_inquiry_metrics" AS inquiries
      INNER JOIN "social_accounts" AS accounts ON accounts."id" = inquiries."social_account_id"
      WHERE inquiries."id" = CAST(${metricId} AS UUID)
        AND accounts."company_id" = CAST(${companyId} AS UUID)
        AND accounts."platform" = 'whatsapp'
      FOR UPDATE OF inquiries
    `
    const current = locked[0]
    if (!current) throw notFound()
    if (current.version !== expectedVersion) throw revisionConflict()
    const currentRow = await tx.inboundInquiryMetric.findUnique({ where: { id: metricId }, include: { socialAccount: true } })
    if (!currentRow) throw notFound()
    assertReportingTimezone(currentRow.socialAccount.reportingTimezone)
    const now = new Date()
    try {
      const row = await tx.inboundInquiryMetric.update({
        where: { id: metricId },
        data: { weekStart: input.weekStart, weekEnd: input.weekEnd, count: input.count, source: INQUIRY_SOURCE, recordedBy: actorId, updatedAt: now, version: { increment: 1 } },
        include: { socialAccount: { select: { platform: true } }, recorder: { select: { id: true, name: true } } },
      })
      return { status: 200 as const, body: { data: mapInquiry(row) }, etag: etag(row.version) }
    } catch (error) {
      throw mapMetricConstraint(error)
    }
  })
}

export function validateWeeklyMetricInput(input: WeeklyMetricInput) {
  assertCanonicalInterval(input.weekStart, input.weekEnd)
  assertSafeCount(input.followers, 'followers')
  assertOptionalSafeCount(input.reach, 'reach')
  assertSafeCount(input.impressions, 'impressions')
  assertSafeCount(input.likes, 'likes')
  assertSafeCount(input.comments, 'comments')
  assertSafeCount(input.saves, 'saves')
  assertIntCount(input.publishedPosts, 'publishedPosts')
  if (input.notes !== null && input.notes.length > 4_000) throw validationError('The metric note is too long.', { notes: 'Use at most 4000 characters.' })
}

export function validateInquiryInput(input: InquiryInput) {
  assertCanonicalInterval(input.weekStart, input.weekEnd)
  assertIntCount(input.count, 'count')
}

export function mapWeeklyMetric(row: {
  id: string
  socialAccountId: string
  weekStart: Date
  weekEnd: Date
  followers: bigint
  reach: bigint | null
  impressions: bigint
  likes: bigint
  comments: bigint
  saves: bigint
  reportedPublishedPosts: number
  source: string
  evidenceAssetId: string | null
  notes: string | null
  recordedBy: string | null
  createdAt: Date
  updatedAt: Date
  version: number
  socialAccount: { platform: string }
  evidenceAsset?: Parameters<typeof mapAsset>[0] | null
  recorder?: { id: string; name: string } | null
}) {
  const engagements = Number(row.likes + row.comments + row.saves)
  const impressions = Number(row.impressions)
  return {
    id: row.id,
    socialAccountId: row.socialAccountId,
    platform: row.socialAccount.platform,
    weekStart: dateOnly(row.weekStart),
    weekEnd: dateOnly(row.weekEnd),
    followers: Number(row.followers),
    reach: row.reach === null ? null : Number(row.reach),
    impressions,
    likes: Number(row.likes),
    comments: Number(row.comments),
    saves: Number(row.saves),
    engagements,
    engagementRate: impressions > 0 ? (engagements / impressions) * 100 : null,
    publishedPosts: row.reportedPublishedPosts,
    reportedPublishedPosts: row.reportedPublishedPosts,
    source: row.source,
    evidenceAssetId: row.evidenceAssetId,
    evidence: row.evidenceAsset ? mapAsset(row.evidenceAsset) : null,
    notes: row.notes,
    recordedBy: row.recorder ?? (row.recordedBy ? { id: row.recordedBy, name: '' } : null),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapInquiry(row: {
  id: string
  socialAccountId: string
  weekStart: Date
  weekEnd: Date
  count: number
  source: string
  recordedBy: string | null
  createdAt: Date
  updatedAt: Date
  version: number
  socialAccount: { platform: string }
  recorder?: { id: string; name: string } | null
}) {
  return {
    id: row.id,
    socialAccountId: row.socialAccountId,
    channel: 'whatsapp',
    weekStart: dateOnly(row.weekStart),
    weekEnd: dateOnly(row.weekEnd),
    count: row.count,
    source: row.source,
    recordedBy: row.recorder ?? (row.recordedBy ? { id: row.recordedBy, name: '' } : null),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function assertEvidence(db: Db, companyId: string, evidenceAssetId: string | null) {
  if (!evidenceAssetId) return
  const asset = await db.creativeAsset.findFirst({ where: { id: evidenceAssetId, companyId, purpose: 'metric_evidence', state: 'ready' } })
  if (!asset) throw validationError('The metric evidence is invalid.', { evidenceAssetId: 'Choose a ready metric_evidence Asset from this company.' })
}

async function runMetricWrite<T>(prisma: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(callback)
}

function mapMetricConstraint(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2004'].includes(error.code)) throw conflict('The reporting interval overlaps an existing observation.')
  throw error
}

// Keep the route parser independent from this module's cursor implementation;
// re-exporting here makes the endpoint wiring use the same cursor contract as
// the rest of the backend.
export { decodeCursor }
