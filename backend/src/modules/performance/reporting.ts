import { Prisma, type PrismaClient } from '@prisma/client'
import { readContentFromDb } from '../content/service.js'
import { mapInquiry, dateOnly, addDays, type PerformancePlatform } from './metrics.js'

export interface ReportingOptions {
  anthropicModel: string | null
  asOf: Date
}

type MetricRow = {
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
  socialAccount: { id: string; platform: string; reportingTimezone: string }
}

type InquiryRow = {
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
  socialAccount: { id: string; platform: string; reportingTimezone: string }
  recorder?: { id: string; name: string } | null
}

type PublicationRow = {
  id: string
  variantId: string
  scheduleId: string
  scheduledAtSnapshot: Date
  publishedAt: Date
  postUrl: string | null
  markedBy: string
  recordedAt: Date
  updatedAt: Date
  version: number
  marker: { id: string; name: string }
  variant: {
    id: string
    platform: string
    content: {
      id: string
      companyId: string
      masterContent: Prisma.JsonValue | null
      brief: { topic: string; pillarCode: string } | null
    }
  }
}

type ScheduleRow = {
  id: string
  variantId: string
  scheduledAt: Date
  timezone: string
  cancelledAt: Date | null
  cancellationReason: string | null
  approvalActionId: string
  version: number
  variant: {
    id: string
    platform: string
    enabled: boolean
    publication: { id: string; publishedAt: Date; scheduledAtSnapshot: Date } | null
    content: {
      id: string
      companyId: string
      version: number
      archivedAt: Date | null
      masterContent: Prisma.JsonValue | null
      brief: { topic: string; pillarCode: string } | null
      company: { id: string; name: string }
      product: { id: string; name: string } | null
    }
  }
}

type ContentProjection = Awaited<ReturnType<typeof readContentFromDb>>

interface ReportingSnapshot {
  company: {
    id: string
    name: string
    description: string
    reportingTimezone: string
    brandProfile: { brandVoice: string | null; toneDescription: string | null; preferredLanguage: string } | null
  }
  accounts: Array<{ id: string; platform: string; reportingTimezone: string }>
  metrics: MetricRow[]
  inquiries: InquiryRow[]
  publications: PublicationRow[]
  schedules: ScheduleRow[]
  contents: ContentProjection[]
  ideas: Array<{
    id: string
    companyId: string
    title: string
    contextType: string
    productId: string | null
    pillarCode: string
    objective: string
    targetAudience: string | null
    notes: string | null
    status: string
    version: number
    createdAt: Date
    updatedAt: Date
    sourceContents: Array<{ id: string }>
  }>
  readyIdeaCount: number
  activeProducts: number
}

export type ReportPlatform = 'combined' | 'instagram' | 'linkedin'

