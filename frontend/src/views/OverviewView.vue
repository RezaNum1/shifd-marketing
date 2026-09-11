<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useCompanyContextStore } from '../stores/companyContext'
import { useContentIdeasStore } from '../stores/contentIdeas'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { usePerformanceStore } from '../stores/performance'
import { useProductsStore } from '../stores/products'
import { calculateConsistency, calculateEngagementRate, engagementCount, WEEKLY_POST_TARGET } from '../utils/performanceMetrics'
import { getEffectivePublishedPostCount, getEffectivePublishedPostsForWeek } from '../utils/publicationMetrics'
import type { ContentCalendarStatus, ContentPlatform } from '../types/content'
import type { Tone } from '../types/ui'
import { contentLifecycle, contentStatus } from '../utils/contentRecords'

const router = useRouter()
const library = useContentLibraryStore()
const workflow = useContentWorkflowStore()
const performance = usePerformanceStore()
const ideas = useContentIdeasStore()
const company = useCompanyContextStore()
const products = useProductsStore()

// Keep a scheduled workflow visible to every aggregation view in this session.
library.syncScheduledWorkflow(workflow)
const now = ref(new Date())

interface CalendarSummaryEntry {
  contentId: string
  title: string
  topic: string
  platform: ContentPlatform
  contextName: string
  pillar: string
  date: string
  time: string
  at: Date
  status: ContentCalendarStatus
}

