<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import TablePagination from '../components/ui/TablePagination.vue'
import { useOverviewStore } from '../stores/overview'
import type { ContentPlatform } from '../types/content'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useIntegrationsStore } from '../stores/integrations'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useContentIdeasStore } from '../stores/contentIdeas'
import { getOutreachPeriodSummary } from '../api/prospects'

const router = useRouter()
const overview = useOverviewStore()
const integrations = useIntegrationsStore()
const contentLibrary = useContentLibraryStore()
const aiSettings = useAiSettingsStore()
const contentIdeas = useContentIdeasStore()
const outreachPeriod = ref<'week' | 'month'>('week')
const approachedProspects = ref(0)
const recentApproached = ref<Array<{ id: string; name: string; approachedAt: string | null }>>([])
const refreshing = ref(false)
const recentPublishedPage = ref(1)
const recentPublishedPageSize = ref(5)
const publishedListPage = ref(1)
const publishedListPageSize = ref(5)
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000
const pageHelp = {
  purpose: 'See the current state of your marketing work in one place, including upcoming posts, items that need attention, and recent performance.',
  steps: [
    'Review the attention items first and open anything that needs action.',
    'Check upcoming and recently published content to follow your schedule.',
    'Use the shortcuts on a card to continue in the relevant area.',
  ],
}

function platformLabel(platform: ContentPlatform) { return platform === 'instagram' ? 'Instagram' : 'LinkedIn' }
function formatNumber(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toLocaleString() }
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function formatShortDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)) : 'Date unavailable' }
const report = computed(() => overview.report)
const workItems = computed(() => [
  ...contentLibrary.records.filter((record) => record.status !== 'Published').map((record) => ({ id: record.id, title: record.title, status: record.status, kind: 'Content' as const })),
  ...contentIdeas.ideas.filter((idea) => idea.status !== 'Used').map((idea) => ({ id: idea.id, title: idea.title, status: idea.status, kind: 'Idea' as const })),
])
const recentPublished = computed(() => report.value?.recentlyPublished.map((item) => ({ record: { id: item.content.id, title: item.content.title }, platform: item.publication.platform, publication: item.publication, metrics: item.postMetrics })) ?? [])
const visibleRecentPublished = computed(() => recentPublished.value.slice((recentPublishedPage.value - 1) * recentPublishedPageSize.value, recentPublishedPage.value * recentPublishedPageSize.value))
const visiblePublishedList = computed(() => recentPublished.value.slice((publishedListPage.value - 1) * publishedListPageSize.value, publishedListPage.value * publishedListPageSize.value))
const publishedPosts = computed(() => report.value?.published.effectivePosts ?? 0)
const needsReview = computed(() => Array.from({ length: report.value?.needsReviewCampaigns ?? 0 }, (_, index) => ({ id: String(index) })))
const readyIdeasCount = computed(() => report.value?.ideas.readyCount ?? 0)
const weeklyContent = computed(() => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const end = new Date(start); end.setDate(start.getDate() + 7)
  return contentLibrary.records.filter((record) => {
    if (!['Scheduled', 'Published'].includes(record.lifecycle?.status ?? record.status)) return false
    const lifecycle = record.lifecycle
    const publicationDate = lifecycle?.publications?.instagram?.publishedAt ?? lifecycle?.publications?.linkedin?.publishedAt ?? record.publishedAt
    const scheduleDate = lifecycle?.schedules?.instagram?.date ?? lifecycle?.schedules?.linkedin?.date ?? record.scheduleDate
    const date = (lifecycle?.status ?? record.status) === 'Published' ? publicationDate : scheduleDate
    const stamp = date ? new Date(date) : new Date(record.updatedAt)
    return stamp >= start && stamp < end
  }).length
})
const weeklyTarget = computed(() => aiSettings.settings.weeklyContentTarget || 2)
const contentConsistency = computed(() => Math.min(100, weeklyContent.value / weeklyTarget.value * 100))
const readyToPublishCount = computed(() => report.value?.readyToPublish ?? 0)

