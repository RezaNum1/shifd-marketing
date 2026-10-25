<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import TrendChart from '../components/performance/TrendChart.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import TablePagination from '../components/ui/TablePagination.vue'
import { usePerformanceStore } from '../stores/performance'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { listProspects } from '../api/prospects'
import type { Prospect } from '../types/prospect'
import { useUiStore } from '../stores/ui'
import InlineAlert from '../components/ui/InlineAlert.vue'
import type { CustomEvaluationRange, PerformancePlatform } from '../types/performance'
import type { SelectOption, Tone } from '../types/ui'

type PlatformFilter = 'combined' | PerformancePlatform
type PeriodWeeks = 4 | 8 | 12

const router = useRouter()
const route = useRoute()
const isEvaluationPage = computed(() => !route || route.name === 'performance-evaluation' || route.path === '/performance/evaluation')
const overviewHelp = {
  purpose: 'Summarize publishing results and social channel performance for the selected period.',
  steps: [
    'Choose a reporting period and platform at the top of the page.',
    'Review the metric cards and charts to understand recent results.',
    'Open Evaluation for the research comparison or LinkedIn Metrics to add weekly LinkedIn data.',
  ],
}
const evaluationHelp = {
  purpose: 'Compare the four weeks before an intervention with the four weeks after it, using recorded marketing activity and platform observations.',
  steps: [
    'Set the intervention start date and save it. The four weeks before that date are the baseline.',
    'At Week 0 and Week 4, save verified follower counts and their source.',
    'Review the results table. Open Additional data and activity to record production time or incoming business inquiries.',
  ],
}
const performance = usePerformanceStore()
const contentLibrary = useContentLibraryStore()
const ui = useUiStore()
const period = ref('8')
const platform = ref<PlatformFilter>('combined')
const recentPublishedPage = ref(1)
const recentPublishedPageSize = ref(10)
const evaluationComparePage = ref(1)
const evaluationComparePageSize = ref(10)
const prospects = ref<Prospect[]>([])
const customRangeStart = ref(addLocalDays(localDateInZone(new Date(), 'Asia/Jakarta'), -27))
const customRangeEnd = ref(localDateInZone(new Date(), 'Asia/Jakarta'))
const customRangeApplying = ref(false)
const growthPublicationId = ref('')
const growthMetric = ref('totalInteractions')
const platformRows = ['instagram', 'linkedin'] as const
const evaluationStart = ref(localDateInZone(new Date(), 'Asia/Jakarta'))
const evaluationSaving = ref(false)
const measurementDefinitionNotes = ref('')
const snapshotForm = reactive({ stage: 'week0' as 'week0' | 'week4', instagramFollowers: '', linkedinFollowers: '', source: 'Native platform account observation', notes: '' })
const inquiryForm = reactive({ receivedAt: localDateTimeInput(), channel: 'whatsapp', companyName: '', prospectId: '', summary: '', relevance: 'unreviewed', source: 'Founder-recorded message', sourceReference: '', followUpNotes: '' })
const productionForm = reactive({ contentId: '', minutes: '', occurredAt: localDateTimeInput(), notes: '' })
const evaluation = computed(() => performance.evaluation)
const customRange = computed(() => performance.customRange)
const growthMetricOptions: SelectOption[] = [
  { value: 'views', label: 'Views' }, { value: 'reach', label: 'Reach' }, { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' }, { value: 'saves', label: 'Saves' }, { value: 'shares', label: 'Shares' },
  { value: 'totalInteractions', label: 'Total interactions' },
]
const growthPublicationOptions = computed(() => (customRange.value?.publications ?? []).map((publication) => ({ value: publication.id, label: `${publication.title} · ${platformLabel(publication.platform as PlatformFilter)}` })))
const selectedGrowthPublication = computed(() => customRange.value?.publications.find((publication) => publication.id === growthPublicationId.value))
const selectedGrowthMetricLabel = computed(() => growthMetricOptions.find((item) => item.value === growthMetric.value)?.label ?? 'Total interactions')
const selectedGrowthObservations = computed(() => (selectedGrowthPublication.value?.metricHistory ?? []).map((snapshot) => ({
  observedAt: snapshot.observedAt,
  value: snapshot[growthMetric.value as keyof typeof snapshot] === null ? null : Number(snapshot[growthMetric.value as keyof typeof snapshot]),
})))
const growthChartLabels = computed(() => selectedGrowthObservations.value.map((item) => formatDate(item.observedAt, { month: 'short', day: 'numeric' })))
const growthChartSeries = computed(() => [{ label: selectedGrowthMetricLabel.value, color: '#1d4ed8', values: selectedGrowthObservations.value.map((item) => item.value) }])
const contentGrowth = computed(() => {
  const values = selectedGrowthObservations.value.filter((item): item is { observedAt: string; value: number } => item.value !== null)
  if (values.length < 2) return null
  const first = values[0]!.value
  const latest = values.at(-1)!.value
  const change = latest - first
  return { first, latest, change, percentage: first > 0 ? change / first * 100 : null }
})
watch(() => customRange.value?.publications, (publications) => {
  if (!publications?.some((publication) => publication.id === growthPublicationId.value)) growthPublicationId.value = publications?.[0]?.id ?? ''
}, { immediate: true })
const visibleEvaluationComparison = computed(() => (evaluation.value?.comparison ?? []).slice((evaluationComparePage.value - 1) * evaluationComparePageSize.value, evaluationComparePage.value * evaluationComparePageSize.value))
const contentOptions = computed(() => contentLibrary.records.map((record) => ({ value: record.id, label: `${record.title} · ${record.status}` })))
const prospectOptions = computed(() => [{ value: '', label: 'No linked prospect' }, ...prospects.value.map((prospect) => ({ value: prospect.id, label: `${prospect.name}${prospect.industry ? ` · ${prospect.industry}` : ''}` }))])
const evaluationPeriodsLabel = computed(() => {
  const periods = evaluation.value?.periods
  return periods ? `${formatDate(periods.baseline.start, { dateStyle: 'medium' })} – ${formatDate(periods.intervention.start, { dateStyle: 'medium' })} baseline · ${formatDate(periods.intervention.start, { dateStyle: 'medium' })} – ${formatDate(periods.intervention.endExclusive, { dateStyle: 'medium' })} intervention` : 'Set a start date to configure the 28-day baseline and intervention.'
})
watch(() => evaluation.value?.evaluation, (config) => { if (config) { evaluationStart.value = config.startDate; measurementDefinitionNotes.value = typeof config.definitions.customNotes === 'string' ? config.definitions.customNotes : '' } })
watch(() => evaluation.value?.comparison.length, () => { evaluationComparePage.value = 1 })

const periodOptions: SelectOption[] = [{ value: '4', label: 'Last 4 Weeks' }, { value: '8', label: 'Last 8 Weeks' }, { value: '12', label: 'Last 12 Weeks' }]
const platformOptions: SelectOption[] = [{ value: 'combined', label: 'Combined' }, { value: 'instagram', label: 'Instagram' }, { value: 'linkedin', label: 'LinkedIn' }]
/* Legacy mock-derived selectors are kept below only as a migration marker. */
/*
const periodWeeks = computed(() => Number(period.value) as PeriodWeeks)
const selectedMetrics = computed(() => {
  const weeks = [...new Set(performance.weeklyMetrics.map((metric) => metric.weekStart))].sort().slice(-periodWeeks.value)
  return { weeks, instagram: weeks.map((week) => performance.weeklyMetrics.find((metric) => metric.platform === 'instagram' && metric.weekStart === week)), linkedin: weeks.map((week) => performance.weeklyMetrics.find((metric) => metric.platform === 'linkedin' && metric.weekStart === week)) }
})
const aggregateMetrics = computed(() => selectedMetrics.value.weeks.map((week, index) => {
  const instagram = selectedMetrics.value.instagram[index]
  const linkedin = selectedMetrics.value.linkedin[index]
  return { week, instagram, linkedin, reach: (instagram?.reach ?? 0) + (linkedin?.reach ?? 0), impressions: (instagram?.impressions ?? 0) + (linkedin?.impressions ?? 0), likes: (instagram?.likes ?? 0) + (linkedin?.likes ?? 0), comments: (instagram?.comments ?? 0) + (linkedin?.comments ?? 0), saves: (instagram?.saves ?? 0) + (linkedin?.saves ?? 0), publishedPosts: (instagram?.publishedPosts ?? 0) + (linkedin?.publishedPosts ?? 0) }
}))
function present(metrics: (WeeklyMetric | undefined)[]) { return metrics.filter((metric): metric is WeeklyMetric => Boolean(metric)) }
const currentSeries = computed(() => platform.value === 'combined' ? aggregateMetrics.value : present(platform.value === 'instagram' ? selectedMetrics.value.instagram : selectedMetrics.value.linkedin))
const followerSeries = computed(() => ({ instagram: present(selectedMetrics.value.instagram), linkedin: present(selectedMetrics.value.linkedin) }))
const followerStart = computed(() => platform.value === 'combined' ? (selectedMetrics.value.instagram[0]?.followers ?? 0) + (selectedMetrics.value.linkedin[0]?.followers ?? 0) : (selectedMetrics.value[platform.value][0]?.followers ?? 0))
const followerEnd = computed(() => platform.value === 'combined' ? (selectedMetrics.value.instagram.at(-1)?.followers ?? 0) + (selectedMetrics.value.linkedin.at(-1)?.followers ?? 0) : (selectedMetrics.value[platform.value].at(-1)?.followers ?? 0))
const followerChange = computed(() => followerEnd.value - followerStart.value)
const followerChangePercent = computed(() => followerStart.value ? (followerChange.value / followerStart.value) * 100 : 0)
const reachTotal = computed(() => currentSeries.value.reduce((total, metric) => total + ('reach' in metric ? (metric.reach ?? 0) : 0), 0))
const latestReach = computed(() => currentSeries.value.at(-1)?.reach ?? 0)
const impressionsTotal = computed(() => currentSeries.value.reduce((total, metric) => total + ('impressions' in metric ? metric.impressions : 0), 0))
const engagementsTotal = computed(() => currentSeries.value.reduce((total, metric) => total + (('likes' in metric) ? engagementCount(metric) : 0), 0))
const engagementRate = computed(() => calculateEngagementRate(impressionsTotal.value, engagementsTotal.value) ?? 0)
const selectedPeriodBounds = computed(() => {
  const first = selectedMetrics.value.weeks[0]
  const last = selectedMetrics.value.weeks.at(-1)
  if (!first || !last) return undefined
  const start = new Date(`${first}T00:00:00`)
  const end = new Date(`${last}T00:00:00`)
  end.setDate(end.getDate() + 7)
  return { start, end }
})
const publishedCount = computed(() => getEffectivePublishedPostCount(performance.weeklyMetrics, library.publicationRecords, {
  ...selectedPeriodBounds.value,
  ...(platform.value === 'combined' ? {} : { platform: platform.value }),
}))
const latestWeekLabel = computed(() => selectedMetrics.value.weeks.at(-1) ? formatDate(selectedMetrics.value.weeks.at(-1)!, { month: 'short', day: 'numeric' }) : 'No recorded week')
const consistency = computed(() => (['instagram', 'linkedin'] as PerformancePlatform[]).map((item) => {
  const published = getEffectivePublishedPostCount(performance.weeklyMetrics, library.publicationRecords, { platform: item, ...selectedPeriodBounds.value })
  const result = calculateConsistency(published, periodWeeks.value)
  return { platform: item, published, ...result }
}))
const executionSummary = computed(() => {
  const bounds = selectedPeriodBounds.value
  const inPeriod = library.records.filter((record) => record.platforms.some((item) => {
    const schedule = contentLifecycle(record).schedules[item]
    return schedule && bounds && new Date(`${schedule.date}T00:00:00`) >= bounds.start && new Date(`${schedule.date}T00:00:00`) < bounds.end
  }))
  const planned = inPeriod.reduce((total, record) => total + record.platforms.filter((item) => {
    const schedule = contentLifecycle(record).schedules[item]
    return (platform.value === 'combined' || item === platform.value) && Boolean(schedule && bounds && new Date(`${schedule.date}T00:00:00`) >= bounds.start && new Date(`${schedule.date}T00:00:00`) < bounds.end)
  }).length, 0)
  const published = library.getPublishedPublicationRecords({
    ...bounds,
    ...(platform.value === 'combined' ? {} : { platform: platform.value }),
  }).length
  return { planned, published, pending: Math.max(0, planned - published), onTime: published }
})
const outputBreakdown = computed(() => ({
  created: library.records.length,
  approved: library.records.filter((record) => ['Approved', 'Scheduled', 'Published'].includes(contentStatus(record))).length,
  scheduled: library.records.filter((record) => contentStatus(record) === 'Scheduled').length,
  published: library.records.filter((record) => contentStatus(record) === 'Published').length,
}))
const reachChart = computed(() => platform.value === 'combined'
  ? [{ label: 'Combined Platform Reach', color: '#1d4ed8', values: aggregateMetrics.value.map((metric) => metric.reach) }]
  : [{ label: platformLabel(platform.value), color: platform.value === 'instagram' ? '#7c3aed' : '#1d4ed8', values: currentSeries.value.map((metric) => metric.reach) }])
const followerChart = computed(() => platform.value === 'combined'
  ? [{ label: 'Instagram', color: '#7c3aed', values: followerSeries.value.instagram.map((metric) => metric.followers) }, { label: 'LinkedIn', color: '#1d4ed8', values: followerSeries.value.linkedin.map((metric) => metric.followers) }]
  : [{ label: platformLabel(platform.value), color: platform.value === 'instagram' ? '#7c3aed' : '#1d4ed8', values: (platform.value === 'instagram' ? followerSeries.value.instagram : followerSeries.value.linkedin).map((metric) => metric.followers) }])
const chartLabels = computed(() => selectedMetrics.value.weeks.map((week) => `W${week.slice(5, 7)}-${week.slice(8, 10)}`))
const recentPublished = computed(() => library.records.flatMap((record) => record.platforms.flatMap((item) => {
  if (platform.value !== 'combined' && item !== platform.value) return []
  const publication = library.getPublicationRecord(record.id, item)
  if (!publication) return []
  const metric = metricForPublication(performance.weeklyMetrics, publication)
  const variant = item === 'instagram' ? record.details.instagram : record.details.linkedin
  return [{ record, platform: item, publication, reach: metric?.reach, impressions: metric?.impressions, engagement: metric && metric.impressions ? ((metric.likes + metric.comments + metric.saves) / metric.impressions) * 100 : undefined, copy: item === 'instagram' ? variant?.caption : variant?.postCopy }]
})).slice(0, 5))
const inquiryWindow = computed(() => performance.inboundInquiries.slice(-periodWeeks.value))
const inquiryTotal = computed(() => inquiryWindow.value.reduce((sum, item) => sum + item.count, 0))

function platformLabel(value: PlatformFilter | PerformancePlatform) { return value === 'instagram' ? 'Instagram' : value === 'linkedin' ? 'LinkedIn' : 'Combined' }
function formatNumber(value: number) { return value.toLocaleString() }
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) { return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T00:00:00`)) }
function formatPercent(value: number) { return `${value.toFixed(1)}%` }
function formatMetric(value: number | null | undefined) { return value === undefined || value === null ? 'Not available' : formatNumber(value) }
function formatMaybeNumber(value: number | null | undefined, suffix = '') { return value === undefined || value === null ? 'N/A' : `${value.toLocaleString()}${suffix}` }
function localDateInZone(value: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) }
function localDateTimeInput() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16) }
function comparisonChange(value: number | null) { return value === null ? 'N/A' : `${value > 0 ? '+' : ''}${value.toLocaleString()}` }
function cadenceText(periodData: NonNullable<typeof evaluation.value>['baseline']) { return periodData ? `IG ${periodData.cadence.instagram.weeklyCounts.join(' / ')} · LI ${periodData.cadence.linkedin.weeklyCounts.join(' / ')}` : 'No evaluation data' }
async function saveEvaluation() {
  evaluationSaving.value = true
  const result = await performance.configureEvaluation({ startDate: evaluationStart.value, definitions: { customNotes: measurementDefinitionNotes.value } })
  evaluationSaving.value = false
  if (result) ui.notify('Evaluation configuration saved as a new revision.', 'success')
}
async function saveSnapshot() {
  const config = evaluation.value?.evaluation
  if (!config) return
  if (!snapshotForm.instagramFollowers && !snapshotForm.linkedinFollowers) { performance.evaluationError = 'Enter at least one verified follower measurement.'; return }
  const measurements = { instagramFollowers: snapshotForm.instagramFollowers === '' ? null : Number(snapshotForm.instagramFollowers), linkedinFollowers: snapshotForm.linkedinFollowers === '' ? null : Number(snapshotForm.linkedinFollowers) }
  const capturedAt = new Date().toISOString()
  const saved = await performance.recordSnapshot(config.id, { stage: snapshotForm.stage, capturedAt, measurements, source: snapshotForm.source, notes: snapshotForm.notes || null })
  if (saved) ui.notify(`${snapshotForm.stage === 'week0' ? 'Week 0' : 'Week 4'} snapshot recorded.`, 'success')
}
async function saveBusinessInquiry() {
  const result = await performance.addBusinessInquiry({ ...inquiryForm, receivedAt: new Date(inquiryForm.receivedAt).toISOString(), companyName: inquiryForm.companyName || null, prospectId: inquiryForm.prospectId || null, sourceReference: inquiryForm.sourceReference || null, followUpNotes: inquiryForm.followUpNotes || null })
  if (!result) return
  inquiryForm.summary = ''; inquiryForm.companyName = ''; inquiryForm.prospectId = ''; inquiryForm.sourceReference = ''; inquiryForm.followUpNotes = ''
  ui.notify('Inbound inquiry recorded separately from outbound replies.', 'success')
}
async function saveProductionTime() {
  if (!productionForm.contentId || !productionForm.minutes) return
  const saved = await performance.addProductionTime({ contentId: productionForm.contentId, minutes: Number(productionForm.minutes), occurredAt: new Date(productionForm.occurredAt).toISOString(), notes: productionForm.notes || undefined })
  if (saved) { productionForm.minutes = ''; productionForm.notes = ''; ui.notify('Active production time recorded.', 'success') }
}
function toneForConsistency(value: number): Tone { return value >= 100 ? 'success' : value >= 75 ? 'info' : 'warning' }
function openLog() { resetLog(); logError.value = ''; logModalOpen.value = true }
function resetLog() { Object.assign(logForm, { platform: 'linkedin', weekStart: selectedMetrics.value.weeks.at(-1) ?? '2026-09-07', followers: '', reach: '', impressions: '', likes: '', comments: '', saves: '', publishedPosts: '' }) }
function saveMetric() {
  const required = ['followers', 'reach', 'impressions', 'likes', 'comments', 'saves', 'publishedPosts'] as const
  if (!logForm.weekStart || required.some((key) => logForm[key] === '' || Number(logForm[key]) < 0)) { logError.value = 'Enter a valid week and non-negative metric values.'; return }
  performance.addWeeklyMetric({ platform: logForm.platform, weekStart: logForm.weekStart, followers: Number(logForm.followers), reach: Number(logForm.reach), impressions: Number(logForm.impressions), likes: Number(logForm.likes), comments: Number(logForm.comments), saves: Number(logForm.saves), publishedPosts: Number(logForm.publishedPosts) })
  logModalOpen.value = false
  ui.notify('Weekly metrics saved to the backend.', 'success')
}
function exportReport() { ui.notify('Report export is not part of the backend contract.', 'info') }
*/

const report = computed(() => performance.report)
const periodWeeks = computed(() => Number(period.value) as PeriodWeeks)
const reportWeeks = computed(() => report.value?.weekly ?? [])
const selectedWeeks = computed(() => reportWeeks.value.filter((item) => item.platform === (platform.value === 'combined' ? 'combined' : platform.value)))
const currentSeries = computed(() => selectedWeeks.value)
const followerSeries = computed(() => ({
  instagram: reportWeeks.value.filter((item) => item.platform === 'instagram'),
  linkedin: reportWeeks.value.filter((item) => item.platform === 'linkedin'),
}))
const followerSummary = computed(() => report.value?.followers ?? [])
const selectedFollower = computed(() => platform.value === 'combined' ? undefined : followerSummary.value.find((item) => item.platform === platform.value))
const followerChangeLabel = computed(() => {
  const values = platform.value === 'combined' ? followerSummary.value : selectedFollower.value ? [selectedFollower.value] : []
  return values.length ? values.map((item) => `${platformLabel(item.platform)} ${signedNumber(item.change)}`).join(' · ') : 'No observations'
})
const followerChangeDetail = computed(() => {
  const values = platform.value === 'combined' ? followerSummary.value : selectedFollower.value ? [selectedFollower.value] : []
  if (!values.length) return 'No follower observations'
  const available = values.filter((item) => item.changePercent !== null).map((item) => `${platformLabel(item.platform)} ${formatPercent(item.changePercent)}`)
  const unavailable = values.filter((item) => item.changePercent === null).map((item) => `${platformLabel(item.platform)} percentage unavailable`)
  return [...available, ...unavailable].join(' · ')
})
const latestReach = computed(() => report.value?.summary.latestWeeklyReach ?? null)
const impressionsTotal = computed(() => report.value?.summary.impressions ?? null)
const engagementRate = computed(() => report.value?.summary.engagementRate ?? null)
const latestWeekLabel = computed(() => {
  const latest = report.value?.period.recordedWeekStarts.at(-1)
  return latest ? formatDate(latest, { month: 'short', day: 'numeric' }) : 'No recorded week'
})
const latestReachDetail = computed(() => latestReach.value === null ? 'No compatible weekly account observation' : `${latestWeekLabel.value} · latest reported week`)
const impressionsDetail = computed(() => impressionsTotal.value === null ? 'No impressions returned by current sources' : `Total for ${period.value} weeks`)
const engagementDetail = computed(() => engagementRate.value === null ? 'Native platform rate is unavailable; no dashboard formula is substituted' : 'Native LinkedIn Analytics value as recorded')
const publishedCount = computed(() => report.value?.summary.published.effectivePosts ?? 0)
const consistency = computed(() => report.value?.consistency.map((item) => ({ platform: item.platform, published: item.published.effectivePosts, expected: item.expected, percent: item.percent })) ?? [])
const consistencyLabel = computed(() => consistency.value.length ? consistency.value.map((item) => `${platformLabel(item.platform)} ${formatPercent(item.percent)}`).join(' · ') : 'No observations')
const executionSummary = computed(() => ({
  planned: report.value?.execution.planned ?? 0,
  published: report.value?.execution.publishedWithinCohort ?? 0,
  pending: report.value?.execution.pending ?? 0,
  onTime: report.value?.execution.onTime ?? 0,
}))
const outputBreakdown = computed(() => ({
  created: report.value?.contentOutput.created ?? 0,
  approved: report.value?.contentOutput.approved ?? 0,
  scheduled: report.value?.contentOutput.scheduled ?? 0,
  published: report.value?.contentOutput.published ?? 0,
}))
const reachChart = computed(() => [{
  label: platform.value === 'combined' ? 'Combined Platform Reach' : `${platformLabel(platform.value)} Reach`,
  color: platform.value === 'instagram' ? '#7c3aed' : '#1d4ed8',
  values: currentSeries.value.map((item) => item.reach),
}])
const followerChart = computed(() => platform.value === 'combined'
  ? [{ label: 'Instagram', color: '#7c3aed', values: followerSeries.value.instagram.map((item) => item.followers) }, { label: 'LinkedIn', color: '#1d4ed8', values: followerSeries.value.linkedin.map((item) => item.followers) }]
  : [{ label: platformLabel(platform.value), color: platform.value === 'instagram' ? '#7c3aed' : '#1d4ed8', values: (platform.value === 'instagram' ? followerSeries.value.instagram : followerSeries.value.linkedin).map((item) => item.followers) }])
const chartLabels = computed(() => selectedWeeks.value.map((item) => `W${item.weekStart.slice(5, 7)}-${item.weekStart.slice(8, 10)}`))
const recentPublished = computed(() => performance.publications.map((item) => ({
  record: { id: item.content.id, title: item.content.title, topic: item.content.title },
  platform: item.publication.platform,
  publication: item.publication,
  reach: item.platformMetricsForPublicationWeek?.reach ?? null,
  impressions: item.platformMetricsForPublicationWeek?.impressions ?? null,
  engagements: item.platformMetricsForPublicationWeek?.engagements ?? null,
  postMetrics: item.postMetrics,
})))
const visibleRecentPublished = computed(() => recentPublished.value.slice((recentPublishedPage.value - 1) * recentPublishedPageSize.value, recentPublishedPage.value * recentPublishedPageSize.value))
watch([platform, () => performance.publications.length], () => { recentPublishedPage.value = 1 })
const inquiryWindow = computed(() => report.value?.inquiries.weeks.slice(-periodWeeks.value) ?? [])
const inquiryTotal = computed(() => inquiryWindow.value.reduce((sum, item) => sum + item.count, 0))

function platformLabel(value: PlatformFilter | PerformancePlatform) { return value === 'instagram' ? 'Instagram' : value === 'linkedin' ? 'LinkedIn' : 'Combined' }
function formatNumber(value: number | null) { return value === null ? 'Not available' : value.toLocaleString() }
function formatKpiNumber(value: number | null) { return value === null ? 'Not available' : value.toLocaleString() }
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) { return new Intl.DateTimeFormat(undefined, options).format(value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)) }
function formatPercent(value: number | null) { return value === null ? 'Not available' : `${value.toFixed(1)}%` }
function formatMetric(value: number | null | undefined) { return value === undefined || value === null ? 'Not available' : formatNumber(value) }
function signedNumber(value: number | null) { return value === null ? 'Not available' : `${value >= 0 ? '+' : ''}${formatNumber(value)}` }
function toneForConsistency(value: number): Tone { return value >= 100 ? 'success' : value >= 75 ? 'info' : 'warning' }
function formatMaybeNumber(value: number | null | undefined, suffix = '') { return value === undefined || value === null ? 'N/A' : `${value.toLocaleString()}${suffix}` }
function localDateInZone(value: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) }
function addLocalDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function localDateTimeInput() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16) }
function comparisonChange(value: number | null) { return value === null ? 'N/A' : `${value > 0 ? '+' : ''}${value.toLocaleString()}` }
function growthForPublication(publication: CustomEvaluationRange['publications'][number]) {
  const values = publication.metricHistory.flatMap((snapshot) => {
    const raw = snapshot[growthMetric.value as keyof typeof snapshot]
    return raw === null ? [] : [Number(raw)]
  })
  if (values.length < 2) return null
  const first = values[0]!
  const change = values.at(-1)! - first
  return { change, percentage: first > 0 ? change / first * 100 : null }
}
async function saveEvaluation() {
  evaluationSaving.value = true
  const result = await performance.configureEvaluation({ startDate: evaluationStart.value, definitions: { customNotes: measurementDefinitionNotes.value } })
  evaluationSaving.value = false
  if (result) ui.notify('Evaluation configuration saved as a new revision.', 'success')
}
async function applyCustomRange() {
  if (!customRangeStart.value || !customRangeEnd.value || customRangeStart.value > customRangeEnd.value) {
    performance.customRangeError = 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir.'
    return
  }
  customRangeApplying.value = true
  await performance.loadCustomEvaluationRange(customRangeStart.value, customRangeEnd.value)
  customRangeApplying.value = false
}
async function saveSnapshot() {
  const config = evaluation.value?.evaluation
  if (!config) return
  if (!snapshotForm.instagramFollowers && !snapshotForm.linkedinFollowers) { performance.evaluationError = 'Enter at least one verified follower measurement.'; return }
  const measurements = { instagramFollowers: snapshotForm.instagramFollowers === '' ? null : Number(snapshotForm.instagramFollowers), linkedinFollowers: snapshotForm.linkedinFollowers === '' ? null : Number(snapshotForm.linkedinFollowers) }
  const saved = await performance.recordSnapshot(config.id, { stage: snapshotForm.stage, capturedAt: new Date().toISOString(), measurements, source: snapshotForm.source, notes: snapshotForm.notes || null })
  if (saved) ui.notify(`${snapshotForm.stage === 'week0' ? 'Week 0' : 'Week 4'} snapshot recorded.`, 'success')
}
async function saveBusinessInquiry() {
  const result = await performance.addBusinessInquiry({ ...inquiryForm, receivedAt: new Date(inquiryForm.receivedAt).toISOString(), companyName: inquiryForm.companyName || null, prospectId: inquiryForm.prospectId || null, sourceReference: inquiryForm.sourceReference || null, followUpNotes: inquiryForm.followUpNotes || null })
  if (!result) return
  inquiryForm.summary = ''; inquiryForm.companyName = ''; inquiryForm.prospectId = ''; inquiryForm.sourceReference = ''; inquiryForm.followUpNotes = ''
  ui.notify('Inbound inquiry recorded separately from outbound replies.', 'success')
}
async function saveProductionTime() {
  if (!productionForm.contentId || !productionForm.minutes) return
  const saved = await performance.addProductionTime({ contentId: productionForm.contentId, minutes: Number(productionForm.minutes), occurredAt: new Date(productionForm.occurredAt).toISOString(), notes: productionForm.notes || undefined })
  if (saved) { productionForm.minutes = ''; productionForm.notes = ''; ui.notify('Active production time recorded.', 'success') }
}
onMounted(async () => {
  void performance.load(periodWeeks.value, platform.value)
  await Promise.all([performance.loadEvaluation(), performance.loadCustomEvaluationRange?.(customRangeStart.value, customRangeEnd.value), contentLibrary.load()])
  try { prospects.value = (await listProspects(new URLSearchParams({ page: '1', limit: '100' }))).data }
  catch { prospects.value = [] }
})
watch([period, platform], () => { void performance.load(periodWeeks.value, platform.value) })
</script>

