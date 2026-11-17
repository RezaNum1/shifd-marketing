import ExcelJS from 'exceljs'
import type { buildOverviewReport, buildPerformanceReport } from './reporting.js'
import { localDayStart, type readEvaluation, type readEvaluationRange } from './evaluation.js'

type Cell = string | number | boolean | null | undefined
type Column = { key: string; description: string; unit?: string }
type Row = Record<string, Cell>
type SheetSpec = { name: string; columns: Column[]; rows: Row[] }
type PerformanceReport = ReturnType<typeof buildPerformanceReport>
type OverviewReport = ReturnType<typeof buildOverviewReport>
type EvaluationRange = Awaited<ReturnType<typeof readEvaluationRange>>
type EvaluationDashboard = Awaited<ReturnType<typeof readEvaluation>>

const column = (key: string, description: string, unit?: string): Column => ({ key, description, ...(unit ? { unit } : {}) })
const metricColumns = [
  column('views', 'Post views', 'count'), column('reach', 'Unique accounts reached', 'count'),
  column('likes', 'Likes', 'count'), column('comments', 'Comments', 'count'),
  column('saves', 'Saves', 'count'), column('shares', 'Shares', 'count'),
  column('total_interactions', 'Total interactions', 'count'),
]

function metricValue(value: string | number | null | undefined): Cell {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : String(value)
}

function localDate(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function summaryRows(values: Record<string, Cell>, descriptions: Record<string, string>, source: string): Row[] {
  return Object.entries(values).map(([metric, value]) => ({ metric, value, unit: metric.endsWith('_percent') ? 'percent_points' : 'count', definition: descriptions[metric] ?? metric.replaceAll('_', ' '), source }))
}

async function workbookBuffer(kind: string, metadata: Row[], sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Shifd Marketing'
  workbook.created = new Date()
  const meta = workbook.addWorksheet('Panduan Data')
  meta.columns = [{ header: 'key', key: 'key', width: 28 }, { header: 'value', key: 'value', width: 92 }]
  const guide: Row[] = [
    { key: 'schema_version', value: '1.0' }, { key: 'report_type', value: kind },
    { key: 'reading_order', value: 'Read Panduan Data, then Summary, then the detailed sheets. Each detailed sheet has one header row and one observation per row.' },
    { key: 'missing_values', value: 'Blank cells mean unavailable or unrecorded; they are never zero. Explicit 0 is a measured zero.' },
    { key: 'percentages', value: 'Percent columns contain percentage points: 12.5 means 12.5%, not 0.125.' },
    { key: 'dates', value: 'Dates use ISO 8601. Date-only values are local calendar dates in the report timezone; timestamps include their UTC offset.' },
    { key: 'source_of_truth', value: 'Canonical Shifd Marketing backend records. No AI-generated values are included.' },
    ...metadata,
  ]
  meta.addRows(guide)
  styleSheet(meta)

  const dictionary = workbook.addWorksheet('Data Dictionary')
  dictionary.columns = [
    { header: 'sheet', key: 'sheet', width: 24 }, { header: 'column', key: 'column', width: 28 },
    { header: 'unit', key: 'unit', width: 20 }, { header: 'description', key: 'description', width: 90 },
  ]
  for (const spec of sheets) for (const field of spec.columns) dictionary.addRow({ sheet: spec.name, column: field.key, unit: field.unit ?? 'text', description: field.description })
  styleSheet(dictionary)

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name)
    sheet.columns = spec.columns.map((field) => ({ header: field.key, key: field.key, width: Math.min(42, Math.max(16, field.key.length + 4)) }))
    sheet.addRows(spec.rows.map((row) => Object.fromEntries(spec.columns.map((field) => [field.key, row[field.key] ?? null]))))
    styleSheet(sheet)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } }
}