function platformLabel(platform: ContentPlatform) { return platform === 'instagram' ? 'Instagram' : 'LinkedIn' }
function contextName(record: { context: 'company' | 'product'; productId?: string }) {
  return record.context === 'company' ? company.companyProfile.name : products.nameFor(record.productId)
}
function formatNumber(value: number) { return value.toLocaleString() }
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T00:00:00`))
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function parseSchedule(date: string, time: string) { return new Date(`${date}T${time}:00`) }
function toneForStatus(status: ContentCalendarStatus): Tone { return status === 'Published' ? 'success' : status === 'Ready to Publish' ? 'warning' : 'info' }
function startOfWeek(value: Date) {
  const date = new Date(value)
  const day = date.getDay()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return date
}
const calendarEntries = computed<CalendarSummaryEntry[]>(() => library.records.flatMap((record) => record.platforms.flatMap((platform) => {
  const schedule = contentLifecycle(record).schedules[platform]
  if (!schedule) return []
  const publication = library.getPublicationRecord(record.id, platform)
  const at = parseSchedule(schedule.date, schedule.time)
  return [{
    contentId: record.id, title: record.title, topic: record.topic, platform,
    contextName: contextName(record), pillar: record.pillar, date: schedule.date, time: schedule.time, at,
    status: publication ? 'Published' : at <= now.value ? 'Ready to Publish' : 'Scheduled',
  }]
})))
const plannedEntries = computed(() => calendarEntries.value.filter((entry) => entry.status !== 'Published'))
const readyToPublishCount = computed(() => calendarEntries.value.filter((entry) => entry.status === 'Ready to Publish').length)
const upcoming = computed(() => [...plannedEntries.value].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 5))
const publishedRecords = computed(() => library.records.flatMap((record) => record.platforms.flatMap((platform) => {
  const publication = library.getPublicationRecord(record.id, platform)
  return publication ? [{ record, platform, publication }] : []
})).sort((a, b) => new Date(b.publication.publishedAt).getTime() - new Date(a.publication.publishedAt).getTime()))
const recentPublished = computed(() => publishedRecords.value.slice(0, 5))
const publishedPosts = computed(() => getEffectivePublishedPostCount(performance.weeklyMetrics, library.publicationRecords))
const needsReview = computed(() => library.records.filter((record) => ['Ready for Review', 'Needs Revision'].includes(contentStatus(record))))

const metricWeeks = computed(() => [...new Set(performance.weeklyMetrics.map((metric) => metric.weekStart))].sort().slice(-8))
const latestMetrics = computed(() => ({
  instagram: performance.weeklyMetrics.filter((metric) => metric.platform === 'instagram' && metric.weekStart === metricWeeks.value.at(-1)).at(-1),
  linkedin: performance.weeklyMetrics.filter((metric) => metric.platform === 'linkedin' && metric.weekStart === metricWeeks.value.at(-1)).at(-1),
}))
const performanceSnapshot = computed(() => {
  const metrics = performance.weeklyMetrics.filter((metric) => metricWeeks.value.includes(metric.weekStart))
  const impressions = metrics.reduce((sum, metric) => sum + metric.impressions, 0)
  const engagements = metrics.reduce((sum, metric) => sum + engagementCount(metric), 0)
  const start = (performance.weeklyMetrics.find((metric) => metric.platform === 'instagram' && metric.weekStart === metricWeeks.value[0])?.followers ?? 0)
    + (performance.weeklyMetrics.find((metric) => metric.platform === 'linkedin' && metric.weekStart === metricWeeks.value[0])?.followers ?? 0)
  const end = (latestMetrics.value.instagram?.followers ?? 0) + (latestMetrics.value.linkedin?.followers ?? 0)
  return { reach: (latestMetrics.value.instagram?.reach ?? 0) + (latestMetrics.value.linkedin?.reach ?? 0), impressions, engagementRate: calculateEngagementRate(impressions, engagements) ?? 0, followerGrowth: end - start }
})

const thisWeek = computed(() => {
  const week = startOfWeek(now.value)
  const weekEnd = new Date(week)
  weekEnd.setDate(weekEnd.getDate() + 7)
  return (['instagram', 'linkedin'] as ContentPlatform[]).map((platform) => {
    const published = getEffectivePublishedPostsForWeek(performance.weeklyMetrics, library.publicationRecords, platform, week, weekEnd)
    const consistency = calculateConsistency(published, 1)
    return { platform, published, expected: WEEKLY_POST_TARGET, percent: consistency.percent }
  })
})

const attentionItems = computed(() => {
  const items: { label: string; detail: string; icon: 'alert' | 'calendar' | 'idea' | 'company'; to: string }[] = []
  if (needsReview.value.length) items.push({ label: `${needsReview.value.length} content ${needsReview.value.length === 1 ? 'needs' : 'need'} review`, detail: 'Human review is required before approval.', icon: 'alert', to: '/content' })
  if (readyToPublishCount.value) items.push({ label: `${readyToPublishCount.value} scheduled ${readyToPublishCount.value === 1 ? 'post is' : 'posts are'} ready to publish`, detail: 'Record publication after manually posting.', icon: 'calendar', to: '/calendar' })
  if (ideas.recentReadyIdeas.length) items.push({ label: `${ideas.recentReadyIdeas.length} ideas ready to develop`, detail: 'Turn a ready idea into a brief.', icon: 'idea', to: '/content/ideas' })
  const profileReady = Boolean(company.companyProfile.name.trim() && company.companyProfile.description.trim() && company.brandProfile.brandVoice.trim() && company.brandProfile.preferredLanguage.trim())
  if (!profileReady) items.push({ label: 'Marketing context needs attention', detail: 'Complete the company and brand context.', icon: 'company', to: '/context/company' })
  return items
})

const contextReadiness = computed(() => ({
  company: Boolean(company.companyProfile.name.trim() && company.companyProfile.description.trim()),
  brand: Boolean(company.brandProfile.brandVoice.trim() && company.brandProfile.toneDescription.trim() && company.brandProfile.preferredLanguage.trim()),
  activeProducts: products.products.filter((product) => product.status === 'Active').length,
}))

function consistencyTone(percent: number): Tone { return percent >= 100 ? 'success' : percent >= 75 ? 'info' : 'warning' }
function openContent(id: string) { router.push(`/content/${id}`) }
function startNewContent() { workflow.startNewWorkflow(); router.push('/content/create') }
</script>

<template>
  <div class="page-stack overview-page">
    <PageHeader title="Overview" description="Your marketing execution at a glance." :breadcrumbs="[{ label: 'Platform' }, { label: 'Overview' }]">
      <template #actions>
        <BaseButton variant="secondary" @click="router.push('/content/ideas')"><AppIcon name="idea" :size="16" />Add Idea</BaseButton>
        <BaseButton @click="startNewContent"><AppIcon name="plus" :size="16" />Create Content</BaseButton>
      </template>
    </PageHeader>

    <section class="overview-kpi-grid" aria-label="Execution summary">
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Planned</span><AppIcon name="calendar" :size="17" /></div><strong>{{ plannedEntries.length }}</strong><small>Platform schedules not yet published</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Published Posts</span><AppIcon name="check" :size="17" /></div><strong>{{ publishedPosts }}</strong><small>Recorded platform publications</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Needs Review</span><AppIcon name="alert" :size="17" /></div><strong>{{ needsReview.length }}</strong><small>Ready for review or needs revision</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Posting Consistency</span><AppIcon name="chart" :size="17" /></div><strong>{{ Math.round((thisWeek[0].percent + thisWeek[1].percent) / 2) }}%</strong><small>Current week against a 2 post target</small></div></BaseCard>
    </section>

    <section class="overview-two-column">
      <BaseCard title="Needs Attention" description="Actionable items from your current workspace.">
        <div v-if="attentionItems.length" class="attention-list">
          <button v-for="item in attentionItems" :key="item.label" type="button" class="attention-item" @click="router.push(item.to)"><span class="attention-item__icon"><AppIcon :name="item.icon" :size="16" /></span><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span><AppIcon name="arrow-right" :size="15" /></button>
        </div>
        <p v-else class="overview-empty">All caught up.</p>
      </BaseCard>
      <BaseCard title="This Week" description="Published posts compared with the configured weekly target.">
        <div class="weekly-execution-list"><div v-for="item in thisWeek" :key="item.platform" class="weekly-execution"><div class="weekly-execution__heading"><strong>{{ platformLabel(item.platform) }}</strong><StatusBadge :tone="consistencyTone(item.percent)">{{ item.percent.toFixed(1) }}%</StatusBadge></div><div class="weekly-execution__meta"><span>{{ item.published }} of {{ item.expected }} published</span><span>Target: {{ item.expected }}</span></div><div class="progress-track"><span :style="{ width: `${Math.min(100, item.percent)}%` }" /></div></div></div>
      </BaseCard>
    </section>

    <BaseCard title="Upcoming Content" description="The next platform-specific schedules from the Content Calendar."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/calendar')">View Calendar <AppIcon name="arrow-right" :size="14" /></BaseButton></template>
      <div v-if="upcoming.length" class="upcoming-list"><button v-for="item in upcoming" :key="`${item.contentId}-${item.platform}`" type="button" class="upcoming-item" @click="openContent(item.contentId)"><span class="upcoming-item__date"><strong>{{ formatDate(item.date) }}</strong><small>{{ item.time }}</small></span><span class="platform-pill" :class="`is-${item.platform}`"><i />{{ platformLabel(item.platform) }}</span><span class="upcoming-item__content"><strong>{{ item.title }}</strong><small>{{ item.contextName }} · {{ item.pillar }}</small></span><StatusBadge :tone="toneForStatus(item.status)">{{ item.status }}</StatusBadge><AppIcon name="chevron-right" :size="15" /></button></div>
      <EmptyState v-else icon="calendar" title="No upcoming content." description="Approved content will appear here after a publication date and time are selected."><BaseButton @click="startNewContent">Create Content</BaseButton></EmptyState>
    </BaseCard>

    <section class="overview-two-column">
      <BaseCard title="Performance Snapshot" description="Observed metrics from the latest eight-week period."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/performance')">View Performance <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div class="snapshot-grid"><div><span>Weekly Reach</span><strong>{{ formatNumber(performanceSnapshot.reach) }}</strong></div><div><span>Impressions</span><strong>{{ formatNumber(performanceSnapshot.impressions) }}</strong></div><div><span>Engagement Rate</span><strong>{{ performanceSnapshot.engagementRate.toFixed(1) }}%</strong></div><div><span>Follower Growth</span><strong>{{ performanceSnapshot.followerGrowth >= 0 ? '+' : '' }}{{ formatNumber(performanceSnapshot.followerGrowth) }}</strong></div></div><p class="helper-text">Engagement rate is calculated as engagements ÷ impressions.</p></BaseCard>
      <BaseCard title="Ideas Ready" description="Human-captured ideas available for development."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content/ideas')">View Ideas <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div v-if="ideas.recentReadyIdeas.length" class="idea-snapshot"><strong>{{ ideas.recentReadyIdeas.length }} ideas ready</strong><button v-for="idea in ideas.recentReadyIdeas.slice(0, 3)" :key="idea.id" type="button" @click="router.push('/content/ideas')">{{ idea.title }} <AppIcon name="arrow-right" :size="13" /></button></div><EmptyState v-else icon="idea" title="No ideas ready." description="Capture potential topics in the Idea Bank." /></BaseCard>
    </section>

    <section class="overview-two-column">
      <BaseCard title="Marketing Context" description="Deterministic readiness from the canonical context stores."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/context/company')">Manage Context <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div class="context-readiness"><div><span>Company Context</span><StatusBadge :tone="contextReadiness.company ? 'success' : 'warning'">{{ contextReadiness.company ? 'Configured' : 'Needs setup' }}</StatusBadge></div><div><span>Products</span><StatusBadge :tone="contextReadiness.activeProducts ? 'success' : 'warning'">{{ contextReadiness.activeProducts }} Active</StatusBadge></div><div><span>Brand Context</span><StatusBadge :tone="contextReadiness.brand ? 'success' : 'warning'">{{ contextReadiness.brand ? 'Configured' : 'Needs setup' }}</StatusBadge></div></div></BaseCard>
      <BaseCard title="Recent Published" description="The latest manually recorded platform publications."><div v-if="recentPublished.length" class="recent-list"><button v-for="item in recentPublished" :key="`${item.record.id}-${item.platform}`" type="button" class="recent-item" @click="openContent(item.record.id)"><span><strong>{{ item.record.title }}</strong><small>{{ platformLabel(item.platform) }}</small></span><span class="recent-item__date">{{ formatDateTime(item.publication.publishedAt) }}</span><StatusBadge tone="success">Published</StatusBadge></button></div><EmptyState v-else icon="library" title="No content published yet." description="Recorded publications will appear here after manual publication is logged." /></BaseCard>
    </section>
  </div>
</template>

<style scoped>
.overview-page { max-width: 1280px; }
.overview-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.overview-kpi__content { display: grid; gap: 10px; align-content: start; min-height: 108px; }
.overview-kpi__label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--color-subtle); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.overview-kpi__label .app-icon { color: var(--color-primary); }
.overview-kpi strong { display: block; font-size: 28px; line-height: 1.1; letter-spacing: -.03em; }
.overview-kpi small, .upcoming-item small, .recent-item small { color: var(--color-muted); font-size: 11px; line-height: 1.4; }
.overview-kpi small { display: block; max-width: 24ch; }
.overview-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.attention-list, .weekly-execution-list, .upcoming-list, .recent-list { display: grid; gap: 10px; }
.attention-item, .upcoming-item, .recent-item { width: 100%; border: 0; border-radius: var(--radius-control); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.attention-item { display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 10px; padding: 10px; }
.attention-item:hover, .upcoming-item:hover, .recent-item:hover { background: var(--color-well); }
.attention-item__icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--color-well); color: var(--color-primary); }
.attention-item strong, .attention-item small, .upcoming-item__content strong, .upcoming-item__content small, .recent-item strong, .recent-item small { display: block; }
.attention-item small { margin-top: 3px; color: var(--color-muted); font-size: 12px; }
.weekly-execution { display: grid; gap: 8px; padding: 4px 0; }
.weekly-execution__heading, .weekly-execution__meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.weekly-execution__meta { color: var(--color-muted); font-size: 12px; }
.progress-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--color-well); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.upcoming-item { display: grid; grid-template-columns: 92px 100px minmax(0, 1fr) auto 16px; align-items: center; gap: 14px; padding: 12px 10px; border-bottom: 1px solid var(--color-border); }
.upcoming-item:last-child { border-bottom: 0; }
.upcoming-item__date { display: grid; gap: 3px; }
.upcoming-item__date strong { font-size: 13px; }
.upcoming-item__content { min-width: 0; }
.upcoming-item__content strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.upcoming-item__content small { margin-top: 3px; }
.platform-pill { display: inline-flex; align-items: center; gap: 6px; width: max-content; color: var(--color-muted); font-size: 12px; }
.platform-pill i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-primary); }
.platform-pill.is-instagram i { background: #7c3aed; }
.snapshot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.snapshot-grid div { display: grid; gap: 6px; padding: 14px; background: var(--color-surface); }
.snapshot-grid span, .context-readiness span { color: var(--color-subtle); font-size: 11px; }
.snapshot-grid strong { font-size: 21px; }
.helper-text { margin-top: 12px; color: var(--color-subtle); font-size: 12px; line-height: 1.5; }
.idea-snapshot { display: grid; gap: 12px; }
.idea-snapshot > strong { font-size: 22px; }
.idea-snapshot button { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-ink); text-align: left; cursor: pointer; font-size: 13px; }
.idea-snapshot button:hover { color: var(--color-primary); }
.context-readiness { display: grid; gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.context-readiness div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; background: var(--color-surface); }
.recent-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 10px; }
.recent-item > span:first-child { min-width: 0; }
.recent-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.recent-item small { margin-top: 3px; }
.recent-item__date { color: var(--color-muted); font-size: 11px; white-space: nowrap; }
.overview-empty { margin: 8px 0; color: var(--color-muted); font-size: 13px; }
@media (max-width: 900px) { .overview-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .overview-two-column { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .overview-kpi-grid { grid-template-columns: 1fr; } .upcoming-item { grid-template-columns: 78px 1fr auto; gap: 8px; } .upcoming-item__content { grid-column: 2 / -1; } .upcoming-item > .ui-badge { grid-column: 2; } .recent-item { grid-template-columns: 1fr auto; } .recent-item .ui-badge { grid-column: 2; grid-row: 1; } }
</style>