<template>
  <div class="page-stack performance-page">
    <PageHeader :title="isEvaluationPage ? 'Performance Evaluation' : 'Performance'" :description="isEvaluationPage ? 'Set the evaluation period, record verified observations, and review the supporting evidence.' : 'A focused view of publishing activity and channel results.'" :breadcrumbs="[{ label: 'Performance', to: '/performance' }, ...(isEvaluationPage ? [{ label: 'Evaluation' }] : [])]" :help="isEvaluationPage ? evaluationHelp : overviewHelp">
      <template #actions><div v-if="!isEvaluationPage" class="performance-header-controls"><BaseSelect v-model="period" label="Reporting period" :options="periodOptions" size="compact" /><BaseSelect v-model="platform" label="Platform" :options="platformOptions" size="compact" /><BaseButton variant="secondary" @click="router.push('/performance/evaluation')"><AppIcon name="check" :size="16" />Open Evaluation</BaseButton></div><div v-else class="performance-header-controls"><BaseButton variant="secondary" @click="router.push('/performance')"><AppIcon name="arrow-left" :size="16" />Back to Performance</BaseButton><BaseButton variant="secondary" @click="router.push('/performance/linkedin')"><AppIcon name="linkedin" :size="16" />LinkedIn Metrics</BaseButton></div></template>
    </PageHeader>
    <InlineAlert v-if="performance.loading" title="Loading performance">Reading the backend performance report…</InlineAlert>
    <InlineAlert v-else-if="performance.error" title="Performance unavailable" tone="danger">{{ performance.error }}</InlineAlert>

    <template v-if="performance.loaded || evaluation">
    <section v-if="!isEvaluationPage" class="performance-toolbar" aria-label="Performance data controls"><div class="performance-toolbar__note"><AppIcon name="chart" :size="16" /><span>Metrics summarize the selected period. Missing provider values appear as “Not available”.</span></div><div class="performance-toolbar__source"><span>Instagram · Backend report</span><span>LinkedIn · Manual entry</span></div></section>

    <section v-if="isEvaluationPage" class="evaluation-section" aria-label="Four-week research evaluation">
      <BaseCard title="Custom date range" description="Choose any start and end date to review published content and prospect outreach week by week.">
        <div class="evaluation-controls"><BaseInput v-model="customRangeStart" label="Start date" type="date" /><BaseInput v-model="customRangeEnd" label="End date" type="date" /><BaseButton :disabled="customRangeApplying || !customRangeStart || !customRangeEnd || customRangeStart > customRangeEnd" @click="applyCustomRange">{{ customRangeApplying ? 'Loading…' : 'Apply date range' }}</BaseButton></div>
        <p v-if="customRange" class="helper-text">{{ formatDate(customRange.range.startDate) }} – {{ formatDate(customRange.range.endDate) }} · {{ customRange.range.days }} days · timezone {{ customRange.range.timezone }}</p>
        <InlineAlert v-if="performance.customRangeError" title="Date range unavailable" tone="danger">{{ performance.customRangeError }}</InlineAlert>
        <div v-if="performance.customRangeLoading" class="evaluation-note" role="status">Loading the selected period…</div>
        <template v-if="customRange">
          <div class="custom-range-summary"><div><strong>{{ formatNumber(customRange.totals.publishedPosts) }}</strong><span>published posts</span><small>{{ customRange.totals.instagram }} Instagram · {{ customRange.totals.linkedin }} LinkedIn</small></div><div><strong>{{ formatNumber(customRange.totals.uniqueContentCampaigns) }}</strong><span>content campaigns</span><small>{{ customRange.totals.prospectLinkedPublications }} linked to prospects</small></div><div><strong>{{ formatNumber(customRange.totals.outboundActivities) }}</strong><span>outbound activities</span><small>{{ customRange.totals.prospectsContacted }} prospects emailed</small></div><div><strong>{{ formatNumber(customRange.totals.repliesReceived) }}</strong><span>replies received</span><small>{{ customRange.totals.interestedResponses }} interested</small></div></div>
          <section class="content-growth" aria-label="Content growth chart">
            <div class="content-growth__heading"><div><h3>Content growth preview</h3><p>Track the selected post's metric across Instagram sync snapshots.</p></div><div class="content-growth__filters"><BaseSelect v-model="growthPublicationId" label="Published content" :options="growthPublicationOptions" /><BaseSelect v-model="growthMetric" label="Metric" :options="growthMetricOptions" /></div></div>
            <p class="helper-text">{{ selectedGrowthPublication?.platform === 'instagram' ? (selectedGrowthObservations.some(item => item.value !== null) ? 'Instagram post metrics are cumulative. Growth compares the first and latest saved observations; sync Instagram regularly to build a trend.' : 'No Instagram post metrics are stored yet. Connect Instagram and sync to start collecting observations for this content.') : 'LinkedIn post-level metrics are not available from the current data source. The chart will appear when this content has supported metric observations.' }}</p>
            <div v-if="contentGrowth" class="content-growth__stats"><div><span>Latest {{ selectedGrowthMetricLabel.toLowerCase() }}</span><strong>{{ formatNumber(contentGrowth.latest) }}</strong></div><div><span>Change since first observation</span><strong>{{ signedNumber(contentGrowth.change) }}</strong></div><div><span>Growth</span><strong>{{ contentGrowth.percentage === null ? 'N/A' : formatPercent(contentGrowth.percentage) }}</strong></div></div>
            <TrendChart :labels="growthChartLabels" :series="growthChartSeries" :format-value="formatNumber" />
            <p v-if="selectedGrowthPublication && selectedGrowthObservations.filter(item => item.value !== null).length < 2" class="helper-text">{{ selectedGrowthObservations.some(item => item.value !== null) ? 'One observation is available. Sync Instagram again later to see growth over time.' : `No ${selectedGrowthMetricLabel.toLowerCase()} observations are available for this content yet.` }}</p>
          </section>
          <div class="evaluation-table-wrap"><table class="performance-table evaluation-table custom-range-content-table"><caption>Post-level metrics for published content in the selected range</caption><thead><tr><th>Content</th><th>Platform</th><th>Published</th><th>Views</th><th>Reach</th><th>Interactions</th><th>{{ selectedGrowthMetricLabel }} growth</th><th>Observations</th></tr></thead><tbody><tr v-for="publication in customRange.publications" :key="publication.id"><th scope="row"><button type="button" class="content-link" @click="growthPublicationId = publication.id"><strong>{{ publication.title }}</strong><small>{{ publication.targetIndustry || 'general' }} · {{ publication.targetProspectId ? 'prospect-linked' : 'no prospect linked' }}</small></button></th><td>{{ publication.platform }}</td><td>{{ formatDate(publication.publishedAt) }}</td><td>{{ publication.metrics?.views === null || !publication.metrics ? 'Not available' : formatNumber(Number(publication.metrics.views)) }}</td><td>{{ publication.metrics?.reach === null || !publication.metrics ? 'Not available' : formatNumber(Number(publication.metrics.reach)) }}</td><td>{{ publication.metrics?.totalInteractions === null || !publication.metrics ? 'Not available' : formatNumber(Number(publication.metrics.totalInteractions)) }}</td><td>{{ growthForPublication(publication) ? `${signedNumber(growthForPublication(publication)!.change)}${growthForPublication(publication)!.percentage === null ? '' : ` (${formatPercent(growthForPublication(publication)!.percentage!)})`}` : 'Need 2 observations' }}</td><td>{{ publication.metricHistory.length }}</td></tr><tr v-if="!customRange.publications.length"><td colspan="8">No published content in this date range.</td></tr></tbody></table></div>
          <div class="evaluation-table-wrap"><table class="performance-table evaluation-table custom-range-table"><caption>Weekly publishing and prospect activity, with weeks counted from the selected start date</caption><thead><tr><th>Week</th><th>Published</th><th>Instagram</th><th>LinkedIn</th><th>Outbound</th><th>Prospects emailed</th><th>Replies</th><th>Follow-ups</th><th>Meetings</th><th>Demos</th></tr></thead><tbody><tr v-for="week in customRange.weekly" :key="week.startDate"><th scope="row">{{ formatDate(week.startDate, { month: 'short', day: 'numeric' }) }} – {{ formatDate(week.endDate, { month: 'short', day: 'numeric', year: 'numeric' }) }}</th><td>{{ week.publishedPosts }}</td><td>{{ week.instagram }}</td><td>{{ week.linkedin }}</td><td>{{ week.outboundActivities }}</td><td>{{ week.prospectsContacted }}</td><td>{{ week.repliesReceived }}<small>{{ week.interestedResponses }} interested</small></td><td>{{ week.followUpsCompleted }}</td><td>{{ week.meetings }}</td><td>{{ week.demonstrations }}</td></tr><tr v-if="customRange.weekly.length === 0"><td colspan="10">No activity in this date range.</td></tr></tbody></table></div>
          <details class="evaluation-details"><summary>Prospect activities ({{ customRange.outboundActivities.length }})</summary><ul class="inquiry-record-list"><li v-for="activity in customRange.outboundActivities" :key="activity.id">{{ activity.occurredAt ? formatDate(activity.occurredAt.slice(0, 10)) : '—' }} · {{ activity.prospectName }} · {{ activity.activityType.replaceAll('_', ' ') }}<span v-if="activity.responseClassification"> · {{ activity.responseClassification.replaceAll('_', ' ') }}</span></li><li v-if="!customRange.outboundActivities.length">No prospect activities during this range.</li></ul></details>
        </template>
      </BaseCard>
      <BaseCard title="1. Set the evaluation dates" description="Choose when the 4-week intervention begins. The 4 weeks before it become the baseline.">
        <p class="form-guidance">Start here even if you have not entered any measurements yet. Saving a changed date creates a new revision and keeps the previous results.</p>
        <div class="evaluation-controls"><BaseInput v-model="evaluationStart" label="Intervention start date" type="date" /><BaseInput v-model="measurementDefinitionNotes" label="Custom measurement notes (optional)" /><BaseButton :disabled="evaluationSaving || !evaluationStart" @click="saveEvaluation">{{ evaluationSaving ? 'Saving…' : evaluation?.evaluation ? 'Save New Revision' : 'Set evaluation dates' }}</BaseButton></div>
        <p class="helper-text">{{ evaluationPeriodsLabel }} · Timezone: {{ evaluation?.evaluation?.timezone ?? 'Asia/Jakarta' }}</p>
        <div v-if="performance.evaluationLoading" class="evaluation-note" role="status">Loading evaluation data…</div>
        <InlineAlert v-else-if="performance.evaluationError" title="Evaluation data unavailable" tone="danger">{{ performance.evaluationError }}</InlineAlert>
        <template v-if="evaluation?.evaluation">
          <div class="evaluation-progress"><div><strong>{{ evaluation.progress.elapsedDays }} / 28 intervention days</strong><span>{{ evaluation.progress.complete ? 'Four-week intervention complete' : 'Partial intervention; changes remain unavailable until all 28 days elapse.' }}</span></div><div class="progress-track"><span :style="{ width: `${evaluation.progress.elapsedPercent}%` }" /></div></div>
          <details class="evaluation-details"><summary>View data source status</summary><div class="source-status-list"><div v-for="source in evaluation.completeness.sources" :key="source.source"><span>{{ source.source }}</span><strong>{{ source.status.replace('_', ' ') }} · {{ source.records }} records</strong></div></div></details>
        </template>
      </BaseCard>

      <BaseCard v-if="evaluation?.evaluation" title="2. Record follower snapshots" description="Save the Instagram or LinkedIn follower count at the start and end of the intervention.">
        <p class="form-guidance">Choose a checkpoint, copy the current follower count from the platform, and note where you checked it. Leave a platform blank if you could not verify its count.</p>
        <div class="snapshot-form"><BaseSelect v-model="snapshotForm.stage" label="Measurement point" :options="[{ value: 'week0', label: 'Week 0 · intervention start' }, { value: 'week4', label: 'Week 4 · intervention end' }]" /><BaseInput v-model="snapshotForm.instagramFollowers" label="Instagram followers" type="number" min="0" /><BaseInput v-model="snapshotForm.linkedinFollowers" label="LinkedIn followers" type="number" min="0" /><BaseInput v-model="snapshotForm.source" label="Where did you check?" /><BaseInput v-model="snapshotForm.notes" label="Notes (optional)" /><BaseButton @click="saveSnapshot">Save snapshot</BaseButton></div>
        <p v-if="evaluation.evaluation.snapshots.length" class="helper-text">Saved checkpoints: {{ evaluation.evaluation.snapshots.map(item => `${item.stage} · ${formatDate(item.capturedAt)}`).join(' · ') }}</p>
        <p v-else class="helper-text">No snapshots saved yet.</p>
      </BaseCard>

      <BaseCard v-if="evaluation?.evaluation" title="3. Compare results" description="Compare the 4-week baseline with the intervention. Missing or incomplete values appear as N/A.">
        <details class="evaluation-details" open><summary>Baseline and intervention comparison</summary><div class="evaluation-table-wrap"><table class="performance-table evaluation-table"><caption>Baseline and intervention KPI comparison</caption><thead><tr><th>KPI</th><th>Baseline</th><th>Intervention</th><th>Absolute change</th><th>Change %</th><th>Source / status</th></tr></thead><tbody><tr v-for="item in visibleEvaluationComparison" :key="item.kpi"><th scope="row">{{ item.kpi }}</th><td>{{ formatMaybeNumber(item.baseline) }}</td><td>{{ formatMaybeNumber(item.intervention) }}</td><td>{{ comparisonChange(item.absoluteChange) }}</td><td>{{ formatPercent(item.percentageChange) }}</td><td>{{ item.source }} · {{ item.status }}<small v-if="item.sourceRecordIds?.length">{{ item.sourceRecordIds.join(', ') }}</small></td></tr></tbody></table><TablePagination v-model:page="evaluationComparePage" v-model:page-size="evaluationComparePageSize" :total="evaluation.comparison.length" /></div></details>
      </BaseCard>
    </section>

    <details v-if="isEvaluationPage && evaluation?.evaluation && evaluation.baseline && evaluation.intervention" class="evaluation-details evaluation-more"><summary><strong>Additional data and activity</strong><span>Production time, inquiries, platform observations, outbound activity, and source records</span></summary>
    <section class="evaluation-section">
      <div class="evaluation-two-column">
        <BaseCard title="Marketing Execution" description="Posting consistency is based on actual publication records. Variability uses population standard deviation ÷ mean across four weeks.">
          <div class="platform-execution-grid"><div v-for="name in platformRows" :key="name" class="platform-execution"><strong>{{ platformLabel(name) }} · target 2/week</strong><p>Baseline weekly posts: {{ evaluation.baseline.cadence[name].weeklyCounts.join(' · ') }} <span>({{ evaluation.baseline.cadence[name].weeksMeetingTarget }}/4 weeks at target)</span></p><p>Intervention weekly posts: {{ evaluation.intervention.cadence[name].weeklyCounts.join(' · ') }} <span>({{ evaluation.intervention.cadence[name].weeksMeetingTarget }}/4 weeks at target)</span></p><p>CV: {{ formatMaybeNumber(evaluation.baseline.cadence[name].coefficientOfVariation, '×') }} baseline · {{ formatMaybeNumber(evaluation.intervention.cadence[name].coefficientOfVariation, '×') }} intervention</p></div></div>
          <dl class="summary-list"><div><dt>Campaigns with publication · baseline / intervention</dt><dd>{{ evaluation.baseline.publications.campaigns }} / {{ evaluation.intervention.publications.campaigns }}</dd></div><div><dt>Planned · baseline / intervention</dt><dd>{{ evaluation.baseline.schedules.planned }} / {{ evaluation.intervention.schedules.planned }}</dd></div><div><dt>Published posts · baseline / intervention</dt><dd>{{ evaluation.baseline.publications.total }} / {{ evaluation.intervention.publications.total }}</dd></div></dl>
          <p class="helper-text">Intervention targeting — industry: {{ evaluation.intervention.publications.targeting.industryTargeted }} ({{ evaluation.intervention.publications.targeting.industryOnly }} without a prospect) · prospect-linked: {{ evaluation.intervention.publications.targeting.prospectLinked }} · general: {{ evaluation.intervention.publications.targeting.general }}. Industries: {{ Object.entries(evaluation.intervention.publications.targeting.byIndustry).map(([industry, count]) => `${industry} (${count})`).join(', ') || 'none recorded' }}.</p>
          <ul class="inquiry-record-list"><li v-for="record in evaluation.intervention.publications.records.slice(0, 8)" :key="String(record.id)">{{ record.platform }} · {{ record.contentId }} · {{ record.targetIndustry || 'general' }} · prospect {{ record.targetProspectId || 'none' }} · published {{ record.publishedAt }} · marker {{ record.markedBy }} · record {{ record.id }}</li><li v-if="!evaluation.intervention.publications.records.length">No intervention publication records.</li></ul>
        </BaseCard>
        <BaseCard title="Content Production Time" description="Active founder minutes recorded per content campaign. Idle and waiting time are excluded; intervention values are descriptive.">
          <div class="output-grid"><div><strong>{{ formatMaybeNumber(evaluation.intervention.productionTime.median, ' min') }}</strong><span>Intervention median</span></div><div><strong>{{ formatMaybeNumber(evaluation.intervention.productionTime.minimum, ' min') }}</strong><span>Minimum</span></div><div><strong>{{ formatMaybeNumber(evaluation.intervention.productionTime.maximum, ' min') }}</strong><span>Maximum</span></div><div><strong>{{ evaluation.intervention.productionTime.count }}</strong><span>Recorded campaigns</span></div></div>
          <p class="helper-text">No comparable pre-deployment efficiency claim is made. Session records:</p><ul class="inquiry-record-list"><li v-for="observation in evaluation.intervention.productionTime.sourceObservations" :key="observation.id">{{ observation.contentId }} · {{ observation.minutes }} active minutes · completed {{ observation.occurredAt }} · recorded {{ observation.recordedAt }} · user {{ observation.recordedBy }} · {{ observation.id }}</li><li v-if="!evaluation.intervention.productionTime.sourceObservations.length">No session records.</li></ul>
          <form class="evaluation-form" @submit.prevent="saveProductionTime"><p class="form-guidance">Record focused work for one saved content item. Count time spent creating or editing; exclude waiting, meetings, and breaks.</p><BaseSelect v-model="productionForm.contentId" label="Content campaign" :options="[{ value: '', label: 'Choose saved content' }, ...contentOptions]" required /><BaseInput v-model="productionForm.minutes" label="Active minutes" type="number" min="1" max="1440" required /><BaseInput v-model="productionForm.occurredAt" label="Work completed at" type="datetime-local" required /><BaseInput v-model="productionForm.notes" label="Included active work (optional)" /><BaseButton type="submit" :disabled="!productionForm.contentId || !productionForm.minutes">Record Active Time</BaseButton></form>
        </BaseCard>
      </div>
      <div class="evaluation-two-column">
        <BaseCard title="Instagram Performance*" description="Account-level observations and post-level media observations remain separate. Post reach is not unique account reach; missing API fields display as N/A.">
          <div class="platform-observation"><strong>Account level</strong><p v-for="observation in evaluation.intervention.social.instagram.weeklyAccountObservations" :key="String(observation.id)">{{ observation.weekStart }} · followers {{ observation.followers }} · account reach {{ observation.accountReach ?? 'N/A' }} · source {{ observation.source }} · record {{ observation.id }}</p><p v-if="!evaluation.intervention.social.instagram.weeklyAccountObservations.length">No account-level Instagram observations.</p></div>
          <div class="platform-observation"><strong>Post level</strong><p v-for="observation in evaluation.intervention.social.instagram.postObservations" :key="String(observation.publicationId)">{{ observation.publishedAt }} · views {{ observation.views ?? 'N/A' }} · reach {{ observation.reach ?? 'N/A' }} · likes {{ observation.likes ?? 'N/A' }} · comments {{ observation.comments ?? 'N/A' }} · saves {{ observation.saves ?? 'N/A' }} · shares {{ observation.shares ?? 'N/A' }} · source {{ observation.source }} · {{ observation.id }}</p><p v-if="!evaluation.intervention.social.instagram.postObservations.length">No post-level Instagram API observations.</p></div>
        </BaseCard>
        <BaseCard title="LinkedIn Performance*" description="Manual native LinkedIn Analytics observations. Engagement rate is shown as recorded; it is not reconstructed from interactions.">
          <div class="platform-observation"><p v-for="observation in evaluation.intervention.social.linkedin.weeklyAccountObservations" :key="String(observation.id)">{{ observation.weekStart }} · followers {{ observation.followers }} · impressions {{ observation.impressions ?? 'N/A' }} · native engagement rate {{ formatMaybeNumber(typeof observation.nativeEngagementRate === 'number' ? observation.nativeEngagementRate : null, '%') }} · account-reported posts {{ observation.reportedPublishedPosts }} (publication ledger remains authoritative) · {{ observation.source }} · recorded {{ observation.recordedAt }} · {{ observation.id }}</p><p v-if="!evaluation.intervention.social.linkedin.weeklyAccountObservations.length">No LinkedIn Analytics observations. Unavailable values are N/A, not zero.</p></div>
        </BaseCard>
      </div>
      <div class="evaluation-two-column">
        <BaseCard title="Inbound Business Inquiries" description="Founder-recorded incoming messages, kept separate from replies to outbound outreach.">
          <p><strong>{{ evaluation.intervention.inquiries.relevant }}</strong> relevant · {{ evaluation.intervention.inquiries.unreviewed }} unreviewed during intervention; baseline {{ evaluation.baseline.inquiries.relevant }} relevant.</p>
          <div class="inquiry-weekly-trend"><span v-for="week in evaluation.intervention.inquiries.weekly" :key="week.weekStart">{{ week.weekStart }} · {{ week.relevant }} relevant / {{ week.recorded }} recorded</span></div>
          <form class="evaluation-form" @submit.prevent="saveBusinessInquiry"><p class="form-guidance">Log an incoming business message. Replies to outbound outreach belong in Prospect Management and should not be recorded here.</p><BaseInput v-model="inquiryForm.receivedAt" label="Received at" type="datetime-local" required /><BaseSelect v-model="inquiryForm.channel" label="Channel" :options="[{ value: 'whatsapp', label: 'WhatsApp Business' }, { value: 'instagram', label: 'Instagram message' }, { value: 'linkedin', label: 'LinkedIn message' }, { value: 'website', label: 'Website' }, { value: 'other', label: 'Other' }]" /><BaseInput v-model="inquiryForm.companyName" label="Company / sender name (optional)" /><BaseSelect v-model="inquiryForm.prospectId" label="Existing prospect (optional)" :options="prospectOptions" /><BaseInput v-model="inquiryForm.summary" label="Inquiry summary" required /><BaseSelect v-model="inquiryForm.relevance" label="Qualification" :options="[{ value: 'unreviewed', label: 'Needs review' }, { value: 'relevant', label: 'Relevant business inquiry' }, { value: 'unrelated', label: 'Unrelated' }]" /><BaseInput v-model="inquiryForm.source" label="Evidence / provenance" required /><BaseInput v-model="inquiryForm.sourceReference" label="Source reference (optional)" /><BaseButton type="submit" :disabled="!inquiryForm.summary.trim()">Record Inquiry</BaseButton></form>
          <ul class="inquiry-record-list"><li v-for="inquiry in evaluation.inquiries.slice(0, 5)" :key="inquiry.id">{{ formatDate(inquiry.receivedAt) }} · {{ inquiry.channel }} · {{ inquiry.relevance }} · {{ inquiry.companyName || inquiry.prospect?.name || 'Name unknown' }} · {{ inquiry.summary }} · {{ inquiry.source }} · recorded by {{ inquiry.recordedBy }} · {{ inquiry.id }}</li><li v-if="!evaluation.inquiries.length">No inquiry events recorded.</li></ul>
        </BaseCard>
        <BaseCard title="Outbound Activities" description="Aggregated from actual Phase 04 events. Drafts, copies, scheduled follow-ups, and inbound inquiries are excluded.">
          <div class="outbound-period"><strong>Baseline</strong><span>Emails {{ evaluation.baseline.outbound.emailsSent }} · follow-ups {{ evaluation.baseline.outbound.followUpsCompleted }} · replies {{ evaluation.baseline.outbound.repliesReceived }} · interested {{ evaluation.baseline.outbound.interestedResponses }} · meetings {{ evaluation.baseline.outbound.meetings }} · demos {{ evaluation.baseline.outbound.demonstrations }} · companies {{ evaluation.baseline.outbound.approachedCompanies }}</span></div>
          <div class="outbound-period"><strong>Intervention</strong><span>Emails {{ evaluation.intervention.outbound.emailsSent }} · follow-ups {{ evaluation.intervention.outbound.followUpsCompleted }} · replies {{ evaluation.intervention.outbound.repliesReceived }} · interested {{ evaluation.intervention.outbound.interestedResponses }} · meetings {{ evaluation.intervention.outbound.meetings }} · demos {{ evaluation.intervention.outbound.demonstrations }} · companies {{ evaluation.intervention.outbound.approachedCompanies }}</span></div>
          <p class="helper-text">Intervention provenance — historical {{ evaluation.intervention.outbound.provenance.historical }}, artifact-assisted {{ evaluation.intervention.outbound.provenance.artifactAssisted }}, non-artifact-assisted {{ evaluation.intervention.outbound.provenance.nonArtifactAssisted }}. Source record IDs: {{ evaluation.intervention.outbound.sourceRecordIds.join(', ') || 'none' }}</p>
          <p class="helper-text">All-history totals: {{ evaluation.historicalOutbound.emailsSent }} sent emails · {{ evaluation.historicalOutbound.followUpsCompleted }} completed follow-ups · {{ evaluation.historicalOutbound.repliesReceived }} replies · {{ evaluation.historicalOutbound.meetings }} meetings · {{ evaluation.historicalOutbound.demonstrations }} demos.</p>
          <p class="helper-text">All-history provenance — historical {{ evaluation.historicalOutbound.provenance.historical }}, artifact-assisted {{ evaluation.historicalOutbound.provenance.artifactAssisted }}, non-artifact-assisted {{ evaluation.historicalOutbound.provenance.nonArtifactAssisted }}.</p>
          <p class="helper-text">Intervention source records: {{ evaluation.intervention.outbound.sourceObservations.slice(0, 8).map(item => `${String(item.activityType)} · ${String(item.provenance)} · ${String(item.id)}`).join(' | ') || 'none' }}</p>
        </BaseCard>
      </div>
      <BaseCard title="KPI Definitions and Caveats" description="The asterisks identify platform-specific measures; wording is maintained here without attributing unverified footnote text to the advisor."><p>* Instagram uses available Graph API observations. Account reach remains account scoped; post reach/views/interactions remain post scoped. LinkedIn values come from native Analytics entry, and native engagement rate is not recalculated. Missing values are unavailable, not zero.</p><p>Baseline and intervention comparisons use 28 local calendar days. Percentage change is N/A when baseline is zero; incomplete intervention comparisons remain N/A until all four weeks elapse. Observed changes do not establish causation, recall, or acquisition attribution.</p><p>Posting target: two actual publication records weekly per platform. CV uses population standard deviation divided by mean; CV is N/A when mean weekly count is zero. Planned and cancelled calendar records do not count as published.</p></BaseCard>
    </section>
    </details>

    <section v-if="!isEvaluationPage" class="kpi-grid" aria-label="Primary metrics">
      <BaseCard v-for="card in [
        { label: 'Follower Growth', value: followerChangeLabel, detail: `${followerChangeDetail} · first-to-latest account observation`, icon: 'company' },
        { label: platform === 'combined' ? 'Combined Platform Reach' : 'Weekly Reach', value: formatKpiNumber(latestReach), detail: latestReachDetail, icon: 'chart' },
        { label: 'Impressions', value: formatKpiNumber(impressionsTotal), detail: impressionsDetail, icon: 'overview' },
        { label: 'Engagement Rate', value: formatPercent(engagementRate), detail: engagementDetail, icon: 'idea' },
        { label: 'Content Published', value: formatNumber(publishedCount), detail: 'Explicit platform publication records', icon: 'library' },
        { label: 'Posting Consistency', value: consistencyLabel, detail: 'Published posts ÷ target (2/week/platform)', icon: 'check' },
      ]" :key="card.label" class="kpi-card"><div class="kpi-card-content"><div class="kpi-card__top"><span>{{ card.label }}</span><AppIcon :name="card.icon" :size="17" /></div><strong>{{ card.value }}</strong><small>{{ card.detail }}</small></div></BaseCard>
    </section>

    <section v-if="!isEvaluationPage" class="chart-grid">
      <BaseCard title="Weekly Reach" :description="platform === 'combined' ? 'Combined Platform Reach across the selected period.' : `${platformLabel(platform)} reach across the selected period.`"><template #actions><div class="chart-legend"><span v-for="item in reachChart" :key="item.label"><i :style="{ background: item.color }" />{{ item.label }}</span></div></template><TrendChart :labels="chartLabels" :series="reachChart" :format-value="formatNumber" /></BaseCard>
      <BaseCard title="Follower Trend" description="Platform follower counts are shown separately when Combined is selected."><template #actions><div class="chart-legend"><span v-for="item in followerChart" :key="item.label"><i :style="{ background: item.color }" />{{ item.label }}</span></div></template><TrendChart :labels="chartLabels" :series="followerChart" :format-value="formatNumber" /></BaseCard>
    </section>

    <section v-if="!isEvaluationPage" class="performance-two-column">
      <BaseCard title="Posting Consistency" description="Published posts compared with the configured target of 2 posts per week per platform."><div class="consistency-list"><div v-for="item in consistency" :key="item.platform" class="consistency-row"><div class="consistency-row__heading"><strong>{{ platformLabel(item.platform) }}</strong><StatusBadge :tone="toneForConsistency(item.percent)">{{ formatPercent(item.percent) }}</StatusBadge></div><div class="consistency-row__meta"><span>Target: {{ item.expected }} posts</span><span>Published: {{ item.published }} / {{ item.expected }}</span></div><div class="progress-track"><span :style="{ width: `${Math.min(100, item.percent)}%` }" :class="{ 'is-complete': item.percent >= 100 }" /></div></div></div></BaseCard>
      <BaseCard title="Execution Summary" description="A compact view of planned and recorded publication work."><dl class="summary-list"><div><dt>Planned</dt><dd>{{ executionSummary.planned }}</dd></div><div><dt>Published</dt><dd>{{ executionSummary.published }}</dd></div><div><dt>Pending Publication</dt><dd>{{ executionSummary.pending }}</dd></div><div><dt>On-time Publication</dt><dd>{{ executionSummary.onTime }}</dd></div></dl><p class="helper-text">These counts use the backend execution report.</p></BaseCard>
    </section>

    <section v-if="!isEvaluationPage" class="performance-two-column">
      <BaseCard title="Content Output" description="Throughput by lifecycle state. Volume is reported without interpreting quality."><div class="output-grid"><div><strong>{{ outputBreakdown.created }}</strong><span>Content Created</span></div><div><strong>{{ outputBreakdown.approved }}</strong><span>Content Approved</span></div><div><strong>{{ outputBreakdown.scheduled }}</strong><span>Content Scheduled</span></div><div><strong>{{ outputBreakdown.published }}</strong><span>Content Published</span></div></div></BaseCard>
      <BaseCard title="Supplementary Inquiry Volume" description="Supplementary Metric · WhatsApp Business manual tracking."><template #actions><strong class="inquiry-total">{{ inquiryTotal }} inquiries</strong></template><div class="inquiry-chart"><div v-for="item in inquiryWindow" :key="item.id" class="inquiry-bar"><span :style="{ height: `${Math.max(8, (item.count / Math.max(1, ...inquiryWindow.map((entry) => entry.count))) * 100)}%` }" /><small>{{ formatDate(item.weekStart, { month: 'short', day: 'numeric' }) }}</small><b>{{ item.count }}</b></div></div><p class="helper-text">Inquiry counts are observed supplementary data; no attribution to individual posts is inferred.</p></BaseCard>
    </section>

      <BaseCard v-if="!isEvaluationPage" title="Recent Published Content" description="Recent publications with metrics returned by the connected platform."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content')">View Content Library <AppIcon name="arrow-right" :size="14" /> </BaseButton></template><div v-if="recentPublished.length" class="performance-table-wrap"><table class="performance-table"><caption class="sr-only">Recent published content performance</caption><thead><tr><th>Content</th><th>Platform</th><th>Published</th><th>Views</th><th>Reach</th><th>Likes</th><th>Comments</th><th>Saves</th><th>Shares</th><th>Total Interactions</th></tr></thead><tbody><tr v-for="item in visibleRecentPublished" :key="`${item.record.id}-${item.platform}`"><td><button type="button" class="content-link" @click="router.push(`/content/${item.record.id}`)"><strong>{{ item.record.title }}</strong><small>{{ item.record.topic }}</small></button></td><td><span class="platform-pill" :class="`is-${item.platform}`"><i />{{ platformLabel(item.platform) }}</span></td><td>{{ new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(item.publication.publishedAt)) }}</td><td>{{ formatMetric(item.postMetrics?.views) }}</td><td>{{ formatMetric(item.postMetrics?.reach) }}</td><td>{{ formatMetric(item.postMetrics?.likes) }}</td><td>{{ formatMetric(item.postMetrics?.comments) }}</td><td>{{ formatMetric(item.postMetrics?.saves) }}</td><td>{{ formatMetric(item.postMetrics?.shares) }}</td><td>{{ formatMetric(item.postMetrics?.totalInteractions) }}</td></tr></tbody></table><TablePagination v-model:page="recentPublishedPage" v-model:page-size="recentPublishedPageSize" :total="recentPublished.length" /></div><EmptyState v-else icon="chart" title="No published content yet." description="Recorded publications will appear here after a publication is logged." /></BaseCard>

    <div v-if="!isEvaluationPage" class="performance-secondary-actions"><BaseButton variant="secondary" size="compact" @click="router.push('/performance/linkedin')">Manage LinkedIn Metrics <AppIcon name="arrow-right" :size="14" /></BaseButton><span>Enter weekly LinkedIn observations from this menu.</span></div>
    </template>

  </div>