const attentionItems = computed(() => {
  const items: { label: string; detail: string; icon: 'alert' | 'calendar' | 'idea' | 'company'; to: string }[] = []
  if (needsReview.value.length) items.push({ label: `${needsReview.value.length} content ${needsReview.value.length === 1 ? 'needs' : 'need'} review`, detail: 'Human review is required before approval.', icon: 'alert', to: '/content' })
  if (readyToPublishCount.value) items.push({ label: `${readyToPublishCount.value} scheduled ${readyToPublishCount.value === 1 ? 'post is' : 'posts are'} ready to publish`, detail: 'Record publication after manually posting.', icon: 'calendar', to: '/calendar' })
  if (readyIdeasCount.value) items.push({ label: `${readyIdeasCount.value} ideas ready to develop`, detail: 'Turn a ready idea into a brief.', icon: 'idea', to: '/content/ideas' })
  if (report.value && (!report.value.context.companyConfigured || !report.value.context.brandConfigured)) items.push({ label: 'Marketing context needs attention', detail: 'Complete the company and brand context.', icon: 'company', to: '/context/company' })
  return items
})

function openContent(id: string) { router.push(`/content/${id}`) }
async function refreshOverview() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await integrations.load()
    const instagram = integrations.instagram
    const lastSyncAt = instagram?.lastSync ? Date.parse(instagram.lastSync) : 0
    const syncIsDue = !Number.isFinite(lastSyncAt) || !lastSyncAt || Date.now() - lastSyncAt >= AUTO_SYNC_INTERVAL_MS
    if (instagram?.status === 'connected' && syncIsDue) await integrations.syncInstagram()
    await Promise.all([overview.load(true), contentLibrary.load(true), contentIdeas.load(true), aiSettings.load(true), loadOutreachSummary()])
  } finally {
    refreshing.value = false
  }
}
async function loadOutreachSummary() {
  try {
    const result = (await getOutreachPeriodSummary(outreachPeriod.value)).data
    approachedProspects.value = result.approached
    recentApproached.value = result.recentProspects
  } catch { approachedProspects.value = 0; recentApproached.value = [] }
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') void refreshOverview()
}

onMounted(() => {
  void refreshOverview()
  window.addEventListener('focus', refreshWhenVisible)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})
onUnmounted(() => {
  window.removeEventListener('focus', refreshWhenVisible)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})
</script>

