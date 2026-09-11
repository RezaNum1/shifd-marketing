<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import TrendChart from '../components/performance/TrendChart.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { usePerformanceStore } from '../stores/performance'
import { useUiStore } from '../stores/ui'
import type { PerformancePlatform, WeeklyMetric } from '../types/performance'
import type { SelectOption, Tone } from '../types/ui'
import { calculateConsistency, calculateEngagementRate, engagementCount } from '../utils/performanceMetrics'
import { getEffectivePublishedPostCount, metricForPublication } from '../utils/publicationMetrics'
import { contentLifecycle, contentStatus } from '../utils/contentRecords'

type PlatformFilter = 'combined' | PerformancePlatform
type PeriodWeeks = 4 | 8 | 12

const router = useRouter()
const library = useContentLibraryStore()
const performance = usePerformanceStore()
const ui = useUiStore()
const period = ref('8')
const platform = ref<PlatformFilter>('combined')
const logModalOpen = ref(false)
const logError = ref('')
const logForm = reactive({ platform: 'linkedin' as PerformancePlatform, weekStart: '2026-09-07', followers: '', reach: '', impressions: '', likes: '', comments: '', saves: '', publishedPosts: '' })

const periodOptions: SelectOption[] = [{ value: '4', label: 'Last 4 Weeks' }, { value: '8', label: 'Last 8 Weeks' }, { value: '12', label: 'Last 12 Weeks' }]
const platformOptions: SelectOption[] = [{ value: 'combined', label: 'Combined' }, { value: 'instagram', label: 'Instagram' }, { value: 'linkedin', label: 'LinkedIn' }]
const logPlatformOptions: SelectOption[] = [{ value: 'instagram', label: 'Instagram' }, { value: 'linkedin', label: 'LinkedIn' }]
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
const reachTotal = computed(() => currentSeries.value.reduce((total, metric) => total + ('reach' in metric ? metric.reach : 0), 0))
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
const latestWeekLabel = computed(() => selectedMetrics.value.weeks.at(-1) ? formatDate(selectedMetrics.value.weeks.at(-1)!, { month: 'short', day: 'numeric' }) : '—')
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
function formatMetric(value: number | undefined) { return value === undefined ? '—' : formatNumber(value) }
function toneForConsistency(value: number): Tone { return value >= 100 ? 'success' : value >= 75 ? 'info' : 'warning' }
function openLog() { resetLog(); logError.value = ''; logModalOpen.value = true }
function resetLog() { Object.assign(logForm, { platform: 'linkedin', weekStart: selectedMetrics.value.weeks.at(-1) ?? '2026-09-07', followers: '', reach: '', impressions: '', likes: '', comments: '', saves: '', publishedPosts: '' }) }
function saveMetric() {
  const required = ['followers', 'reach', 'impressions', 'likes', 'comments', 'saves', 'publishedPosts'] as const
  if (!logForm.weekStart || required.some((key) => logForm[key] === '' || Number(logForm[key]) < 0)) { logError.value = 'Enter a valid week and non-negative metric values.'; return }
  performance.addWeeklyMetric({ platform: logForm.platform, weekStart: logForm.weekStart, followers: Number(logForm.followers), reach: Number(logForm.reach), impressions: Number(logForm.impressions), likes: Number(logForm.likes), comments: Number(logForm.comments), saves: Number(logForm.saves), publishedPosts: Number(logForm.publishedPosts) })
  logModalOpen.value = false
  ui.notify('Weekly metrics saved locally.', 'success')
}
function exportReport() { ui.notify('Report export is available for the current mock view.', 'info') }
</script>