export async function loadReportingSnapshot(prisma: PrismaClient, companyId: string, options: ReportingOptions): Promise<ReportingSnapshot> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, include: { brandProfile: { select: { brandVoice: true, toneDescription: true, preferredLanguage: true } } } })
    if (!company) throw new Error('Company disappeared while building a report.')
    const accounts = await tx.socialAccount.findMany({ where: { companyId }, select: { id: true, platform: true, reportingTimezone: true } })
    const metrics = await tx.weeklyMetric.findMany({
      where: { socialAccount: { companyId } },
      include: { socialAccount: { select: { id: true, platform: true, reportingTimezone: true } } },
      orderBy: [{ weekStart: 'asc' }, { id: 'asc' }],
    }) as unknown as MetricRow[]
    const inquiries = await tx.inboundInquiryMetric.findMany({
      where: { socialAccount: { companyId } },
      include: { socialAccount: { select: { id: true, platform: true, reportingTimezone: true } }, recorder: { select: { id: true, name: true } } },
      orderBy: [{ weekStart: 'asc' }, { id: 'asc' }],
    }) as unknown as InquiryRow[]
    const publications = await tx.publicationRecord.findMany({
      where: { variant: { content: { companyId } } },
      include: {
        marker: { select: { id: true, name: true } },
        variant: { select: { id: true, platform: true, content: { select: { id: true, companyId: true, masterContent: true, brief: { select: { topic: true, pillarCode: true } } } } } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    }) as unknown as PublicationRow[]
    const schedules = await tx.contentSchedule.findMany({
      where: { variant: { content: { companyId } } },
      include: {
        variant: {
          select: {
            id: true,
            platform: true,
            enabled: true,
            publication: { select: { id: true, publishedAt: true, scheduledAtSnapshot: true } },
            content: {
              select: {
                id: true,
                companyId: true,
                version: true,
                archivedAt: true,
                masterContent: true,
                brief: { select: { topic: true, pillarCode: true } },
                company: { select: { id: true, name: true } },
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    }) as unknown as ScheduleRow[]
    const contentIds = await tx.content.findMany({ where: { companyId }, select: { id: true }, orderBy: { id: 'asc' } })
    const contents = await Promise.all(contentIds.map((row) => readContentFromDb(tx, companyId, row.id, { anthropicModel: options.anthropicModel }, options.asOf)))
    const ideas = await tx.contentIdea.findMany({ where: { companyId, status: 'ready' }, include: { sourceContents: { select: { id: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 3 })
    const readyIdeaCount = await tx.contentIdea.count({ where: { companyId, status: 'ready' } })
    const activeProducts = await tx.product.count({ where: { companyId, status: 'active' } })
    return { company: { id: company.id, name: company.name, description: company.description, reportingTimezone: company.reportingTimezone, brandProfile: company.brandProfile }, accounts, metrics, inquiries, publications, schedules, contents, ideas, readyIdeaCount, activeProducts }
  })
}

export function buildPerformanceReport(snapshot: ReportingSnapshot, requestedWeeks: 4 | 8 | 12, platform: ReportPlatform, asOf: Date) {
  const weeks = selectRecordedWeeks(snapshot.metrics, requestedWeeks)
  const timezone = snapshot.company.reportingTimezone || 'Asia/Jakarta'
  const bounds = intervalBounds(weeks, timezone)
  const selectedMetrics = snapshot.metrics.filter((metric) => weeks.includes(dateOnly(metric.weekStart)))
  const relevantMetrics = platform === 'combined' ? selectedMetrics.filter((metric) => isPerformancePlatform(metric.socialAccount.platform)) : selectedMetrics.filter((metric) => metric.socialAccount.platform === platform)
  const weekly = weeks.map((weekStart) => weeklyRow(selectedMetrics, weekStart, platform))
  const followers = ['instagram', 'linkedin'].map((item) => followerSeries(selectedMetrics, item as PerformancePlatform))
  const published = publicationCounts(snapshot.publications, selectedMetrics, snapshot.metrics, platform, bounds, timezone)
  const consistency = (['instagram', 'linkedin'] as const).map((item) => {
    const counts = publicationCounts(snapshot.publications, selectedMetrics.filter((metric) => metric.socialAccount.platform === item), snapshot.metrics.filter((metric) => metric.socialAccount.platform === item), item, bounds, timezone)
    const expected = requestedWeeks * 2
    const percent = expected > 0 ? (counts.effectivePosts / expected) * 100 : 0
    return { platform: item, published: counts, targetPerWeek: 2, weeks: requestedWeeks, expected, percent, visualPercent: Math.min(100, Math.max(0, percent)) }
  })
  const summary = {
    latestWeeklyReach: weekly.at(-1)?.reach ?? null,
    impressions: sum(relevantMetrics.map((metric) => Number(metric.impressions))),
    engagements: sum(relevantMetrics.map(engagements)),
    engagementRate: percentage(sum(relevantMetrics.map(engagements)), sum(relevantMetrics.map((metric) => Number(metric.impressions)))),
    published,
  }
  const periodStart = bounds ? bounds.start : null
  const periodEnd = bounds ? bounds.end : null
  return {
    period: {
      basis: 'latest_recorded_intervals' as const,
      requestedWeeks,
      start: periodStart?.toISOString() ?? null,
      end: periodEnd?.toISOString() ?? null,
      recordedWeekStarts: weeks,
      timezone,
      asOf: asOf.toISOString(),
    },
    platform,
    summary,
    followers,
    weekly,
    consistency,
    execution: executionSummary(snapshot.schedules, platform, bounds),
    contentOutput: contentOutput(snapshot.contents),
    inquiries: { channel: 'whatsapp' as const, kind: 'supplementary' as const, weeks: snapshot.inquiries.filter((row) => weeks.includes(dateOnly(row.weekStart))).map(mapInquiry) },
  }
}

export function buildOverviewReport(snapshot: ReportingSnapshot, asOf: Date) {
  const performance = buildPerformanceReport(snapshot, 8, 'combined', asOf)
  const timezone = snapshot.company.reportingTimezone || 'Asia/Jakarta'
  const thisWeek = localWeekBounds(asOf, timezone)
  const thisWeekConsistency = (['instagram', 'linkedin'] as const).map((platform) => {
    const metrics = snapshot.metrics.filter((metric) => metric.socialAccount.platform === platform && localDateInRange(dateOnly(metric.weekStart), thisWeek.localStart, thisWeek.localEnd))
    const counts = publicationCounts(snapshot.publications, metrics, snapshot.metrics.filter((metric) => metric.socialAccount.platform === platform), platform, thisWeek, timezone)
    const expected = 2
    const percent = (counts.effectivePosts / expected) * 100
    return { platform, published: counts, targetPerWeek: 2, weeks: 1, expected, percent, visualPercent: Math.min(100, Math.max(0, percent)) }
  })
  const allHistory = publicationCounts(snapshot.publications, snapshot.metrics, snapshot.metrics, 'combined', null, timezone)
  const actionableSchedules = snapshot.schedules.filter((row) => isActionableSchedule(row))
  const needsReviewCampaigns = snapshot.contents.filter((content) => content.archivedAt === null && ['Ready for Review', 'Needs Revision'].includes(content.lifecycleStatus)).length
  const upcoming = actionableSchedules.filter((row) => row.scheduledAt >= asOf).slice(0, 5).map((row) => calendarEntry(row, asOf))
  const readyToPublish = actionableSchedules.filter((row) => row.scheduledAt <= asOf).length
  return {
    asOf: asOf.toISOString(),
    timezone,
    plannedPlatformSchedules: actionableSchedules.length,
    needsReviewCampaigns,
    published: allHistory,
    publishedPeriod: { basis: 'all_history' as const },
    thisWeek: { start: thisWeek.start.toISOString(), end: thisWeek.end.toISOString(), consistency: thisWeekConsistency },
    performanceSnapshot: { summary: performance.summary, followers: performance.followers, period: performance.period },
    upcoming,
    recentlyPublished: snapshot.publications.slice(0, 5).map((row) => recentPublication(row, snapshot.metrics, snapshot.accounts)),
    readyToPublish,
    ideas: { readyCount: snapshot.readyIdeaCount, latest: snapshot.ideas.slice(0, 3).map(mapIdea) },
    context: {
      companyConfigured: Boolean(snapshot.company.name.trim() && snapshot.company.description.trim()),
      brandConfigured: Boolean(snapshot.company.brandProfile?.brandVoice?.trim() && snapshot.company.brandProfile.toneDescription?.trim() && snapshot.company.brandProfile.preferredLanguage.trim()),
      activeProducts: snapshot.activeProducts,
    },
  }
}

export interface PublicationListOptions {
  platform?: PerformancePlatform
  start?: Date
  end?: Date
  contentId?: string
  limit: number
  cursor?: { createdAt: Date; id: string }
}

export async function listRecentPublications(prisma: PrismaClient, companyId: string, options: PublicationListOptions) {
  const filters: Prisma.PublicationRecordWhereInput[] = [{ variant: { content: { companyId } } }]
  if (options.platform) filters.push({ variant: { platform: options.platform } })
  if (options.start) filters.push({ publishedAt: { gte: options.start } })
  if (options.end) filters.push({ publishedAt: { lt: options.end } })
  if (options.contentId) filters.push({ variant: { contentId: options.contentId } })
  if (options.cursor) filters.push({ OR: [{ publishedAt: { lt: options.cursor.createdAt } }, { publishedAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.publicationRecord.findMany({
    where: { AND: filters },
    include: {
      marker: { select: { id: true, name: true } },
      variant: { select: { id: true, platform: true, content: { select: { id: true, companyId: true, masterContent: true, brief: { select: { topic: true, pillarCode: true } } } } } },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  }) as unknown as PublicationRow[]
  const hasNext = rows.length > options.limit
  const page = hasNext ? rows.slice(0, options.limit) : rows
  const accounts = await prisma.socialAccount.findMany({ where: { companyId }, select: { id: true, platform: true, reportingTimezone: true } })
  const metrics = await prisma.weeklyMetric.findMany({ where: { socialAccount: { companyId } }, include: { socialAccount: { select: { id: true, platform: true, reportingTimezone: true } } } }) as unknown as MetricRow[]
  const last = page.at(-1)
  return {
    data: page.map((row) => recentPublication(row, metrics, accounts)),
    nextCursor: hasNext && last ? { createdAt: last.publishedAt, id: last.id } : null,
  }
}

export function calendarEntry(row: ScheduleRow, asOf: Date) {
  const content = row.variant.content
  const brief = content.brief
  if (!brief) throw new Error('Content persistence is incomplete: the required Brief is missing.')
  const status = row.variant.publication ? 'published' : row.scheduledAt <= asOf ? 'ready_to_publish' : 'scheduled'
  return {
    id: row.id,
    contentId: content.id,
    variantId: row.variantId,
    platform: row.variant.platform,
    title: titleFrom(content.masterContent, brief.topic),
    company: content.company,
    product: content.product,
    pillarCode: brief.pillarCode,
    scheduledAt: row.scheduledAt.toISOString(),
    timezone: row.timezone,
    status,
    contentVersion: content.version,
  }
}

function selectRecordedWeeks(metrics: MetricRow[], requestedWeeks: number) {
  return [...new Set(metrics.filter((metric) => isPerformancePlatform(metric.socialAccount.platform)).map((metric) => dateOnly(metric.weekStart)))].sort().slice(-requestedWeeks)
}

function weeklyRow(metrics: MetricRow[], weekStart: string, platform: ReportPlatform) {
  const candidates = metrics.filter((metric) => dateOnly(metric.weekStart) === weekStart && (platform === 'combined' ? isPerformancePlatform(metric.socialAccount.platform) : metric.socialAccount.platform === platform))
  const reference = candidates[0] ?? metrics.find((metric) => dateOnly(metric.weekStart) === weekStart)
  const impressions = candidates.length ? sum(candidates.map((metric) => Number(metric.impressions))) : null
  const engagement = candidates.length ? sum(candidates.map(engagements)) : null
  const reachValues = candidates.map((metric) => metric.reach).filter((value): value is bigint => value !== null)
  const reach = candidates.length && reachValues.length ? sum(reachValues.map(Number)) : null
  const sources = [...new Set(candidates.map((metric) => metric.source))]
  return {
    weekStart,
    weekEnd: reference ? dateOnly(reference.weekEnd) : dateOnly(addDays(new Date(`${weekStart}T00:00:00.000Z`), 6)),
    platform,
    followers: platform === 'combined' || !candidates[0] ? null : Number(candidates[0].followers),
    reach,
    impressions,
    engagements: engagement,
    engagementRate: engagement === null || impressions === null ? null : percentage(engagement, impressions),
    source: sources.length === 0 ? null : sources.length === 1 ? sources[0] : 'mixed',
    coverage: candidates.length ? 'recorded' as const : 'missing' as const,
  }
}

function followerSeries(metrics: MetricRow[], platform: PerformancePlatform) {
  const rows = metrics.filter((metric) => metric.socialAccount.platform === platform).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime() || a.id.localeCompare(b.id))
  const first = rows[0]
  const last = rows.at(-1)
  const start = first ? Number(first.followers) : null
  const end = last ? Number(last.followers) : null
  const change = start !== null && end !== null ? end - start : null
  return {
    platform,
    startObservationDate: first ? dateOnly(first.weekStart) : null,
    endObservationDate: last ? dateOnly(last.weekStart) : null,
    start,
    end,
    change,
    changePercent: start !== null && end !== null && start !== 0 ? (change! / start) * 100 : null,
  }
}

function publicationCounts(publications: PublicationRow[], selectedMetrics: MetricRow[], allMetrics: MetricRow[], platform: ReportPlatform, bounds: { start: Date; end: Date; localStart: string; localEnd: string } | null, timezone: string) {
  const metrics = allMetrics.filter((metric) => selectedMetrics.some((selected) => selected.id === metric.id) && (platform === 'combined' ? isPerformancePlatform(metric.socialAccount.platform) : metric.socialAccount.platform === platform))
  const platformPublications = publications.filter((publication) => platform === 'combined' ? isPerformancePlatform(publication.variant.platform) : publication.variant.platform === platform)
  const scoped = bounds ? platformPublications.filter((publication) => localDateInRange(publicationDate(publication, timezone), bounds.localStart, bounds.localEnd)) : platformPublications
  const matched = new Set<string>()
  let reportedPosts = 0
  let effectivePosts = 0
  for (const metric of metrics) {
    const metricPublications = scoped.filter((publication) => publication.variant.platform === metric.socialAccount.platform && localDateInRange(publicationDate(publication, metric.socialAccount.reportingTimezone), dateOnly(metric.weekStart), dateOnly(addDays(metric.weekEnd, 1))))
    metricPublications.forEach((publication) => matched.add(publication.id))
    const reported = metric.reportedPublishedPosts
    reportedPosts += reported
    effectivePosts += Math.max(metricPublications.length, reported)
  }
  const unmatched = scoped.filter((publication) => !matched.has(publication.id)).length
  return { explicitPosts: scoped.length, reportedPosts, effectivePosts: effectivePosts + unmatched, basis: 'max_per_account_interval' as const }
}

function executionSummary(schedules: ScheduleRow[], platform: ReportPlatform, bounds: { start: Date; end: Date; localStart: string; localEnd: string } | null) {
  if (!bounds) return { periodBasis: 'schedule_cohort' as const, planned: 0, publishedWithinCohort: 0, pending: 0, onTime: 0 }
  const cohort = schedules.filter((row) => isCohortSchedule(row) && (platform === 'combined' || row.variant.platform === platform) && row.scheduledAt >= bounds.start && row.scheduledAt < bounds.end)
  const publishedWithinCohort = cohort.filter((row) => Boolean(row.variant.publication)).length
  const onTime = cohort.filter((row) => row.variant.publication && row.variant.publication.publishedAt <= row.variant.publication.scheduledAtSnapshot).length
  return { periodBasis: 'schedule_cohort' as const, planned: cohort.length, publishedWithinCohort, pending: cohort.length - publishedWithinCohort, onTime }
}

function contentOutput(contents: ContentProjection[]) {
  return {
    basis: 'campaigns' as const,
    scope: 'all_saved' as const,
    created: contents.length,
    approved: contents.filter((content) => ['Approved', 'Scheduled', 'Published'].includes(content.lifecycleStatus)).length,
    scheduled: contents.filter((content) => content.lifecycleStatus === 'Scheduled').length,
    published: contents.filter((content) => content.lifecycleStatus === 'Published').length,
  }
}

function recentPublication(row: PublicationRow, metrics: MetricRow[], accounts: Array<{ id: string; platform: string; reportingTimezone: string }>) {
  const platform = row.variant.platform
  const account = accounts.find((candidate) => candidate.platform === platform)
  const metric = account ? metrics.find((candidate) => candidate.socialAccountId === account.id && localDateInRange(publicationDate(row, account.reportingTimezone), dateOnly(candidate.weekStart), dateOnly(addDays(candidate.weekEnd, 1)))) : undefined
  return {
    publication: mapPublication(row),
    content: { id: row.variant.content.id, title: titleFrom(row.variant.content.masterContent, row.variant.content.brief?.topic ?? 'Untitled Content') },
    platformMetricsForPublicationWeek: metric ? {
      weekStart: dateOnly(metric.weekStart),
      weekEnd: dateOnly(metric.weekEnd),
      reach: metric.reach === null ? null : Number(metric.reach),
      impressions: Number(metric.impressions),
      engagements: engagements(metric),
      source: metric.source,
      scope: 'platform_account_week' as const,
    } : null,
  }
}

function mapPublication(row: PublicationRow) {
  return {
    id: row.id,
    contentId: row.variant.content.id,
    variantId: row.variantId,
    platform: row.variant.platform,
    scheduleId: row.scheduleId,
    scheduledAt: row.scheduledAtSnapshot.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
    postUrl: row.postUrl,
    markedBy: row.marker,
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  }
}

function mapIdea(idea: ReportingSnapshot['ideas'][number]) {
  return {
    id: idea.id,
    companyId: idea.companyId,
    title: idea.title,
    contextType: idea.contextType,
    productId: idea.productId,
    pillarCode: idea.pillarCode,
    objective: idea.objective,
    targetAudience: idea.targetAudience,
    notes: idea.notes,
    status: idea.status,
    relatedContentIds: idea.sourceContents.map((content) => content.id),
    version: idea.version,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  }
}

function intervalBounds(weeks: string[], timezone: string) {
  const start = weeks[0]
  const end = weeks.at(-1)
  if (!start || !end) return null
  const endDate = new Date(`${end}T00:00:00.000Z`)
  return { start: zonedMidnight(start, timezone), end: zonedMidnight(dateOnly(addDays(endDate, 7)), timezone), localStart: start, localEnd: dateOnly(addDays(endDate, 7)) }
}

function localWeekBounds(asOf: Date, timezone: string) {
  const local = localDateParts(asOf, timezone)
  const date = new Date(`${local}T00:00:00.000Z`)
  const daysFromMonday = (date.getUTCDay() + 6) % 7
  const startDate = addDays(date, -daysFromMonday)
  const endDate = addDays(startDate, 7)
  const localStart = dateOnly(startDate)
  const localEnd = dateOnly(endDate)
  return { start: zonedMidnight(localStart, timezone), end: zonedMidnight(localEnd, timezone), localStart, localEnd }
}

function zonedMidnight(localDate: string, timezone: string) {
  if (timezone === 'Asia/Jakarta') return new Date(`${localDate}T00:00:00.000+07:00`)
  return new Date(`${localDate}T00:00:00.000Z`)
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function publicationDate(row: PublicationRow, timezone = 'Asia/Jakarta') {
  return localDateParts(row.publishedAt, timezone)
}

function localDateInRange(date: string, start: string, end: string) {
  return date >= start && date < end
}

function isPerformancePlatform(value: string): value is PerformancePlatform {
  return value === 'instagram' || value === 'linkedin'
}

function isActionableSchedule(row: ScheduleRow) {
  return row.cancelledAt === null && row.variant.enabled && row.variant.publication === null && row.variant.content.archivedAt === null
}

function isCohortSchedule(row: ScheduleRow) {
  return row.cancelledAt === null && row.variant.enabled && row.variant.content.archivedAt === null
}

function titleFrom(value: Prisma.JsonValue | null, fallback: string) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const title = (value as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim()) return title
  }
  return fallback
}

function engagements(metric: Pick<MetricRow, 'likes' | 'comments' | 'saves'>) {
  return Number(metric.likes + metric.comments + metric.saves)
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? null : (numerator / denominator) * 100
}