<template>
  <div class="page-stack overview-page">
    <PageHeader title="Overview" description="Your marketing execution at a glance." :breadcrumbs="[{ label: 'Platform' }, { label: 'Overview' }]" :help="pageHelp">
    </PageHeader>
    <InlineAlert v-if="overview.loading" title="Loading overview">Reading the canonical overview report…</InlineAlert>
    <InlineAlert v-else-if="overview.error" title="Overview unavailable" tone="danger">{{ overview.error }}</InlineAlert>

    <template v-if="overview.loaded">
    <section class="overview-kpi-grid" aria-label="Execution summary">
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Planned</span><AppIcon name="calendar" :size="17" /></div><strong>{{ report?.plannedPlatformSchedules ?? 0 }}</strong><small>Platform schedules not yet published</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Published Posts</span><AppIcon name="check" :size="17" /></div><strong>{{ publishedPosts }}</strong><small>Recorded platform publications</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Needs Review</span><AppIcon name="alert" :size="17" /></div><strong>{{ needsReview.length }}</strong><small>Ready for review or needs revision</small></div></BaseCard>
      <BaseCard class="overview-kpi"><div class="overview-kpi__content"><div class="overview-kpi__label"><span>Content Creation Consistency</span><AppIcon name="chart" :size="17" /></div><strong>{{ contentConsistency.toFixed(1) }}%</strong><small>{{ weeklyContent }} of {{ weeklyTarget }} content items this week</small></div></BaseCard>
    </section>

    <section class="overview-content-grid">
      <BaseCard class="overview-list-card" title="Needs Attention" description="Actionable items from your current workspace.">
        <div v-if="attentionItems.length" class="attention-list">
          <button v-for="item in attentionItems" :key="item.label" type="button" class="attention-item" @click="router.push(item.to)"><span class="attention-item__icon"><AppIcon :name="item.icon" :size="16" /></span><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span><AppIcon name="arrow-right" :size="15" /></button>
        </div>
        <p v-else class="overview-empty">All caught up.</p>
      </BaseCard>

    <BaseCard class="overview-list-card" title="Upcoming Content" description="All content that is not published and ideas that are not used."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content')">View Content <AppIcon name="arrow-right" :size="14" /></BaseButton></template>
      <div v-if="workItems.length" class="upcoming-list"><button v-for="item in workItems" :key="`${item.kind}-${item.id}`" type="button" class="upcoming-item" @click="router.push(item.kind === 'Content' ? `/content/${item.id}` : '/content/ideas')"><span class="upcoming-item__content"><strong>{{ item.title }}</strong><small>{{ item.kind }}</small></span><StatusBadge tone="info">{{ item.status }}</StatusBadge><AppIcon name="chevron-right" :size="15" /></button></div>
      <EmptyState v-else icon="calendar" title="No upcoming content." description="There are no unpublished content items or unused ideas." />
    </BaseCard>
    </section>

    <section class="overview-performance">
      <BaseCard title="Performance Snapshot" description="Recent published content and its platform metrics."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/performance')">View Performance <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div v-if="recentPublished.length" class="performance-snapshot-scroll"><div class="performance-list"><div v-for="item in visibleRecentPublished" :key="`${item.record.id}-${item.platform}`" class="performance-row"><button type="button" @click="openContent(item.record.id)"><strong>{{ item.record.title }}</strong><small>{{ platformLabel(item.platform) }} · {{ formatDateTime(item.publication.publishedAt) }}</small></button><span>Views <b>{{ formatNumber(item.metrics?.views) }}</b></span><span>Reach <b>{{ formatNumber(item.metrics?.reach) }}</b></span><span>Likes <b>{{ formatNumber(item.metrics?.likes) }}</b></span><span>Comments <b>{{ formatNumber(item.metrics?.comments) }}</b></span></div><TablePagination v-model:page="recentPublishedPage" v-model:page-size="recentPublishedPageSize" :total="recentPublished.length" :page-size-options="[5, 10, 25, 50]" /></div></div><EmptyState v-else icon="chart" title="No published content yet." description="Publication metrics will appear here when available." /></BaseCard>
    </section>

    <section class="overview-bottom-grid">
      <BaseCard title="Recently Published" description="Published content titles and statuses."><template #actions><BaseButton variant="ghost" size="compact" @click="router.push('/content')">View Content <AppIcon name="arrow-right" :size="14" /></BaseButton></template><div v-if="recentPublished.length" class="recent-list"><div v-for="item in visiblePublishedList" :key="`${item.record.id}-${item.platform}`" class="recent-item"><button type="button" @click="openContent(item.record.id)"><strong>{{ item.record.title }}</strong></button><StatusBadge tone="success">Published</StatusBadge></div><TablePagination v-model:page="publishedListPage" v-model:page-size="publishedListPageSize" :total="recentPublished.length" :page-size-options="[5, 10, 25, 50]" /></div><EmptyState v-else icon="library" title="No published content yet." description="Published content will appear here." /></BaseCard>

      <section class="outreach-summary" aria-label="Prospect outreach summary">
        <header class="outreach-summary__header"><div><span class="outreach-summary__label">Prospect Companies Approached</span><strong>{{ approachedProspects }}</strong><small>{{ outreachPeriod === 'week' ? 'Companies with recorded outreach this week' : 'Companies with recorded outreach this month' }}</small></div><label for="outreach-period">Reporting period<select id="outreach-period" v-model="outreachPeriod" @change="loadOutreachSummary"><option value="week">This week</option><option value="month">This month</option></select></label></header>
        <div class="outreach-recent"><h3>Recently approached companies</h3><ul v-if="recentApproached.length"><li v-for="prospect in recentApproached" :key="prospect.id"><span>{{ prospect.name }}</span><time>{{ formatShortDate(prospect.approachedAt) }}</time></li></ul><p v-else>No companies approached during this period.</p></div>
      </section>
    </section>

    </template>
  </div>
</template>

