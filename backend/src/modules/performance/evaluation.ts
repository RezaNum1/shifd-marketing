import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, notFound, validationError } from '../../shared/errors/AppError.js'

const DAY = 24 * 60 * 60 * 1000
const DEFINITION_SET = {
  periodDays: 28,
  cadenceTarget: 2,
  cadenceUnit: 'published posts per week per platform',
  coefficientOfVariation: 'population standard deviation divided by mean weekly published posts; N/A when mean is zero',
  baseline: '28 local calendar days immediately before evaluation start',
  intervention: '28 local calendar days beginning on evaluation start',
  linkedinEngagementRate: 'Native value recorded from LinkedIn Analytics; no dashboard reconstruction',
}

export function localDayStart(date: string, timezone: string): Date {
  const year = Number(date.slice(0, 4)); const month = Number(date.slice(5, 7)); const day = Number(date.slice(8, 10))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !year || !month || !day || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) throw validationError('Evaluation start date must be a valid YYYY-MM-DD date.')
  const target = Date.UTC(year, month - 1, day)
  let guess = target
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]))
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    guess += target - localAsUtc
  }
  return new Date(guess)
}

export function addLocalDays(date: string, days: number): string {
  const year = Number(date.slice(0, 4)); const month = Number(date.slice(5, 7)); const day = Number(date.slice(8, 10))
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

function localDateAt(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

export function evaluationPeriods(startDate: string, timezone: string) {
  const baselineStart = addLocalDays(startDate, -28)
  const interventionEnd = addLocalDays(startDate, 28)
  return {
    timezone,
    baseline: { start: localDayStart(baselineStart, timezone), end: localDayStart(startDate, timezone), startDate: baselineStart, endDate: startDate },
    intervention: { start: localDayStart(startDate, timezone), end: localDayStart(interventionEnd, timezone), startDate, endDate: interventionEnd },
    week0At: localDayStart(startDate, timezone),
    week4At: localDayStart(interventionEnd, timezone),
  }
}

export function compareValues(baseline: number | null, intervention: number | null, interventionComplete: boolean) {
  if (baseline === null || intervention === null || !interventionComplete) return { baseline, intervention, absoluteChange: null, percentageChange: null, status: interventionComplete ? 'missing' : 'partial' }
  const absoluteChange = intervention - baseline
  return { baseline, intervention, absoluteChange, percentageChange: baseline > 0 ? (absoluteChange / baseline) * 100 : null, status: 'complete' }
}

export function weeklyPublicationKpis(publications: Array<{ platform: string; publishedAt: Date; contentId: string }>, platform: 'instagram' | 'linkedin', start: Date, end: Date, complete: boolean, timezone = 'Asia/Jakarta') {
  const startDate = localDateAt(start, timezone)
  const counts = Array.from({ length: 4 }, (_, week) => {
    const weekStart = localDayStart(addLocalDays(startDate, week * 7), timezone)
    const weekEnd = new Date(Math.min(end.getTime(), localDayStart(addLocalDays(startDate, (week + 1) * 7), timezone).getTime()))
    return publications.filter((item) => item.platform === platform && item.publishedAt >= weekStart && item.publishedAt < weekEnd).length
  })
  const total = counts.reduce((sum, value) => sum + value, 0)
  const weeksMeetingTarget = counts.filter((value) => value >= 2).length
  const mean = total / 4
  const deviation = Math.sqrt(counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 4)
  return { platform, weeklyCounts: counts, total, targetPerWeek: 2, weeksMeetingTarget, cadenceComplianceRate: complete ? weeksMeetingTarget / 4 * 100 : null, meanWeeklyPosts: mean, coefficientOfVariation: mean === 0 ? null : deviation / mean, status: complete ? 'complete' : 'partial', source: 'publication_records' }
}

export function productionTimeStats(minutes: number[]) {
  if (!minutes.length) return { count: 0, median: null, minimum: null, maximum: null, observations: [] as number[], status: 'missing' }
  const sorted = [...minutes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return { count: sorted.length, median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2, minimum: sorted[0]!, maximum: sorted.at(-1)!, observations: sorted, status: 'complete' }
}

export function isWithinHalfOpenPeriod(value: Date, start: Date, endExclusive: Date) {
  return value >= start && value < endExclusive
}

function isoBounds(bounds: { start: Date; end: Date }) { return { gte: bounds.start, lt: bounds.end } }
function sumCounts(rows: Array<{ count: number }>) { return rows.reduce((total, row) => total + row.count, 0) }
function eventCount(rows: Array<{ activityType: string; status: string; responseClassification: string | null; provenance: string }>, type: string, predicate: (row: typeof rows[number]) => boolean = () => true) { return rows.filter((row) => row.activityType === type && predicate(row)).length }

export async function readEvaluation(prisma: PrismaClient, companyId: string, now: Date) {
  const [company, evaluation] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { reportingTimezone: true } }),
    prisma.marketingEvaluation.findFirst({ where: { companyId }, orderBy: [{ revision: 'desc' }], include: { snapshots: { orderBy: { capturedAt: 'asc' } } } }),
  ])
  if (!company) throw notFound('Company not found.')
  if (!evaluation) return { evaluation: null, periods: null, progress: { elapsedDays: 0, elapsedPercent: 0, complete: false }, completeness: { status: 'not_configured', sources: [] }, kpis: null }
  const startText = evaluation.startDate.toISOString().slice(0, 10)
  const periods = evaluationPeriods(startText, evaluation.timezone)
  const elapsedDays = Math.max(0, Math.min(28, Math.floor((now.getTime() - periods.intervention.start.getTime()) / DAY)))
  const interventionComplete = now >= periods.intervention.end
  const [publications, schedules, metrics, inquiries, activities, productionLogs, recentInquiries] = await Promise.all([
    prisma.publicationRecord.findMany({ where: { variant: { content: { companyId } }, publishedAt: { gte: periods.baseline.start, lt: periods.intervention.end } }, select: { id: true, publishedAt: true, recordedAt: true, markedBy: true, variant: { select: { id: true, platform: true, contentId: true, content: { select: { id: true, createdAt: true, targetIndustry: true, targetProspectId: true, sourceIdeaId: true } } } }, metrics: { where: { source: 'instagram_api' }, orderBy: { observedAt: 'desc' }, take: 1, select: { id: true, observedAt: true, source: true, views: true, reach: true, likes: true, comments: true, saves: true, shares: true, totalInteractions: true } } }, orderBy: { publishedAt: 'asc' } }),
    prisma.contentSchedule.findMany({ where: { variant: { content: { companyId } }, scheduledAt: { gte: periods.baseline.start, lt: periods.intervention.end } }, select: { id: true, scheduledAt: true, cancelledAt: true, variant: { select: { platform: true, publication: { select: { id: true } } } } } }),
    prisma.weeklyMetric.findMany({ where: { socialAccount: { companyId }, weekStart: { gte: periods.baseline.start }, weekEnd: { lt: periods.intervention.end } }, include: { socialAccount: { select: { platform: true } }, recorder: { select: { id: true, name: true } } }, orderBy: { weekStart: 'asc' } }),
    prisma.businessInquiry.findMany({ where: { companyId, receivedAt: { gte: periods.baseline.start, lt: periods.intervention.end } }, select: { id: true, receivedAt: true, createdAt: true, channel: true, companyName: true, summary: true, relevance: true, source: true, sourceReference: true, recordedBy: true, prospectId: true }, orderBy: { receivedAt: 'asc' } }),
    prisma.outboundActivity.findMany({ where: { companyId, archivedAt: null }, select: { id: true, prospectId: true, emailDraftId: true, activityType: true, status: true, occurredAt: true, completedAt: true, responseClassification: true, provenance: true, createdBy: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    prisma.productionTimeLog.findMany({ where: { companyId, occurredAt: { gte: periods.baseline.start, lt: periods.intervention.end } }, select: { id: true, contentId: true, minutes: true, occurredAt: true, createdAt: true, recordedBy: true }, orderBy: { occurredAt: 'asc' } }),
    prisma.businessInquiry.findMany({ where: { companyId }, orderBy: { receivedAt: 'desc' }, take: 100, include: { prospect: { select: { id: true, name: true, industry: true } }, recorder: { select: { id: true, name: true } } } }),
  ])
  const mappedPublications = publications.map((row) => ({ id: row.id, platform: row.variant.platform, publishedAt: row.publishedAt, recordedAt: row.recordedAt, markedBy: row.markedBy, contentId: row.variant.contentId, campaignCreatedAt: row.variant.content.createdAt, targetIndustry: row.variant.content.targetIndustry, targetProspectId: row.variant.content.targetProspectId, sourceIdeaId: row.variant.content.sourceIdeaId, metric: row.metrics[0] ? { ...row.metrics[0], views: row.metrics[0].views?.toString() ?? null, reach: row.metrics[0].reach?.toString() ?? null, likes: row.metrics[0].likes?.toString() ?? null, comments: row.metrics[0].comments?.toString() ?? null, saves: row.metrics[0].saves?.toString() ?? null, shares: row.metrics[0].shares?.toString() ?? null, totalInteractions: row.metrics[0].totalInteractions?.toString() ?? null } : null }))
  const byPeriod = (from: Date, to: Date) => {
    const pubs = mappedPublications.filter((row) => row.publishedAt >= from && row.publishedAt < to)
    const inquiryRows = inquiries.filter((row) => row.receivedAt >= from && row.receivedAt < to)
    const actualActivities = activities.filter((row) => (row.occurredAt ?? row.completedAt) !== null && (row.occurredAt ?? row.completedAt)! >= from && (row.occurredAt ?? row.completedAt)! < to)
    const active = actualActivities.filter((row) => row.status === 'recorded' || row.status === 'completed')
    const activeProductionLogs = productionLogs.filter((row) => isWithinHalfOpenPeriod(row.occurredAt, from, to))
    const productionByCampaign = new Map<string, number>()
    activeProductionLogs.forEach((row) => productionByCampaign.set(row.contentId, (productionByCampaign.get(row.contentId) ?? 0) + row.minutes))
    const outbound = {
      emailsSent: eventCount(active, 'email_sent', (row) => row.status === 'recorded'),
      followUpsCompleted: eventCount(active, 'follow_up', (row) => row.status === 'completed'),
      repliesReceived: eventCount(active, 'reply_received', (row) => row.status === 'recorded'),
      interestedResponses: eventCount(active, 'reply_received', (row) => row.status === 'recorded' && row.responseClassification === 'interested'),
      meetings: eventCount(active, 'meeting', (row) => row.status === 'completed'),
      demonstrations: eventCount(active, 'product_demonstration', (row) => row.status === 'completed'),
      approachedCompanies: new Set(active.filter((row) => row.activityType === 'email_sent' && row.status === 'recorded').map((row) => row.prospectId)).size,
      provenance: { historical: active.filter((row) => row.provenance === 'historical').length, artifactAssisted: active.filter((row) => row.provenance === 'artifact_assisted').length, nonArtifactAssisted: active.filter((row) => row.provenance === 'non_artifact_assisted').length },
      source: 'outbound_activities',
      sourceRecordIds: active.map((row) => row.id),
    }
    const platform = (name: 'instagram' | 'linkedin') => {
      const selectedMetrics = metrics.filter((row) => row.socialAccount.platform === name && row.weekStart < to && row.weekEnd >= from)
      return {
        weeklyAccountObservations: selectedMetrics.map((row) => ({ id: row.id, weekStart: row.weekStart.toISOString().slice(0, 10), weekEnd: row.weekEnd.toISOString().slice(0, 10), followers: row.followers.toString(), accountReach: row.reach?.toString() ?? null, impressions: name === 'linkedin' ? row.impressions?.toString() ?? null : null, nativeEngagementRate: name === 'linkedin' ? row.nativeEngagementRate : null, reportedPublishedPosts: row.reportedPublishedPosts, source: row.source, recordedAt: row.updatedAt.toISOString(), recordedBy: row.recorder ? { id: row.recorder.id, name: row.recorder.name } : null })),
        postObservations: name === 'instagram' ? pubs.filter((row) => row.platform === 'instagram' && row.metric).map((row) => ({ publicationId: row.id, contentId: row.contentId, publishedAt: row.publishedAt.toISOString(), ...row.metric })) : [],
      }
    }
    const complete = from === periods.baseline.start ? true : interventionComplete
    return {
      period: { start: from.toISOString(), endExclusive: to.toISOString(), days: from === periods.baseline.start ? 28 : elapsedDays, status: complete ? 'complete' : now <= from ? 'not_started' : 'partial' },
      publications: {
        total: pubs.length,
        byPlatform: { instagram: pubs.filter((row) => row.platform === 'instagram').length, linkedin: pubs.filter((row) => row.platform === 'linkedin').length },
        campaigns: new Set(pubs.map((row) => row.contentId)).size,
        targeting: { industryTargeted: pubs.filter((row) => Boolean(row.targetIndustry?.trim())).length, prospectLinked: pubs.filter((row) => Boolean(row.targetProspectId)).length, industryOnly: pubs.filter((row) => Boolean(row.targetIndustry?.trim()) && !row.targetProspectId).length, general: pubs.filter((row) => !row.targetIndustry && !row.targetProspectId).length, byIndustry: Object.fromEntries([...new Set(pubs.map((row) => row.targetIndustry).filter((industry): industry is string => Boolean(industry)))].map((industry) => [industry, pubs.filter((row) => row.targetIndustry === industry).length])) },
        records: pubs.map((row) => ({ id: row.id, platform: row.platform, contentId: row.contentId, sourceIdeaId: row.sourceIdeaId, targetIndustry: row.targetIndustry, targetProspectId: row.targetProspectId, publishedAt: row.publishedAt.toISOString(), recordedAt: row.recordedAt.toISOString(), markedBy: row.markedBy, campaignCreatedAt: row.campaignCreatedAt.toISOString(), metric: row.metric })),
        source: 'publication_records', sourceRecordIds: pubs.map((row) => row.id),
      },
      schedules: { planned: schedules.filter((row) => !row.cancelledAt && row.scheduledAt >= from && row.scheduledAt < to).length, cancelled: schedules.filter((row) => row.cancelledAt && row.scheduledAt >= from && row.scheduledAt < to).length },
      cadence: { instagram: weeklyPublicationKpis(pubs, 'instagram', from, to, complete, evaluation.timezone), linkedin: weeklyPublicationKpis(pubs, 'linkedin', from, to, complete, evaluation.timezone) },
      social: { instagram: platform('instagram'), linkedin: platform('linkedin') },
      inquiries: {
        relevant: inquiryRows.filter((row) => row.relevance === 'relevant').length,
        unreviewed: inquiryRows.filter((row) => row.relevance === 'unreviewed').length,
        totalRecorded: inquiryRows.length,
        byChannel: Object.fromEntries([...new Set(inquiryRows.map((row) => row.channel))].map((channel) => [channel, inquiryRows.filter((row) => row.channel === channel && row.relevance === 'relevant').length])),
        weekly: Array.from({ length: 4 }, (_, week) => {
          const weekStart = localDayStart(addLocalDays(localDateAt(from, evaluation.timezone), week * 7), evaluation.timezone)
          const weekEnd = new Date(Math.min(to.getTime(), localDayStart(addLocalDays(localDateAt(from, evaluation.timezone), (week + 1) * 7), evaluation.timezone).getTime()))
          return { weekStart: localDateAt(weekStart, evaluation.timezone), relevant: inquiryRows.filter((row) => row.relevance === 'relevant' && row.receivedAt >= weekStart && row.receivedAt < weekEnd).length, recorded: inquiryRows.filter((row) => row.receivedAt >= weekStart && row.receivedAt < weekEnd).length }
        }),
        source: 'business_inquiries',
        sourceRecordIds: inquiryRows.map((row) => row.id),
        records: inquiryRows.map((row) => ({ id: row.id, receivedAt: row.receivedAt.toISOString(), channel: row.channel, companyName: row.companyName, summary: row.summary, relevance: row.relevance, source: row.source, sourceReference: row.sourceReference, prospectId: row.prospectId, recordedBy: row.recordedBy, createdAt: row.createdAt.toISOString() })),
      },
      outbound: { ...outbound, sourceObservations: active.map((row) => ({ id: row.id, prospectId: row.prospectId, emailDraftId: row.emailDraftId, activityType: row.activityType, status: row.status, occurredAt: (row.occurredAt ?? row.completedAt)?.toISOString() ?? null, recordedAt: row.createdAt.toISOString(), recordedBy: row.createdBy, provenance: row.provenance })) },
      productionTime: { ...productionTimeStats([...productionByCampaign.values()]), sourceRecordIds: activeProductionLogs.map((row) => row.id), sourceObservations: activeProductionLogs.map((row) => ({ id: row.id, contentId: row.contentId, minutes: row.minutes, occurredAt: row.occurredAt.toISOString(), recordedAt: row.createdAt.toISOString(), recordedBy: row.recordedBy })) },
    }
  }
  const baseline = byPeriod(periods.baseline.start, periods.baseline.end)
  const intervention = byPeriod(periods.intervention.start, interventionComplete ? periods.intervention.end : now)
  const historicalActivities = activities.filter((row) => row.status === 'recorded' || row.status === 'completed')
  const historicalOutbound = {
    emailsSent: eventCount(historicalActivities, 'email_sent', (row) => row.status === 'recorded'),
    followUpsCompleted: eventCount(historicalActivities, 'follow_up', (row) => row.status === 'completed'),
    repliesReceived: eventCount(historicalActivities, 'reply_received', (row) => row.status === 'recorded'),
    interestedResponses: eventCount(historicalActivities, 'reply_received', (row) => row.status === 'recorded' && row.responseClassification === 'interested'),
    meetings: eventCount(historicalActivities, 'meeting', (row) => row.status === 'completed'),
    demonstrations: eventCount(historicalActivities, 'product_demonstration', (row) => row.status === 'completed'),
    approachedCompanies: new Set(historicalActivities.filter((row) => row.activityType === 'email_sent' && row.status === 'recorded').map((row) => row.prospectId)).size,
    provenance: { historical: historicalActivities.filter((row) => row.provenance === 'historical').length, artifactAssisted: historicalActivities.filter((row) => row.provenance === 'artifact_assisted').length, nonArtifactAssisted: historicalActivities.filter((row) => row.provenance === 'non_artifact_assisted').length },
    sourceRecordIds: historicalActivities.map((row) => row.id),
  }
  const comparison: Array<{ kpi: string; baseline: number | null; intervention: number | null; absoluteChange: number | null; percentageChange: number | null; status: string; source: string; sourceRecordIds?: string[] }> = [
    { kpi: 'Published posts · Instagram', ...compareValues(baseline.publications.byPlatform.instagram, intervention.publications.byPlatform.instagram, interventionComplete), source: 'publication_records', sourceRecordIds: [...baseline.publications.sourceRecordIds, ...intervention.publications.sourceRecordIds] },
    { kpi: 'Published posts · LinkedIn', ...compareValues(baseline.publications.byPlatform.linkedin, intervention.publications.byPlatform.linkedin, interventionComplete), source: 'publication_records', sourceRecordIds: [...baseline.publications.sourceRecordIds, ...intervention.publications.sourceRecordIds] },
    { kpi: 'Relevant inbound inquiries', ...compareValues(baseline.inquiries.relevant, intervention.inquiries.relevant, interventionComplete), source: 'business_inquiries', sourceRecordIds: [...baseline.inquiries.sourceRecordIds, ...intervention.inquiries.sourceRecordIds] },
    { kpi: 'Outbound emails sent', ...compareValues(baseline.outbound.emailsSent, intervention.outbound.emailsSent, interventionComplete), source: 'outbound_activities', sourceRecordIds: [...baseline.outbound.sourceRecordIds, ...intervention.outbound.sourceRecordIds] },
  ]
  const snapshotValue = (stage: string, key: string): number | null => {
    const snapshot = evaluation.snapshots.find((row) => row.stage === stage)
    if (!snapshot || !snapshot.measurements || typeof snapshot.measurements !== 'object' || Array.isArray(snapshot.measurements)) return null
    const value = (snapshot.measurements as Record<string, unknown>)[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const week0 = evaluation.snapshots.find((row) => row.stage === 'week0')
  const week4 = evaluation.snapshots.find((row) => row.stage === 'week4')
  for (const [key, label] of [['instagramFollowers', 'Instagram followers · Week 0 / Week 4'], ['linkedinFollowers', 'LinkedIn followers · Week 0 / Week 4']] as const) {
    const start = snapshotValue('week0', key)
    const finish = snapshotValue('week4', key)
    comparison.push({ kpi: label, ...compareValues(start, finish, interventionComplete), source: 'evaluation_snapshots', sourceRecordIds: [week0?.id, week4?.id].filter((id): id is string => Boolean(id)) })
  }
  const measuredIntervention = { ...periods.intervention, end: interventionComplete ? periods.intervention.end : new Date(Math.max(periods.intervention.start.getTime(), now.getTime())) }
  const latestReach = (period: typeof periods.baseline) => metrics.filter((row) => row.socialAccount.platform === 'instagram' && row.reach !== null && row.weekStart < period.end && row.weekEnd >= period.start).at(-1)
  const baselineReach = latestReach(periods.baseline)
  const interventionReach = latestReach(measuredIntervention)
  comparison.push({ kpi: 'Instagram latest account reach observation', ...compareValues(baselineReach ? Number(baselineReach.reach) : null, interventionReach ? Number(interventionReach.reach) : null, interventionComplete), source: 'weekly_metrics', sourceRecordIds: [baselineReach?.id, interventionReach?.id].filter((id): id is string => Boolean(id)) })
  const latestLinkedInRate = (period: typeof periods.baseline) => metrics.filter((row) => row.socialAccount.platform === 'linkedin' && row.nativeEngagementRate !== null && row.weekStart < period.end && row.weekEnd >= period.start).at(-1)
  const baselineRate = latestLinkedInRate(periods.baseline)
  const interventionRate = latestLinkedInRate(measuredIntervention)
  const nativeRateChange = baselineRate && interventionRate && interventionComplete ? interventionRate.nativeEngagementRate! - baselineRate.nativeEngagementRate! : null
  comparison.push({ kpi: 'LinkedIn native engagement rate · percentage points', baseline: baselineRate?.nativeEngagementRate ?? null, intervention: interventionRate?.nativeEngagementRate ?? null, absoluteChange: nativeRateChange, percentageChange: null, status: !baselineRate || !interventionRate ? 'missing' : interventionComplete ? 'complete' : 'partial', source: 'weekly_metrics', sourceRecordIds: [baselineRate?.id, interventionRate?.id].filter((id): id is string => Boolean(id)) })
  const activeSourceStatuses = [
    { source: 'Publication records', status: mappedPublications.length ? 'available' : 'no_records', records: mappedPublications.length },
    { source: 'Instagram API and account observations', status: metrics.some((row) => row.socialAccount.platform === 'instagram') || mappedPublications.some((row) => row.metric) ? 'available' : 'unavailable', records: metrics.filter((row) => row.socialAccount.platform === 'instagram').length + mappedPublications.filter((row) => row.metric).length },
    { source: 'LinkedIn Analytics manual observations', status: metrics.some((row) => row.socialAccount.platform === 'linkedin') ? 'available' : 'unavailable', records: metrics.filter((row) => row.socialAccount.platform === 'linkedin').length },
    { source: 'Inbound inquiry records', status: inquiries.length ? 'available' : 'no_records', records: inquiries.length },
    { source: 'Outbound activities', status: activities.length ? 'available' : 'no_records', records: activities.length },
    { source: 'Production time logs', status: productionLogs.length ? 'available' : 'no_records', records: productionLogs.length },
    { source: 'Week 0 / Week 4 snapshots', status: evaluation.snapshots.length === 2 ? 'available' : 'partial', records: evaluation.snapshots.length },
  ]
  return {
    evaluation: { id: evaluation.id, revision: evaluation.revision, startDate: startText, timezone: evaluation.timezone, definitions: evaluation.definitions, createdAt: evaluation.createdAt.toISOString(), snapshots: evaluation.snapshots.map((row) => ({ id: row.id, stage: row.stage, capturedAt: row.capturedAt.toISOString(), measurements: row.measurements, source: row.source, notes: row.notes, recordedBy: row.recordedBy })) },
    periods: { baseline: { start: periods.baseline.start.toISOString(), endExclusive: periods.baseline.end.toISOString() }, intervention: { start: periods.intervention.start.toISOString(), endExclusive: periods.intervention.end.toISOString() } },
    progress: { elapsedDays, elapsedPercent: Math.round(elapsedDays / 28 * 100), complete: interventionComplete },
    completeness: { status: interventionComplete ? 'complete' : now < periods.intervention.start ? 'not_started' : 'partial', sources: activeSourceStatuses },
    baseline, intervention, comparison, historicalOutbound,
    inquiries: recentInquiries.map((row) => ({ id: row.id, receivedAt: row.receivedAt.toISOString(), channel: row.channel, companyName: row.companyName, summary: row.summary, relevance: row.relevance, source: row.source, sourceReference: row.sourceReference, prospect: row.prospect, recordedBy: row.recorder.name, createdAt: row.createdAt.toISOString() })),
  }
}

export async function saveEvaluation(prisma: PrismaClient, companyId: string, actorId: string, startDate: string, timezone: string, customDefinitions: Record<string, string> = {}) {
  // Validate the timezone and calendar date before appending an immutable revision.
  localDayStart(startDate, timezone)
  const max = await prisma.marketingEvaluation.aggregate({ where: { companyId }, _max: { revision: true } })
  return prisma.marketingEvaluation.create({ data: { companyId, revision: (max._max.revision ?? 0) + 1, startDate: new Date(`${startDate}T00:00:00.000Z`), timezone, definitions: { ...DEFINITION_SET, ...customDefinitions } as Prisma.InputJsonValue, createdBy: actorId } })
}

export async function saveEvaluationSnapshot(prisma: PrismaClient, companyId: string, actorId: string, evaluationId: string, input: { stage: 'week0' | 'week4'; capturedAt: Date; measurements: Record<string, number | null>; source: string; notes: string | null }) {
  const evaluation = await prisma.marketingEvaluation.findFirst({ where: { id: evaluationId, companyId } })
  if (!evaluation) throw notFound('Evaluation configuration not found.')
  if (await prisma.evaluationSnapshot.findFirst({ where: { evaluationId, stage: input.stage }, select: { id: true } })) throw conflict('This snapshot is already recorded. Save a new evaluation revision to preserve the existing audit history.')
  const periods = evaluationPeriods(evaluation.startDate.toISOString().slice(0, 10), evaluation.timezone)
  const target = input.stage === 'week0' ? periods.week0At : periods.week4At
  if (Math.abs(input.capturedAt.getTime() - target.getTime()) > DAY) throw validationError('Snapshot must be recorded within one day of the configured measurement boundary.')
  const clean: Record<string, number | null> = {}
  if (!Object.keys(input.measurements).length) throw validationError('Provide at least one verified snapshot measurement.')
  for (const [key, value] of Object.entries(input.measurements)) {
    if (!/^[a-z][a-zA-Z0-9]{0,49}$/.test(key) || (value !== null && (!Number.isFinite(value) || value < 0))) throw validationError('Snapshot measurements must use non-negative finite numbers or null.')
    clean[key] = value
  }
  return prisma.evaluationSnapshot.create({ data: { evaluationId, stage: input.stage, capturedAt: input.capturedAt, measurements: clean as Prisma.InputJsonValue, source: input.source, notes: input.notes, recordedBy: actorId } })
}

export async function createBusinessInquiry(prisma: PrismaClient, companyId: string, actorId: string, input: { receivedAt: Date; channel: string; companyName: string | null; prospectId: string | null; summary: string; relevance: string; source: string; sourceReference: string | null; followUpNotes: string | null }) {
  if (input.prospectId && !await prisma.prospect.findFirst({ where: { id: input.prospectId, companyId }, select: { id: true } })) throw notFound('Prospect not found.')
  return prisma.businessInquiry.create({ data: { ...input, companyId, recordedBy: actorId } })
}

export async function createProductionTimeLog(prisma: PrismaClient, companyId: string, actorId: string, contentId: string, minutes: number, occurredAt: Date, notes: string | null) {
  if (!await prisma.content.findFirst({ where: { id: contentId, companyId }, select: { id: true } })) throw notFound('Content not found.')
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw validationError('Active production time must be between 1 and 1440 minutes.')
  return prisma.productionTimeLog.create({ data: { companyId, contentId, minutes, occurredAt, notes, recordedBy: actorId } })
}