<template>
  <div class="page-stack performance-page">
    <PageHeader title="Performance" description="Track content execution and social media performance over time." :breadcrumbs="[{ label: 'Planning & Insights' }, { label: 'Performance' }]">
      <template #actions><BaseSelect v-model="period" label="Evaluation period" :options="periodOptions" size="compact" /><BaseSelect v-model="platform" label="Platform" :options="platformOptions" size="compact" /><BaseButton variant="secondary" @click="exportReport"><AppIcon name="library" :size="16" />Export Report</BaseButton><BaseButton @click="openLog"><AppIcon name="plus" :size="16" />Log Weekly Metrics</BaseButton></template>
    </PageHeader>

    <section class="performance-toolbar" aria-label="Performance data controls"><div class="performance-toolbar__note"><AppIcon name="chart" :size="16" /><span>Observed metrics from local demo data. Reach, followers, impressions, and engagement are reported separately.</span></div><div class="performance-toolbar__source"><span>Instagram · Mock Data <em>Future: Instagram Graph API</em></span><span>LinkedIn · Mock Data <em>Future: Manual Entry</em></span><span>WhatsApp · Mock Data <em>Manual Entry</em></span></div></section>

    <section class="kpi-grid" aria-label="Primary metrics">
      <BaseCard v-for="card in [
        { label: 'Follower Growth', value: `+${formatNumber(followerChange)}`, detail: `${formatPercent(followerChangePercent)} · ${platform === 'combined' ? 'platform totals' : platformLabel(platform)}`, icon: 'company' },
        { label: platform === 'combined' ? 'Combined Platform Reach' : 'Weekly Reach', value: formatNumber(latestReach), detail: `${latestWeekLabel} · ${formatNumber(reachTotal)} period reach`, icon: 'chart' },
        { label: 'Impressions', value: formatNumber(impressionsTotal), detail: `Total for ${period} weeks`, icon: 'overview' },
        { label: 'Engagement Rate', value: formatPercent(engagementRate), detail: 'Engagements ÷ impressions', icon: 'idea' },
        { label: 'Content Published', value: formatNumber(publishedCount), detail: 'Platform publication records', icon: 'library' },
        { label: 'Posting Consistency', value: formatPercent(consistency.reduce((sum, item) => sum + item.percent, 0) / consistency.length), detail: 'Against 2 posts / week / platform', icon: 'check' },
      ]" :key="card.label" class="kpi-card"><div class="kpi-card__top"><span>{{ card.label }}</span><AppIcon :name="card.icon" :size="17" /></div><strong>{{ card.value }}</strong><small>{{ card.detail }}</small></BaseCard>
    </section>

    <section class="chart-grid">
      <BaseCard title="Weekly Reach" :description="platform === 'combined' ? 'Combined Platform Reach across the selected period.' : `${platformLabel(platform)} reach across the selected period.`"><template #actions><div class="chart-legend"><span v-for="item in reachChart" :key="item.label"><i :style="{ background: item.color }" />{{ item.label }}</span></div></template><TrendChart :labels="chartLabels" :series="reachChart" :format-value="formatNumber" /></BaseCard>
      <BaseCard title="Follower Trend" description="Platform follower counts are shown separately when Combined is selected."><template #actions><div class="chart-legend"><span v-for="item in followerChart" :key="item.label"><i :style="{ background: item.color }" />{{ item.label }}</span></div></template><TrendChart :labels="chartLabels" :series="followerChart" :format-value="formatNumber" /></BaseCard>
    </section>

    <section class="performance-two-column">
      <BaseCard title="Posting Consistency" description="Published posts compared with the configured target of 2 posts per week per platform."><div class="consistency-list"><div v-for="item in consistency" :key="item.platform" class="consistency-row"><div class="consistency-row__heading"><strong>{{ platformLabel(item.platform) }}</strong><StatusBadge :tone="toneForConsistency(item.percent)">{{ formatPercent(item.percent) }}</StatusBadge></div><div class="consistency-row__meta"><span>Target: {{ item.expected }} posts</span><span>Published: {{ item.published }} / {{ item.expected }}</span></div><div class="progress-track"><span :style="{ width: `${Math.min(100, item.percent)}%` }" :class="{ 'is-complete': item.percent >= 100 }" /></div></div></div></BaseCard>
      <BaseCard title="Execution Summary" description="A compact view of planned and recorded publication work."><dl class="summary-list"><div><dt>Planned</dt><dd>{{ executionSummary.planned }}</dd></div><div><dt>Published</dt><dd>{{ executionSummary.published }}</dd></div><div><dt>Pending Publication</dt><dd>{{ executionSummary.pending }}</dd></div><div><dt>On-time Publication</dt><dd>{{ executionSummary.onTime }}</dd></div></dl><p class="helper-text">These counts use the local Calendar and Content Library records.</p></BaseCard>
    </section>

    <section class="performance-two-column">
      <BaseCard title="Content Output" description="Throughput by lifecycle state. Volume is reported without interpreting quality."><div class="output-grid"><div><strong>{{ outputBreakdown.created }}</strong><span>Content Created</span></div><div><strong>{{ outputBreakdown.approved }}</strong><span>Content Approved</span></div><div><strong>{{ outputBreakdown.scheduled }}</strong><span>Content Scheduled</span></div><div><strong>{{ outputBreakdown.published }}</strong><span>Content Published</span></div></div></BaseCard>
      <BaseCard title="Inbound Inquiries" description="Supplementary Metric · WhatsApp Business manual tracking."><template #actions><strong class="inquiry-total">{{ inquiryTotal }} inquiries</strong></template><div class="inquiry-chart"><div v-for="item in inquiryWindow" :key="item.id" class="inquiry-bar"><span :style="{ height: `${Math.max(8, (item.count / Math.max(1, ...inquiryWindow.map((entry) => entry.count))) * 100)}%` }" /><small>{{ formatDate(item.weekStart, { month: 'short', day: 'numeric' }) }}</small><b>{{ item.count }}</b></div></div><p class="helper-text">Inquiry counts are observed supplementary data; no attribution to individual posts is inferred.</p></BaseCard>
    </section>

    <BaseCard title="Recent Published Content" description="Recorded platform publications with metrics from the publication week."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content')">View Content Library <AppIcon name="arrow-right" :size="14" /> </BaseButton></template><div v-if="recentPublished.length" class="performance-table-wrap"><table class="performance-table"><caption class="sr-only">Recent published content performance</caption><thead><tr><th>Content</th><th>Platform</th><th>Published</th><th>Reach</th><th>Impressions</th><th>Engagement</th></tr></thead><tbody><tr v-for="item in recentPublished" :key="`${item.record.id}-${item.platform}`"><td><button type="button" class="content-link" @click="router.push(`/content/${item.record.id}`)"><strong>{{ item.record.title }}</strong><small>{{ item.record.topic }}</small></button></td><td><span class="platform-pill" :class="`is-${item.platform}`"><i />{{ platformLabel(item.platform) }}</span></td><td>{{ new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(item.publication.publishedAt)) }}</td><td>{{ formatMetric(item.reach) }}</td><td>{{ formatMetric(item.impressions) }}</td><td>{{ item.engagement === undefined ? '—' : formatPercent(item.engagement) }}</td></tr></tbody></table></div><EmptyState v-else icon="chart" title="No published content yet." description="Recorded publications will appear here after manual publication is logged." /></BaseCard>

    <div class="performance-secondary-actions"><BaseButton variant="secondary" size="compact" @click="router.push('/performance/linkedin')">Manage LinkedIn Metrics <AppIcon name="arrow-right" :size="14" /></BaseButton><span>LinkedIn metrics are currently entered manually.</span></div>

    <BaseModal v-model="logModalOpen" title="Log Weekly Metrics" description="Record observed platform metrics for a completed week. Values remain in local frontend state."><form class="metrics-form" @submit.prevent="saveMetric"><BaseSelect v-model="logForm.platform" label="Platform" :options="logPlatformOptions" required /><BaseInput v-model="logForm.weekStart" label="Week Start" type="date" required /><div class="metrics-form__grid"><BaseInput v-model="logForm.followers" label="Ending Followers" type="number" min="0" required /><BaseInput v-model="logForm.reach" label="Reach" type="number" min="0" required /><BaseInput v-model="logForm.impressions" label="Impressions" type="number" min="0" required /><BaseInput v-model="logForm.likes" label="Likes" type="number" min="0" required /><BaseInput v-model="logForm.comments" label="Comments" type="number" min="0" required /><BaseInput v-model="logForm.saves" label="Saves" type="number" min="0" required /><BaseInput v-model="logForm.publishedPosts" label="Published Posts" type="number" min="0" required /></div><p v-if="logError" class="form-error" role="alert">{{ logError }}</p><div class="modal-actions"><BaseButton variant="ghost" type="button" @click="logModalOpen = false">Cancel</BaseButton><BaseButton type="submit">Save Metrics</BaseButton></div></form></BaseModal>
  </div>
