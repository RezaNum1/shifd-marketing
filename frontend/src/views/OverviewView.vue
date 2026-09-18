<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { useOverviewStore } from '../stores/overview'
import type { ContentCalendarStatus, ContentPlatform } from '../types/content'
import type { BackendCalendarEntry } from '../types/backend'
import type { Tone } from '../types/ui'
import InlineAlert from '../components/ui/InlineAlert.vue'

const router = useRouter()
const workflow = useContentWorkflowStore()
const overview = useOverviewStore()

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
function formatNumber(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toLocaleString() }
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T00:00:00`))
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function toneForStatus(status: ContentCalendarStatus): Tone { return status === 'Published' ? 'success' : status === 'Ready to Publish' ? 'warning' : 'info' }
const report = computed(() => overview.report)
const plannedEntries = computed(() => report.value?.upcoming.filter((entry) => entry.status !== 'published').map(calendarEntry) ?? [])
const readyToPublishCount = computed(() => report.value?.readyToPublish ?? 0)
const upcoming = computed(() => plannedEntries.value.slice(0, 5))
const recentPublished = computed(() => report.value?.recentlyPublished.slice(0, 5).map((item) => ({ record: { id: item.content.id, title: item.content.title }, platform: item.publication.platform, publication: item.publication })) ?? [])
const publishedPosts = computed(() => report.value?.published.effectivePosts ?? 0)
const needsReview = computed(() => Array.from({ length: report.value?.needsReviewCampaigns ?? 0 }, (_, index) => ({ id: String(index) })))
const readyIdeasCount = computed(() => report.value?.ideas.readyCount ?? 0)
const latestIdeas = computed(() => report.value?.ideas.latest ?? [])
const performanceSnapshot = computed(() => {
  const snapshot = report.value?.performanceSnapshot
  return { reach: snapshot?.summary.latestWeeklyReach ?? null, impressions: snapshot?.summary.impressions ?? null, engagementRate: snapshot?.summary.engagementRate ?? null, followers: snapshot?.followers ?? [] }
})
const thisWeek = computed(() => report.value?.thisWeek.consistency.map((item) => ({ platform: item.platform, published: item.published.effectivePosts, expected: item.expected, percent: item.percent })) ?? [])
const thisWeekLabel = computed(() => thisWeek.value.length ? thisWeek.value.map((item) => `${platformLabel(item.platform)} ${item.percent.toFixed(1)}%`).join(' · ') : '—')

const attentionItems = computed(() => {
  const items: { label: string; detail: string; icon: 'alert' | 'calendar' | 'idea' | 'company'; to: string }[] = []
  if (needsReview.value.length) items.push({ label: `${needsReview.value.length} content ${needsReview.value.length === 1 ? 'needs' : 'need'} review`, detail: 'Human review is required before approval.', icon: 'alert', to: '/content' })
  if (readyToPublishCount.value) items.push({ label: `${readyToPublishCount.value} scheduled ${readyToPublishCount.value === 1 ? 'post is' : 'posts are'} ready to publish`, detail: 'Record publication after manually posting.', icon: 'calendar', to: '/calendar' })
  if (readyIdeasCount.value) items.push({ label: `${readyIdeasCount.value} ideas ready to develop`, detail: 'Turn a ready idea into a brief.', icon: 'idea', to: '/content/ideas' })
  if (report.value && (!report.value.context.companyConfigured || !report.value.context.brandConfigured)) items.push({ label: 'Marketing context needs attention', detail: 'Complete the company and brand context.', icon: 'company', to: '/context/company' })
  return items
})

const contextReadiness = computed(() => ({
  company: report.value?.context.companyConfigured ?? false,
  brand: report.value?.context.brandConfigured ?? false,
  activeProducts: report.value?.context.activeProducts ?? 0,
}))

function consistencyTone(percent: number): Tone { return percent >= 100 ? 'success' : percent >= 75 ? 'info' : 'warning' }
function followerGrowthLabel(values: Array<{ platform: ContentPlatform; change: number | null }>) {
  return values.length ? values.map((item) => `${platformLabel(item.platform)} ${item.change === null ? '—' : `${item.change >= 0 ? '+' : ''}${formatNumber(item.change)}`}`).join(' · ') : '—'
}
function openContent(id: string) { router.push(`/content/${id}`) }
function startNewContent() { workflow.startNewWorkflow(); router.push('/content/create') }
function calendarEntry(entry: BackendCalendarEntry): CalendarSummaryEntry {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: entry.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(entry.scheduledAt))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { contentId: entry.contentId, title: entry.title, topic: entry.title, platform: entry.platform, contextName: entry.product?.name ?? entry.company.name, pillar: entry.pillarCode, date: `${get('year')}-${get('month')}-${get('day')}`, time: new Intl.DateTimeFormat('en-GB', { timeZone: entry.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(entry.scheduledAt)), at: new Date(entry.scheduledAt), status: entry.status === 'published' ? 'Published' : entry.status === 'ready_to_publish' ? 'Ready to Publish' : 'Scheduled' }
}
onMounted(() => { void overview.load(true) })
</script>

<template>
  <div class="page-stack overview-page">
    <PageHeader title="Overview" description="Your marketing execution at a glance." :breadcrumbs="[{ label: 'Platform' }, { label: 'Overview' }]">
      <template #actions>
        <BaseButton variant="secondary" @click="router.push('/content/ideas')"><AppIcon name="idea" :size="16" />Add Idea</BaseButton>
        <BaseButton @click="startNewContent"><AppIcon name="plus" :size="16" />Create Content</BaseButton>
      </template>
    </PageHeader>
    <InlineAlert v-if="overview.loading" title="Loading overview">Reading the canonical overview report…</InlineAlert>
    <InlineAlert v-else-if="overview.error" title="Overview unavailable" tone="danger">{{ overview.error }}</InlineAlert>

    <template v-if="overview.loaded">
    <section class="overview-kpi-grid" aria-label="Execution summary">
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Planned</span><AppIcon name="calendar" :size="17" /></div><strong>{{ report?.plannedPlatformSchedules ?? 0 }}</strong><small>Platform schedules not yet published</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Published Posts</span><AppIcon name="check" :size="17" /></div><strong>{{ publishedPosts }}</strong><small>Recorded platform publications</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Needs Review</span><AppIcon name="alert" :size="17" /></div><strong>{{ needsReview.length }}</strong><small>Ready for review or needs revision</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Posting Consistency</span><AppIcon name="chart" :size="17" /></div><strong>{{ thisWeekLabel }}</strong><small>Backend report by platform</small></div></BaseCard>
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
      <BaseCard title="Performance Snapshot" description="Backend-calculated metrics from the configured reporting period."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/performance')">View Performance <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div class="snapshot-grid"><div><span>Weekly Reach</span><strong>{{ formatNumber(performanceSnapshot.reach) }}</strong></div><div><span>Impressions</span><strong>{{ formatNumber(performanceSnapshot.impressions) }}</strong></div><div><span>Engagement Rate</span><strong>{{ performanceSnapshot.engagementRate === null ? '—' : `${performanceSnapshot.engagementRate.toFixed(1)}%` }}</strong></div><div><span>Follower Growth</span><strong>{{ followerGrowthLabel(performanceSnapshot.followers) }}</strong></div></div><p class="helper-text">Values are supplied by the backend performance report.</p></BaseCard>
      <BaseCard title="Ideas Ready" description="Human-captured ideas available for development."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content/ideas')">View Ideas <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div v-if="readyIdeasCount" class="idea-snapshot"><strong>{{ readyIdeasCount }} ideas ready</strong><button v-for="idea in latestIdeas" :key="idea.id" type="button" @click="router.push('/content/ideas')">{{ idea.title }} <AppIcon name="arrow-right" :size="13" /></button></div><EmptyState v-else icon="idea" title="No ideas ready." description="Capture potential topics in the Idea Bank." /></BaseCard>
    </section>

    <section class="overview-two-column">
      <BaseCard title="Marketing Context" description="Deterministic readiness from the canonical context stores."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/context/company')">Manage Context <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div class="context-readiness"><div><span>Company Context</span><StatusBadge :tone="contextReadiness.company ? 'success' : 'warning'">{{ contextReadiness.company ? 'Configured' : 'Needs setup' }}</StatusBadge></div><div><span>Products</span><StatusBadge :tone="contextReadiness.activeProducts ? 'success' : 'warning'">{{ contextReadiness.activeProducts }} Active</StatusBadge></div><div><span>Brand Context</span><StatusBadge :tone="contextReadiness.brand ? 'success' : 'warning'">{{ contextReadiness.brand ? 'Configured' : 'Needs setup' }}</StatusBadge></div></div></BaseCard>
      <BaseCard title="Recent Published" description="The latest manually recorded platform publications."><div v-if="recentPublished.length" class="recent-list"><button v-for="item in recentPublished" :key="`${item.record.id}-${item.platform}`" type="button" class="recent-item" @click="openContent(item.record.id)"><span><strong>{{ item.record.title }}</strong><small>{{ platformLabel(item.platform) }}</small></span><span class="recent-item__date">{{ formatDateTime(item.publication.publishedAt) }}</span><StatusBadge tone="success">Published</StatusBadge></button></div><EmptyState v-else icon="library" title="No content published yet." description="Recorded publications will appear here after manual publication is logged." /></BaseCard>
    </section>
    </template>
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