</template>

<style scoped>
.performance-page { max-width: 1280px; }
.form-guidance { flex-basis: 100%; margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.55; }
.evaluation-section { display: grid; gap: 18px; }
.evaluation-details { border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); }
.evaluation-details > summary { display: flex; align-items: center; gap: 8px; padding: 14px 16px; color: var(--color-ink); cursor: pointer; font-size: 13px; font-weight: 600; list-style-position: inside; }
.evaluation-details[open] > summary { border-bottom: 1px solid var(--color-border); }
.evaluation-details > :not(summary) { margin: 14px 16px; }
.evaluation-more > summary { align-items: flex-start; flex-direction: column; gap: 4px; }
.evaluation-more > summary span { color: var(--color-muted); font-size: 12px; font-weight: 400; }
.evaluation-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.evaluation-controls, .evaluation-form { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.evaluation-controls > *, .evaluation-form > * { flex: 1 1 170px; }
.custom-range-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
.custom-range-summary > div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); }
.custom-range-summary strong { color: var(--color-ink); font-size: 20px; }
.custom-range-summary span { color: var(--color-ink); font-size: 12px; font-weight: 600; }
.custom-range-summary small { color: var(--color-muted); font-size: 11px; }
.content-growth { display: grid; gap: 8px; margin: 18px 0; padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); }
.content-growth__heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; }
.content-growth__heading h3 { margin: 0; color: var(--color-ink); font-size: 15px; }
.content-growth__heading p { margin: 4px 0 0; color: var(--color-muted); font-size: 12px; }
.content-growth__filters { display: flex; gap: 10px; min-width: min(520px, 60%); }
.content-growth__filters > * { flex: 1 1 180px; }
.content-growth__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.content-growth__stats > div { display: grid; gap: 5px; padding: 10px; border-radius: var(--radius-control); background: var(--color-well); }
.content-growth__stats span { color: var(--color-muted); font-size: 11px; }
.content-growth__stats strong { color: var(--color-ink); font-size: 15px; }
.evaluation-progress { display: grid; gap: 10px; margin: 16px 0; }
.evaluation-progress > div:first-child { display: flex; justify-content: space-between; gap: 12px; color: var(--color-muted); font-size: 12px; }
.source-status-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 16px 0; }
.source-status-list div, .platform-execution, .platform-observation, .outbound-period, .evaluation-snapshot { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); }
.source-status-list div { grid-template-columns: 1fr auto; align-items: center; font-size: 11px; }
.source-status-list strong { color: var(--color-muted); text-transform: capitalize; }
.evaluation-snapshot { margin-top: 14px; }
.snapshot-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 14px; }
.evaluation-table-wrap { overflow-x: auto; margin-top: 16px; }
.evaluation-table { min-width: 820px; }
.custom-range-table { min-width: 1060px; }
.custom-range-content-table { min-width: 900px; }
.platform-execution-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.platform-execution p, .platform-observation p, .evaluation-snapshot p, .outbound-period span { margin: 0; color: var(--color-muted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.platform-observation { margin: 10px 0; max-height: 260px; overflow: auto; }
.outbound-period { margin: 10px 0; }
.inquiry-record-list { display: grid; gap: 8px; padding-left: 18px; color: var(--color-muted); font-size: 11px; overflow-wrap: anywhere; }
.inquiry-weekly-trend { display: grid; gap: 6px; margin: 12px 0; color: var(--color-muted); font-size: 11px; }
.performance-header-controls { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.performance-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-well); color: var(--color-muted); font-size: 12px; }
.performance-toolbar__note, .performance-toolbar__source { display: flex; align-items: center; gap: 8px; }
.performance-toolbar__source { flex-wrap: wrap; justify-content: flex-end; color: var(--color-subtle); font-size: 11px; }
.performance-toolbar__source em { color: var(--color-muted); font-style: normal; }
.performance-toolbar__source span + span::before { content: '·'; margin-right: 8px; }
.kpi-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.kpi-card { min-width: 0; height: 100%; }
.kpi-card-content { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.kpi-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; color: var(--color-subtle); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; min-height: 32px; }
.kpi-card__top .app-icon { flex-shrink: 0; color: var(--color-primary); }
.kpi-card-content > strong { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; flex: 1; color: var(--color-ink); font-size: 16px; font-weight: 700; line-height: 1.35; letter-spacing: -.01em; overflow-wrap: anywhere; margin: 0; }
.kpi-card-content > small { display: block; color: var(--color-muted); font-size: 11px; line-height: 1.45; min-height: 32px; }
.chart-grid, .performance-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 10px; color: var(--color-muted); font-size: 11px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
.chart-legend i { width: 8px; height: 8px; border-radius: 50%; }
.consistency-list { display: grid; gap: 20px; }
.consistency-row { display: grid; gap: 8px; }
.consistency-row__heading, .consistency-row__meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.consistency-row__heading strong { font-size: 14px; }
.consistency-row__meta { color: var(--color-muted); font-size: 12px; }
.progress-track { height: 8px; overflow: hidden; border-radius: 999px; background: var(--color-well); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.progress-track span.is-complete { background: var(--color-success); }
.summary-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.summary-list div { display: grid; gap: 6px; padding: 14px; background: var(--color-surface); }
.summary-list dt { color: var(--color-subtle); font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.summary-list dd { margin: 0; font-size: 18px; font-weight: 700; color: var(--color-ink); }
.helper-text { margin-top: 14px; color: var(--color-subtle); font-size: 12px; line-height: 1.5; }
.output-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.output-grid div { display: flex; flex-direction: column; gap: 6px; padding: 14px 12px; border-radius: var(--radius-control); background: var(--color-well); }
.output-grid strong { font-size: 18px; font-weight: 700; color: var(--color-ink); line-height: 1.2; }
.output-grid span { color: var(--color-muted); font-size: 11px; line-height: 1.35; font-weight: 500; }
.inquiry-total { color: var(--color-ink); font-size: 14px; }
.inquiry-chart { display: flex; align-items: flex-end; gap: 8px; height: 130px; padding: 10px 4px 0; border-bottom: 1px solid var(--color-border); }
.inquiry-bar { display: grid; flex: 1; align-items: end; justify-items: center; gap: 5px; height: 100%; min-width: 0; }
.inquiry-bar span { width: min(22px, 75%); min-height: 8px; border-radius: 4px 4px 0 0; background: var(--color-primary); }
.inquiry-bar small { color: var(--color-subtle); font-size: 9px; white-space: nowrap; }
.inquiry-bar b { position: absolute; transform: translateY(-36px); color: var(--color-muted); font-size: 10px; }
.performance-table-wrap { overflow-x: auto; }
.performance-table { width: 100%; border-collapse: collapse; min-width: 760px; }
.performance-table th, .performance-table td { padding: 12px 10px; border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; font-size: 12px; }
.performance-table th { color: var(--color-subtle); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; }
.performance-table tbody tr:last-child td { border-bottom: 0; }
.content-link { display: grid; gap: 3px; min-width: 260px; color: var(--color-ink); text-align: left; }
.content-link strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content-link small { overflow: hidden; color: var(--color-muted); text-overflow: ellipsis; white-space: nowrap; }
.content-link:hover strong { color: var(--color-link); }
.platform-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 999px; background: var(--color-well); font-size: 11px; }
.platform-pill i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-primary); }
.platform-pill.is-instagram i { background: #7c3aed; }
.performance-secondary-actions { display: flex; align-items: center; gap: 12px; color: var(--color-muted); font-size: 12px; }
.metrics-form { display: grid; gap: 16px; }
.metrics-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.form-error { color: var(--color-danger); font-size: 12px; }
@media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px) { .performance-header-controls { width: 100%; align-items: stretch; } .performance-header-controls > * { flex: 1 1 180px; } .performance-toolbar, .performance-secondary-actions { align-items: flex-start; flex-direction: column; } .performance-toolbar__source { justify-content: flex-start; } .chart-grid, .performance-two-column { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .evaluation-two-column, .platform-execution-grid { grid-template-columns: 1fr; } .custom-range-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .content-growth__heading { align-items: stretch; flex-direction: column; } .content-growth__filters { min-width: 0; flex-direction: column; } .content-growth__stats { grid-template-columns: 1fr; } .evaluation-progress > div:first-child { align-items: flex-start; flex-direction: column; } .snapshot-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 540px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .output-grid { grid-template-columns: repeat(2, 1fr); } .metrics-form__grid, .source-status-list, .snapshot-form { grid-template-columns: 1fr; } }
</style>