</template>

<style scoped>
.performance-page { max-width: 1280px; }
.performance-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-well); color: var(--color-muted); font-size: 12px; }
.performance-toolbar__note, .performance-toolbar__source { display: flex; align-items: center; gap: 8px; }
.performance-toolbar__source { flex-wrap: wrap; justify-content: flex-end; color: var(--color-subtle); font-size: 11px; }
.performance-toolbar__source em { color: var(--color-muted); font-style: normal; }
.performance-toolbar__source span + span::before { content: '·'; margin-right: 8px; }
.kpi-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.kpi-card { display: grid; gap: 10px; min-width: 0; }
.kpi-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; color: var(--color-subtle); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.kpi-card__top .app-icon { color: var(--color-primary); }
.kpi-card > strong { font-size: 25px; line-height: 1.1; letter-spacing: -.03em; }
.kpi-card > small { color: var(--color-muted); font-size: 11px; line-height: 1.4; }
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
.summary-list dt { color: var(--color-subtle); font-size: 11px; }
.summary-list dd { margin: 0; font-size: 20px; font-weight: 600; }
.helper-text { margin-top: 14px; color: var(--color-subtle); font-size: 12px; line-height: 1.5; }
.output-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.output-grid div { display: grid; gap: 4px; padding: 12px; border-radius: var(--radius-control); background: var(--color-well); }
.output-grid strong { font-size: 20px; }
.output-grid span { color: var(--color-muted); font-size: 11px; line-height: 1.3; }
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
@media (max-width: 760px) { .performance-toolbar, .performance-secondary-actions { align-items: flex-start; flex-direction: column; } .performance-toolbar__source { justify-content: flex-start; } .chart-grid, .performance-two-column { grid-template-columns: 1fr; } }
@media (max-width: 540px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .output-grid { grid-template-columns: repeat(2, 1fr); } .metrics-form__grid { grid-template-columns: 1fr; } }
</style>