export async function performanceWorkbook(report: PerformanceReport, overview: OverviewReport, selectedRange?: { startDate: string; endDate: string }): Promise<Buffer> {
  const start = report.period.start
  const endExclusive = report.period.end
  const hasPeriod = start !== null && endExclusive !== null
  const publications = overview.recentlyPublished.filter((item) => {
    const date = item.publication.publishedAt
    return start !== null && endExclusive !== null && date >= start && date < endExclusive && (report.platform === 'combined' || item.publication.platform === report.platform)
  })
  const scoped = <T extends { platform: string }>(rows: T[]) => rows.filter((row) => report.platform === 'combined' || row.platform === report.platform)
  const sheets: SheetSpec[] = [
    { name: 'Summary', columns: [column('metric', 'Stable metric identifier'), column('value', 'Recorded value', 'count or percent_points'), column('unit', 'Unit of the value'), column('definition', 'Meaning of the metric'), column('source', 'Original report section')], rows: summaryRows({
      published_posts: hasPeriod ? report.summary.published.effectivePosts : null, explicit_posts: hasPeriod ? report.summary.published.explicitPosts : null,
      reported_posts: hasPeriod ? report.summary.published.reportedPosts : null, latest_weekly_reach: report.summary.latestWeeklyReach,
      impressions: report.summary.impressions, engagements: report.summary.engagements,
      native_engagement_rate_percent: report.summary.engagementRate,
      planned_schedules: hasPeriod ? report.execution.planned : null, published_from_plan: hasPeriod ? report.execution.publishedWithinCohort : null,
      pending_schedules: hasPeriod ? report.execution.pending : null, on_time_publications: hasPeriod ? report.execution.onTime : null,
    }, {
      published_posts: 'Effective published posts for the selected report period', explicit_posts: 'Recorded publication records',
      reported_posts: 'Platform-reported published posts', latest_weekly_reach: 'Most recent compatible account-week reach',
      impressions: 'Sum of compatible complete weekly account observations', engagements: 'Sum of compatible weekly engagements',
      native_engagement_rate_percent: 'Latest native LinkedIn engagement rate, when available',
      planned_schedules: 'Schedules in the selected report cohort', published_from_plan: 'Planned posts published in the cohort',
      pending_schedules: 'Planned posts still pending', on_time_publications: 'Publications completed on or before schedule',
    }, 'performance_report') },
    { name: 'Weekly Metrics', columns: [column('week_start', 'First local calendar day of account week'), column('week_end', 'Last local calendar day of account week'), column('platform', 'Channel or combined view'), column('followers', 'Follower count at this observation', 'count'), column('reach', 'Account-week reach', 'count'), column('impressions', 'Account-week impressions', 'count'), column('engagements', 'Account-week engagements', 'count'), column('engagement_rate_percent', 'Native engagement rate', 'percent_points'), column('source', 'Metric source'), column('coverage', 'recorded or missing')], rows: report.weekly.map((item) => ({ week_start: item.weekStart, week_end: item.weekEnd, platform: item.platform, followers: item.followers, reach: item.reach, impressions: item.impressions, engagements: item.engagements, engagement_rate_percent: item.engagementRate, source: item.source, coverage: item.coverage })) },
    { name: 'Followers', columns: [column('platform', 'Social platform'), column('start_observation_date', 'First observed date'), column('end_observation_date', 'Last observed date'), column('start', 'First follower count', 'count'), column('end', 'Last follower count', 'count'), column('change', 'Absolute follower change', 'count'), column('change_percent', 'Change divided by starting followers', 'percent_points')], rows: scoped(report.followers).map((item) => ({ platform: item.platform, start_observation_date: item.startObservationDate, end_observation_date: item.endObservationDate, start: item.start, end: item.end, change: item.change, change_percent: item.changePercent })) },
    { name: 'Publishing Cadence', columns: [column('platform', 'Social platform'), column('effective_posts', 'Published posts used for cadence', 'count'), column('expected_posts', 'Target posts for period', 'count'), column('consistency_percent', 'Effective divided by expected posts', 'percent_points'), column('target_per_week', 'Target per week', 'count')], rows: hasPeriod ? scoped(report.consistency).map((item) => ({ platform: item.platform, effective_posts: item.published.effectivePosts, expected_posts: item.expected, consistency_percent: item.percent, target_per_week: item.targetPerWeek })) : [] },
    { name: 'Publications', columns: [column('publication_id', 'Publication record ID'), column('content_id', 'Content record ID'), column('title', 'Content title'), column('platform', 'Published channel'), column('published_at', 'UTC publication timestamp'), column('post_url', 'Published post URL'), column('metric_source', 'Latest post metric source'), column('metric_observed_at', 'Latest post metric observation timestamp'), column('impressions', 'Post impressions', 'count'), column('impressions_in_network_percent', 'LinkedIn in-network impressions share', 'percent_points'), column('impressions_out_network_percent', 'LinkedIn out-of-network impressions share', 'percent_points'), column('member_reached', 'LinkedIn members reached', 'count'), column('followers_gained', 'Followers gained from post', 'count'), column('profile_viewers', 'Profile viewers from post', 'count'), column('reactions', 'Post reactions', 'count'), ...metricColumns], rows: publications.map((item) => ({ publication_id: item.publication.id, content_id: item.content.id, title: item.content.title, platform: item.publication.platform, published_at: item.publication.publishedAt, post_url: item.publication.postUrl, metric_source: item.postMetrics?.source, metric_observed_at: item.postMetrics?.observedAt, impressions: item.postMetrics?.impressions, impressions_in_network_percent: item.postMetrics?.impressionsInNetwork, impressions_out_network_percent: item.postMetrics?.impressionsOutOfNetwork, member_reached: item.postMetrics?.memberReached, followers_gained: item.postMetrics?.followersGained, profile_viewers: item.postMetrics?.profileViewers, reactions: item.postMetrics?.reactions, views: item.postMetrics?.views, reach: item.postMetrics?.reach, likes: item.postMetrics?.likes, comments: item.postMetrics?.comments, saves: item.postMetrics?.saves, shares: item.postMetrics?.shares, total_interactions: item.postMetrics?.totalInteractions })) },
    { name: 'Inbound Inquiries', columns: [column('week_start', 'Start of inquiry week'), column('week_end', 'End of inquiry week'), column('count', 'Recorded inquiries', 'count'), column('source', 'Source of inquiry count')], rows: report.inquiries.weeks.map((item) => ({ week_start: item.weekStart, week_end: item.weekEnd, count: item.count, source: item.source })) },
  ]
  return workbookBuffer('performance_overview', [
    { key: 'selection', value: selectedRange ? 'custom_date_range' : `latest_${report.period.requestedWeeks}_recorded_weeks` },
    { key: 'selected_start_date', value: selectedRange?.startDate ?? (start ? localDate(start, report.period.timezone) : '') },
    { key: 'selected_end_date', value: selectedRange?.endDate ?? (endExclusive ? localDate(new Date(Date.parse(endExclusive) - 1).toISOString(), report.period.timezone) : '') },
    { key: 'period_start_utc', value: start ?? '' }, { key: 'period_end_exclusive_utc', value: endExclusive ?? '' },
    { key: 'platform_filter', value: report.platform }, { key: 'timezone', value: report.period.timezone },
    { key: 'generated_at_utc', value: report.period.asOf },
    { key: 'scope_note', value: 'Publications are filtered by published_at inside the report period. Weekly account observations use complete weeks as defined by the Overview report.' },
    { key: 'excluded_global_context', value: 'All-time content output and current workflow queues are excluded because they are not limited to the selected period.' },
    ...(!hasPeriod ? [{ key: 'period_status', value: 'No recorded account weeks define a report interval; period-dependent totals are blank.' }] : []),
  ], sheets)
}