<style scoped>
.overview-page { max-width: 1280px; }
.overview-performance { min-width: 0; width: 100%; }
.overview-bottom-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; gap: 20px; }
.overview-bottom-grid > * { min-width: 0; }
.outreach-summary { align-self: start; min-width: 0; padding: 18px 20px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.outreach-summary__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.outreach-summary__header > div { display: grid; gap: 4px; min-width: 0; }
.outreach-summary__label { color: var(--color-subtle); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.outreach-summary strong { color: var(--color-ink); font-size: 24px; line-height: 1.2; }
.outreach-summary small { color: var(--color-muted); font-size: 12px; }
.outreach-summary__header label { display: grid; gap: 6px; color: var(--color-subtle); font-size: 12px; }
.outreach-summary select { border: 1px solid var(--color-border); border-radius: 6px; padding: 8px 10px; background: var(--color-surface); color: var(--color-ink); font: inherit; font-size: 13px; }
.outreach-recent { margin-top: 18px; }
.outreach-recent h3 { margin: 0 0 8px; color: var(--color-ink); font-size: 13px; font-weight: 600; }
.outreach-recent ul { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.outreach-recent li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--color-border); color: var(--color-ink); font-size: 12px; }
.outreach-recent li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outreach-recent time, .outreach-recent p { flex: 0 0 auto; color: var(--color-muted); font-size: 11px; }
.overview-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.overview-kpi__content { display: grid; gap: 10px; align-content: start; min-height: 108px; }
.overview-kpi__label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--color-subtle); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.overview-kpi__label .app-icon { color: var(--color-primary); }
.overview-kpi strong { display: block; min-width: 0; font-size: 22px; line-height: 1.25; letter-spacing: -.02em; overflow-wrap: anywhere; }
.overview-kpi__consistency { display: grid; gap: 2px; }
.overview-kpi small, .upcoming-item small, .recent-item small { color: var(--color-muted); font-size: 11px; line-height: 1.4; }
.overview-kpi small { display: block; max-width: 24ch; }
.overview-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.overview-two-column:has(> :only-child) { grid-template-columns: 1fr; }
.overview-content-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 20px; }
.overview-content-grid > :deep(.overview-list-card) { min-width: 0; }
.overview-content-grid > :deep(.ui-card) { display: flex; flex-direction: column; max-height: 420px; }
.overview-content-grid :deep(.ui-card__body) { min-height: 0; overflow-y: auto; }
.overview-content-grid .upcoming-list { max-height: 300px; overflow-y: auto; overscroll-behavior-y: contain; }
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
.upcoming-item { display: grid; grid-template-columns: minmax(0, 1fr) auto 16px; align-items: center; gap: 14px; padding: 12px 10px; border-bottom: 1px solid var(--color-border); }
.upcoming-item:last-child { border-bottom: 0; }
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
.recent-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px; }
.recent-item > button { width: 100%; min-width: 0; border: 0; padding: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.performance-snapshot-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
.performance-snapshot-scroll .performance-list { min-width: 900px; display: grid; gap: 10px; }
.performance-row { display: grid; grid-template-columns: minmax(260px, 1fr) repeat(4, minmax(120px, auto)); align-items: center; gap: 20px; padding: 10px; white-space: nowrap; }
.performance-row > button { min-width: 0; border: 0; padding: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.performance-row > button strong, .performance-row > button small { display: block; }
.performance-row > button strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.performance-row > button small { margin-top: 3px; color: var(--color-muted); font-size: 11px; }
.recent-item > span:first-child { min-width: 0; }
.recent-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.recent-item small { margin-top: 3px; }
.recent-item__date { color: var(--color-muted); font-size: 11px; white-space: nowrap; }
.overview-empty { margin: 8px 0; color: var(--color-muted); font-size: 13px; }
@media (max-width: 900px) { .overview-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .overview-two-column, .overview-content-grid, .overview-bottom-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .outreach-summary__header { flex-wrap: wrap; } }
@media (max-width: 620px) { .overview-kpi-grid { grid-template-columns: 1fr; } .upcoming-item { grid-template-columns: minmax(0, 1fr) auto 16px; gap: 8px; } .recent-item { grid-template-columns: 1fr auto; } .recent-item .ui-badge { grid-column: 2; grid-row: 1; } }
</style>