export async function evaluationWorkbook(data: EvaluationRange, generatedAt: Date, research?: EvaluationDashboard): Promise<Buffer> {
  const totals = data.totals
  const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  const configured = research && 'comparison' in research && research.periods && research.evaluation ? research : null
  const rangeStartUtc = localDayStart(data.range.startDate, data.range.timezone).getTime()
  const rangeEndUtc = Date.parse(data.range.endExclusive)
  const researchIncluded = Boolean(configured &&
    Date.parse(configured.periods.baseline.start) >= rangeStartUtc &&
    Date.parse(configured.periods.intervention.endExclusive) <= rangeEndUtc &&
    configured.evaluation.snapshots.every((snapshot) => Date.parse(snapshot.capturedAt) >= rangeStartUtc && Date.parse(snapshot.capturedAt) < rangeEndUtc))
  const sheets: SheetSpec[] = [
    { name: 'Summary', columns: [column('metric', 'Stable metric identifier'), column('value', 'Recorded total', 'count'), column('unit', 'Unit of the value'), column('definition', 'Meaning of the metric'), column('source', 'Original report section')], rows: summaryRows(Object.fromEntries(Object.entries(totals).map(([key, value]) => [snake(key), value])), {}, 'evaluation_range.totals') },
    { name: 'Weekly Activity', columns: [column('start_date', 'First local day of this selected-range week'), column('end_date', 'Last local day of this selected-range week'), ...Object.keys(data.weekly[0] ?? {}).filter((key) => key !== 'startDate' && key !== 'endDate').map((key) => column(snake(key), snake(key).replaceAll('_', ' '), 'count'))], rows: data.weekly.map((item) => ({ start_date: item.startDate, end_date: item.endDate, ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'startDate' && key !== 'endDate').map(([key, value]) => [snake(key), value])) })) },
    { name: 'Publications', columns: [column('publication_id', 'Publication record ID'), column('content_id', 'Content record ID'), column('title', 'Content title'), column('platform', 'Published channel'), column('published_at', 'UTC publication timestamp'), column('target_industry', 'Targeted industry if recorded'), column('target_prospect_id', 'Linked prospect ID if recorded'), ...metricColumns], rows: data.publications.map((item) => ({ publication_id: item.id, content_id: item.contentId, title: item.title, platform: item.platform, published_at: item.publishedAt, target_industry: item.targetIndustry, target_prospect_id: item.targetProspectId, views: metricValue(item.metrics?.views), reach: metricValue(item.metrics?.reach), likes: metricValue(item.metrics?.likes), comments: metricValue(item.metrics?.comments), saves: metricValue(item.metrics?.saves), shares: metricValue(item.metrics?.shares), total_interactions: metricValue(item.metrics?.totalInteractions) })) },
    { name: 'Metric History', columns: [column('publication_id', 'Publication ID joining to Publications'), column('observed_at', 'UTC metric observation timestamp'), ...metricColumns], rows: data.publications.flatMap((item) => item.metricHistory.map((metric) => ({ publication_id: item.id, observed_at: metric.observedAt, views: metricValue(metric.views), reach: metricValue(metric.reach), likes: metricValue(metric.likes), comments: metricValue(metric.comments), saves: metricValue(metric.saves), shares: metricValue(metric.shares), total_interactions: metricValue(metric.totalInteractions) }))) },
    { name: 'Prospect Activity', columns: [column('activity_id', 'Prospect activity ID'), column('prospect_id', 'Prospect record ID'), column('prospect_name', 'Prospect company name'), column('activity_type', 'Recorded outreach action'), column('status', 'Activity status'), column('occurred_at', 'UTC activity timestamp'), column('response_classification', 'Response classification if available')], rows: data.outboundActivities.map((item) => ({ activity_id: item.id, prospect_id: item.prospectId, prospect_name: item.prospectName, activity_type: item.activityType, status: item.status, occurred_at: item.occurredAt, response_classification: item.responseClassification })) },
    { name: 'Research Comparison', columns: [column('kpi', 'Research KPI name'), column('baseline', 'Value for configured 28-day baseline'), column('intervention', 'Value for configured 28-day intervention'), column('absolute_change', 'Intervention minus baseline'), column('percentage_change', 'Change relative to baseline', 'percent_points'), column('status', 'Completeness status'), column('source', 'Data source'), column('source_record_ids', 'Comma-separated source record IDs')], rows: researchIncluded && configured && 'comparison' in configured ? configured.comparison.map((item) => ({ kpi: item.kpi, baseline: item.baseline, intervention: item.intervention, absolute_change: item.absoluteChange, percentage_change: item.percentageChange, status: item.status, source: item.source, source_record_ids: item.sourceRecordIds?.join(', ') ?? null })) : [] },
    { name: 'Evaluation Snapshots', columns: [column('snapshot_id', 'Evaluation snapshot ID'), column('stage', 'week0 or week4'), column('captured_at', 'UTC observation timestamp'), column('metric', 'Measured account metric'), column('value', 'Verified measurement', 'count'), column('source', 'Where measurement was checked'), column('notes', 'Recorder notes')], rows: researchIncluded && configured ? configured.evaluation.snapshots.flatMap((snapshot) => Object.entries(snapshot.measurements as Record<string, number | null>).map(([metric, value]) => ({ snapshot_id: snapshot.id, stage: snapshot.stage, captured_at: snapshot.capturedAt, metric: snake(metric), value, source: snapshot.source, notes: snapshot.notes }))) : [] },
  ]
  return workbookBuffer('performance_evaluation', [
    { key: 'selected_start_date', value: data.range.startDate }, { key: 'selected_end_date', value: data.range.endDate },
    { key: 'period_end_exclusive_utc', value: data.range.endExclusive }, { key: 'period_days', value: data.range.days },
    { key: 'timezone', value: data.range.timezone }, { key: 'generated_at_utc', value: generatedAt.toISOString() },
    { key: 'scope_note', value: 'Publication and prospect activity rows are inside the selected local date range. Metric History contains observations for those publications, which may have been recorded after the publication date.' },
    { key: 'research_comparison', value: researchIncluded ? 'Included: configured baseline, intervention, and follower snapshots are fully inside the selected range.' : 'Excluded: no configured comparison, or its full periods and snapshots are not inside the selected range.' },
    { key: 'research_baseline_start_utc', value: researchIncluded && configured ? configured.periods.baseline.start : '' },
    { key: 'research_intervention_end_exclusive_utc', value: researchIncluded && configured ? configured.periods.intervention.endExclusive : '' },
  ], sheets)
}
