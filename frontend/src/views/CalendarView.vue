<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import ContentAssetThumbnail from '../components/content/ContentAssetThumbnail.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { useCalendarStore } from '../stores/calendar'
import { useProductsStore } from '../stores/products'
import { useCompanyContextStore } from '../stores/companyContext'
import { useUiStore } from '../stores/ui'
import type {
  ContentAssetRecord,
  ContentCalendarEntry,
  ContentCalendarStatus,
  ContentPlatform,
} from '../types/content'
import type { SelectOption, Tone } from '../types/ui'
import { contentStatus } from '../utils/contentRecords'

type CalendarViewMode = 'month' | 'week'

const router = useRouter()
const library = useContentLibraryStore()
const workflow = useContentWorkflowStore()
const calendar = useCalendarStore()
const ui = useUiStore()
const products = useProductsStore()
const companyContext = useCompanyContextStore()

const viewMode = ref<CalendarViewMode>('month')
const anchorDate = ref(startOfDay(new Date()))
const platformFilter = ref('all')
const statusFilter = ref('all')
const contextFilter = ref('all')
const selectedEntryId = ref<string | null>(null)
const copiedEntryId = ref<string | null>(null)
const previewAsset = ref<ContentAssetRecord | null>(null)
const previewModalOpen = ref(false)
const publicationModalOpen = ref(false)
const publicationEntryId = ref<string | null>(null)
const publishedDate = ref(dateKey(new Date()))
const publishedTime = ref(timeKey(new Date()))
const postUrl = ref('')
const publicationError = ref('')

const platformOptions: SelectOption[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
]
const statusOptions: SelectOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Ready to Publish', label: 'Ready to Publish' },
  { value: 'Published', label: 'Published' },
]
const contextOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: 'All Products / Contexts' },
  { value: companyContext.companyProfile.name, label: companyContext.companyProfile.name },
  ...products.products.map((product) => ({ value: product.name, label: product.name })),
])

const entries = computed<ContentCalendarEntry[]>(() => calendar.entries)
const filteredEntries = computed(() => entries.value.filter((entry) =>
  (platformFilter.value === 'all' || entry.platform === platformFilter.value) &&
  (statusFilter.value === 'all' || entry.status === statusFilter.value) &&
  (contextFilter.value === 'all' || entry.contextName === contextFilter.value),
))
const monthDays = computed(() => {
  const first = new Date(anchorDate.value.getFullYear(), anchorDate.value.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
})
const weekDays = computed(() => {
  const start = startOfWeek(anchorDate.value)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
})
const periodLabel = computed(() => {
  if (viewMode.value === 'month') {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchorDate.value)
  }
  const days = weekDays.value
  return `${formatShortDate(days[0], true)} – ${formatShortDate(days[6], true)}`
})
const selectedEntry = computed(() => entries.value.find((entry) => entry.id === selectedEntryId.value) ?? null)
const selectedRecord = computed(() => selectedEntry.value ? library.records.find((record) => record.id === selectedEntry.value!.contentId) : undefined)
const selectedAssets = computed(() => {
  if (!selectedEntry.value || !selectedRecord.value) return []
  if (selectedEntry.value.platform === 'instagram') return selectedRecord.value.details.creative.instagram
  return selectedRecord.value.details.creative.linkedinReusesInstagram
    ? selectedRecord.value.details.creative.instagram
    : selectedRecord.value.details.creative.linkedin
})
const publicationEntry = computed(() => entries.value.find((entry) => entry.id === publicationEntryId.value) ?? null)
const upcomingEntries = computed(() => entries.value
  .filter((entry) => entry.status !== 'Published')
  .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  .slice(0, 5))
const filtersActive = computed(() => [platformFilter.value, statusFilter.value, contextFilter.value].some((value) => value !== 'all'))

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function startOfWeek(value: Date) {
  const result = startOfDay(value)
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function addDays(value: Date, days: number) {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

function dateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeKey(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

function formatShortDate(value: Date, includeYear = false) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' as const } : {}) }).format(value)
}

function entriesForDay(value: Date) {
  const key = dateKey(value)
  return filteredEntries.value.filter((entry) => entry.scheduledDate === key)
}

function isToday(value: Date) {
  return dateKey(value) === dateKey(new Date())
}

function navigatePeriod(direction: -1 | 1) {
  const next = new Date(anchorDate.value)
  if (viewMode.value === 'month') next.setMonth(next.getMonth() + direction, 1)
  else next.setDate(next.getDate() + direction * 7)
  anchorDate.value = next
}

function resetToday() {
  anchorDate.value = startOfDay(new Date())
}

function clearFilters() {
  platformFilter.value = 'all'
  statusFilter.value = 'all'
  contextFilter.value = 'all'
}

function platformLabel(platform: ContentPlatform) {
  return platform === 'instagram' ? 'Instagram' : 'LinkedIn'
}

function calendarTone(status: ContentCalendarStatus): Tone {
  if (status === 'Published') return 'success'
  if (status === 'Ready to Publish') return 'warning'
  return 'info'
}

function openEntry(entry: ContentCalendarEntry) {
  selectedEntryId.value = entry.id
  void library.getById(entry.contentId)
}

function entryCopy(entry: ContentCalendarEntry) {
  const record = library.records.find((item) => item.id === entry.contentId)
  if (!record) return ''
  const variant = entry.platform === 'instagram' ? record.details.instagram : record.details.linkedin
  if (!variant) return ''
  const copy = entry.platform === 'instagram' ? variant.caption : variant.postCopy
  return [copy, variant.cta, variant.hashtags].filter(Boolean).join('\n\n')
}

function copyEntry(entry: ContentCalendarEntry) {
  const value = entryCopy(entry)
  if (!value) return
  if (!navigator.clipboard) {
    ui.notify('Copy is ready to select manually.', 'info')
    return
  }
  navigator.clipboard.writeText(value).then(() => {
    copiedEntryId.value = entry.id
    ui.notify('Copied.', 'success')
    window.setTimeout(() => { if (copiedEntryId.value === entry.id) copiedEntryId.value = null }, 1600)
  }).catch(() => ui.notify('Copy is ready to select manually.', 'info'))
}

function openCreative(asset?: ContentAssetRecord) {
  const target = asset ?? selectedAssets.value[0]
  if (!target) return
  previewAsset.value = target
  previewModalOpen.value = true
}

function openPublication(entry: ContentCalendarEntry) {
  publicationEntryId.value = entry.id
  const now = new Date()
  publishedDate.value = dateKey(now)
  publishedTime.value = timeKey(now)
  postUrl.value = ''
  publicationError.value = ''
  publicationModalOpen.value = true
}

async function confirmPublication() {
  if (!publicationEntry.value) return
  const publishedPlatform = publicationEntry.value.platform
  if (!publishedDate.value || !publishedTime.value) {
    publicationError.value = 'Published date and time are required.'
    return
  }
  const publishedAt = `${publishedDate.value}T${publishedTime.value}:00+07:00`
  if (Number.isNaN(new Date(publishedAt).getTime())) {
    publicationError.value = 'Enter a valid published date and time.'
    return
  }
  const normalizedPostUrl = postUrl.value.trim()
  if (normalizedPostUrl) {
    try {
      const parsedUrl = new URL(normalizedPostUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol')
    } catch {
      publicationError.value = 'Enter a valid http or https post URL, or leave it blank.'
      return
    }
  }
  const updated = await library.markPublished(publicationEntry.value.contentId, publicationEntry.value.platform, {
    publishedAt,
    postUrl: normalizedPostUrl,
  })
  if (!updated) {
    publicationError.value = 'This scheduled entry could not be updated.'
    return
  }
  publicationModalOpen.value = false
  publicationError.value = ''
  await loadCalendar()
  ui.notify(`${platformLabel(publishedPlatform)} marked as published.`, 'success')
}

const rangeStart = computed(() => viewMode.value === 'month' ? new Date(anchorDate.value.getFullYear(), anchorDate.value.getMonth(), 1) : startOfWeek(anchorDate.value))
const rangeEnd = computed(() => viewMode.value === 'month' ? new Date(anchorDate.value.getFullYear(), anchorDate.value.getMonth() + 1, 1) : addDays(rangeStart.value, 7))
async function loadCalendar() {
  await Promise.all([companyContext.load(), products.load()])
  await calendar.load(dateKey(rangeStart.value), dateKey(rangeEnd.value), {
    platform: platformFilter.value === 'all' ? undefined : platformFilter.value as ContentPlatform,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value === 'Ready to Publish' ? 'ready_to_publish' : statusFilter.value.toLowerCase() as 'scheduled' | 'published',
  })
}
watch([viewMode, anchorDate, platformFilter, statusFilter], () => { void loadCalendar() })
onMounted(() => { void loadCalendar() })
</script>

<template>
  <div class="page-stack calendar-page">
    <PageHeader title="Content Calendar" description="Plan and track approved content across Instagram and LinkedIn." :breadcrumbs="[{ label: 'Planning & Insights' }, { label: 'Content Calendar' }]">
      <template #actions><BaseButton variant="secondary" @click="resetToday">Today</BaseButton><div class="calendar-period-actions"><BaseButton variant="ghost" aria-label="Previous period" @click="navigatePeriod(-1)"><AppIcon name="arrow-left" :size="16" /></BaseButton><BaseButton variant="ghost" aria-label="Next period" @click="navigatePeriod(1)"><AppIcon name="arrow-right" :size="16" /></BaseButton></div></template>
    </PageHeader>
    <InlineAlert v-if="calendar.loading" title="Loading calendar">Reading schedules from the backend…</InlineAlert>
    <InlineAlert v-else-if="calendar.error" title="Calendar unavailable" tone="danger">{{ calendar.error }}</InlineAlert>

    <BaseCard class="calendar-toolbar">
      <div class="calendar-toolbar__row">
        <div><span class="calendar-overline">{{ viewMode === 'month' ? 'Month view' : 'Week view' }}</span><h2>{{ periodLabel }}</h2></div>
        <div class="calendar-view-toggle" role="group" aria-label="Calendar view"><button type="button" :class="{ 'is-active': viewMode === 'month' }" :aria-pressed="viewMode === 'month'" @click="viewMode = 'month'">Month</button><button type="button" :class="{ 'is-active': viewMode === 'week' }" :aria-pressed="viewMode === 'week'" @click="viewMode = 'week'">Week</button></div>
      </div>
      <div class="calendar-filter-row">
        <BaseSelect v-model="platformFilter" label="Platform" :options="platformOptions" size="compact" />
        <BaseSelect v-model="statusFilter" label="Status" :options="statusOptions" size="compact" />
        <BaseSelect v-model="contextFilter" label="Product / Context" :options="contextOptions" size="compact" />
        <BaseButton v-if="filtersActive" variant="ghost" size="compact" @click="clearFilters">Clear Filters</BaseButton>
      </div>
    </BaseCard>

    <BaseCard v-if="calendar.loaded && !calendar.loading && !calendar.error && entries.length === 0"><EmptyState icon="calendar" title="No content scheduled yet." description="Approved content will appear here after a publication date and time are selected."><BaseButton @click="workflow.startNewWorkflow(); router.push('/content/create')">Create Content</BaseButton><BaseButton variant="secondary" @click="router.push('/content')">View Content Library</BaseButton></EmptyState></BaseCard>

    <div v-else-if="calendar.loaded && !calendar.loading && !calendar.error" class="calendar-layout">
      <main class="calendar-main">
        <div v-if="filteredEntries.length === 0" class="calendar-filter-empty"><EmptyState icon="search" title="No scheduled content matches these filters." description="Adjust the platform, status, or product filter to see calendar entries."><BaseButton variant="secondary" @click="clearFilters">Clear Filters</BaseButton></EmptyState></div>

        <div v-else-if="viewMode === 'month'" class="calendar-scroll" tabindex="0" role="region" aria-label="Monthly content calendar">
          <div class="month-calendar">
            <div v-for="day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']" :key="day" class="calendar-weekday">{{ day.slice(0, 3) }}</div>
            <div v-for="day in monthDays" :key="dateKey(day)" class="month-day" :class="{ 'is-outside': day.getMonth() !== anchorDate.getMonth(), 'is-today': isToday(day) }">
              <div class="month-day__header"><span>{{ day.getDate() }}</span><small v-if="isToday(day)">Today</small></div>
              <div class="month-day__entries">
                <button v-for="entry in entriesForDay(day).slice(0, 3)" :key="entry.id" type="button" class="calendar-entry" :class="[`is-${entry.platform}`, `is-${entry.status.toLowerCase().replaceAll(' ', '-')}`]" @click="openEntry(entry)"><span class="calendar-entry__time">{{ entry.scheduledTime }}</span><span class="calendar-entry__platform">{{ platformLabel(entry.platform) }}</span><strong>{{ entry.title }}</strong></button>
                <button v-if="entriesForDay(day).length > 3" type="button" class="calendar-more" @click="openEntry(entriesForDay(day)[3])">+{{ entriesForDay(day).length - 3 }} more</button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="calendar-scroll" tabindex="0" role="region" aria-label="Weekly content calendar">
          <div class="week-calendar">
            <section v-for="day in weekDays" :key="dateKey(day)" class="week-day" :class="{ 'is-today': isToday(day) }"><header><span>{{ new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(day) }}</span><strong>{{ formatShortDate(day) }}</strong></header><div class="week-day__entries"><button v-for="entry in entriesForDay(day)" :key="entry.id" type="button" class="week-entry" :class="`is-${entry.platform}`" @click="openEntry(entry)"><time>{{ entry.scheduledTime }}</time><span>{{ platformLabel(entry.platform) }}</span><strong>{{ entry.title }}</strong><StatusBadge :tone="calendarTone(entry.status)">{{ entry.status }}</StatusBadge></button><p v-if="entriesForDay(day).length === 0">No scheduled content</p></div></section>
          </div>
        </div>
      </main>

      <aside class="calendar-sidebar">
        <BaseCard v-if="selectedEntry && selectedRecord" :title="selectedEntry.title" description="Manual publication workspace">
          <template #actions><StatusBadge :tone="calendarTone(selectedEntry.status)" dot>{{ selectedEntry.status }}</StatusBadge></template>
          <dl class="calendar-entry-details"><div><dt>Platform</dt><dd>{{ platformLabel(selectedEntry.platform) }}</dd></div><div><dt>Product / Context</dt><dd>{{ selectedEntry.contextName }}</dd></div><div><dt>Content Pillar</dt><dd>{{ selectedEntry.pillar }}</dd></div><div><dt>Scheduled</dt><dd>{{ formatShortDate(selectedEntry.scheduledAt, true) }} · {{ selectedEntry.scheduledTime }}</dd></div><div><dt>Lifecycle Status</dt><dd>{{ contentStatus(selectedRecord) }}</dd></div></dl>
          <div class="calendar-copy-preview"><span>{{ selectedEntry.platform === 'instagram' ? 'Caption preview' : 'Post preview' }}</span><p>{{ entryCopy(selectedEntry) }}</p></div>
          <div v-if="selectedAssets.length" class="calendar-asset-strip"><ContentAssetThumbnail v-for="asset in selectedAssets" :key="asset.id" :asset="asset" @preview="openCreative" /></div>
          <div class="calendar-detail-actions"><BaseButton size="compact" @click="router.push(`/content/${selectedEntry.contentId}`)">View Content</BaseButton><BaseButton variant="secondary" size="compact" @click="copyEntry(selectedEntry)">{{ copiedEntryId === selectedEntry.id ? 'Copied' : selectedEntry.platform === 'instagram' ? 'Copy Caption' : 'Copy Post' }}</BaseButton><BaseButton variant="secondary" size="compact" :disabled="selectedAssets.length === 0" @click="openCreative()">View Creative</BaseButton><BaseButton v-if="selectedEntry.status !== 'Published'" variant="secondary" size="compact" @click="openPublication(selectedEntry)">Mark as Published</BaseButton></div>
        </BaseCard>

        <BaseCard title="Upcoming Content" description="Next scheduled manual publication tasks.">
          <div v-if="upcomingEntries.length" class="upcoming-list"><button v-for="entry in upcomingEntries" :key="entry.id" type="button" @click="openEntry(entry)"><div><strong>{{ entry.title }}</strong><span>{{ platformLabel(entry.platform) }} · {{ entry.contextName }}</span></div><time>{{ isToday(entry.scheduledAt) ? 'Today' : formatShortDate(entry.scheduledAt) }} · {{ entry.scheduledTime }}</time></button></div><p v-else class="calendar-helper">No upcoming scheduled content.</p>
        </BaseCard>
      </aside>
    </div>

    <BaseModal v-model="publicationModalOpen" title="Mark Content as Published" description="Use this after publishing the content manually on the selected platform.">
      <div v-if="publicationEntry" class="publication-form"><dl><div><dt>Platform</dt><dd>{{ platformLabel(publicationEntry.platform) }}</dd></div><div><dt>Scheduled Date / Time</dt><dd>{{ formatShortDate(publicationEntry.scheduledAt, true) }} · {{ publicationEntry.scheduledTime }}</dd></div></dl><BaseInput v-model="publishedDate" type="date" label="Published Date" required :error="publicationError && !publishedDate ? 'Published date is required.' : undefined" /><BaseInput v-model="publishedTime" type="time" label="Published Time" required :error="publicationError && !publishedTime ? 'Published time is required.' : undefined" /><BaseInput v-model="postUrl" type="url" label="Post URL (optional)" placeholder="https://" /><p v-if="publicationError" class="publication-error" role="alert">{{ publicationError }}</p></div>
      <template #footer><div class="calendar-modal-actions"><BaseButton variant="ghost" @click="publicationModalOpen = false">Cancel</BaseButton><BaseButton @click="confirmPublication">Confirm Publication</BaseButton></div></template>
    </BaseModal>

    <BaseModal v-model="previewModalOpen" title="Creative Preview" :description="previewAsset?.name" size="wide"><div v-if="previewAsset" class="calendar-large-preview"><img v-if="previewAsset.url" :src="previewAsset.url" :alt="previewAsset.name" /><div v-else><small>Creative placeholder</small><strong>{{ previewAsset.previewLabel ?? 'Creative' }}</strong><span>{{ previewAsset.type }} · {{ String(previewAsset.order).padStart(2, '0') }}</span></div></div></BaseModal>
  </div>
</template>

<style scoped>
.calendar-period-actions, .calendar-toolbar__row, .calendar-filter-row, .calendar-view-toggle, .calendar-detail-actions, .calendar-modal-actions { display: flex; align-items: center; gap: 8px; }
.calendar-toolbar :deep(.ui-card__body) { display: grid; gap: 16px; }
.calendar-toolbar__row { justify-content: space-between; }
.calendar-overline { color: var(--color-muted); font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.calendar-toolbar h2 { margin-top: 3px; font-size: 20px; line-height: 28px; font-weight: 600; }
.calendar-view-toggle { padding: 3px; border-radius: 7px; background: var(--color-well); }
.calendar-view-toggle button { min-height: 32px; padding: 0 14px; border-radius: 5px; color: var(--color-muted); font-size: 12px; font-weight: 500; }
.calendar-view-toggle button.is-active { background: var(--color-surface); color: var(--color-primary); box-shadow: 0 1px 3px rgb(11 28 48 / .1); }
.calendar-view-toggle button:focus-visible { outline: 3px solid rgb(29 78 216 / .18); }
.calendar-filter-row { flex-wrap: wrap; padding-top: 14px; border-top: 1px solid var(--color-border); }
.calendar-filter-row :deep(.ui-field) { min-width: 180px; flex: 1; }
.calendar-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; }
.calendar-main { min-width: 0; }
.calendar-sidebar { position: sticky; top: 84px; display: grid; gap: 20px; }
.calendar-scroll { max-width: 100%; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.calendar-scroll:focus-visible { outline: 3px solid rgb(29 78 216 / .16); outline-offset: 2px; }
.month-calendar { display: grid; grid-template-columns: repeat(7, minmax(125px, 1fr)); min-width: 875px; }
.calendar-weekday { padding: 10px 12px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); background: var(--color-well); color: var(--color-muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.calendar-weekday:nth-child(7) { border-right: 0; }
.month-day { min-height: 142px; padding: 9px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); background: var(--color-surface); }
.month-day:nth-child(7n) { border-right: 0; }
.month-day:nth-last-child(-n + 7) { border-bottom: 0; }
.month-day.is-outside { background: #fbfcff; }
.month-day.is-outside .month-day__header { opacity: .45; }
.month-day.is-today { background: #f7faff; box-shadow: inset 0 0 0 1px #a9c4ff; }
.month-day__header { display: flex; align-items: center; justify-content: space-between; min-height: 22px; margin-bottom: 6px; font-size: 12px; font-weight: 600; }
.month-day__header small { color: var(--color-primary); font-size: 9px; text-transform: uppercase; }
.month-day__entries { display: grid; gap: 5px; }
.calendar-entry { display: grid; grid-template-columns: auto 1fr; gap: 1px 5px; min-width: 0; padding: 5px 6px; border-left: 3px solid #2563eb; border-radius: 4px; background: #eff4ff; text-align: left; }
.calendar-entry.is-linkedin { border-left-color: #475569; background: #f1f5f9; }
.calendar-entry.is-published { border-left-color: #15803d; background: #f0fdf4; }
.calendar-entry.is-ready-to-publish { border-left-color: #b7791f; background: #fffaf0; }
.calendar-entry:hover, .calendar-entry:focus-visible { box-shadow: inset 0 0 0 1px currentColor; outline: 0; }
.calendar-entry__time { color: var(--color-text); font-size: 10px; font-weight: 600; }
.calendar-entry__platform { color: var(--color-muted); font-size: 10px; }
.calendar-entry strong { grid-column: 1 / -1; overflow: hidden; color: var(--color-text); font-size: 10px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.calendar-more { color: var(--color-primary); font-size: 10px; font-weight: 500; text-align: left; }
.week-calendar { display: grid; grid-template-columns: repeat(7, minmax(150px, 1fr)); min-width: 1050px; }
.week-day { min-height: 430px; border-right: 1px solid var(--color-border); }
.week-day:last-child { border-right: 0; }
.week-day > header { display: flex; flex-direction: column; gap: 3px; padding: 12px; border-bottom: 1px solid var(--color-border); background: var(--color-well); }
.week-day.is-today > header { background: #dce9ff; color: var(--color-primary); }
.week-day > header span { color: var(--color-muted); font-size: 11px; }
.week-day > header strong { font-size: 13px; }
.week-day__entries { display: grid; align-content: start; gap: 8px; padding: 10px; }
.week-day__entries > p, .calendar-helper { padding: 16px 4px; color: var(--color-subtle); font-size: 11px; text-align: center; }
.week-entry { display: grid; gap: 5px; padding: 9px; border-left: 3px solid #2563eb; border-radius: 5px; background: #eff4ff; text-align: left; }
.week-entry.is-linkedin { border-left-color: #475569; background: #f1f5f9; }
.week-entry time, .week-entry > span { color: var(--color-muted); font-size: 10px; }
.week-entry strong { font-size: 11px; line-height: 1.4; font-weight: 600; }
.calendar-entry-details, .publication-form dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.calendar-entry-details div, .publication-form dl div { display: grid; gap: 3px; }
.calendar-entry-details dt, .publication-form dt { color: var(--color-muted); font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.calendar-entry-details dd, .publication-form dd { font-size: 12px; font-weight: 500; }
.calendar-copy-preview { display: grid; gap: 8px; margin-top: 16px; padding: 12px; border-radius: 6px; background: var(--color-well); }
.calendar-copy-preview span { color: var(--color-muted); font-size: 10px; font-weight: 600; text-transform: uppercase; }
.calendar-copy-preview p { display: -webkit-box; overflow: hidden; color: var(--color-text); font-size: 12px; line-height: 1.55; white-space: pre-line; -webkit-box-orient: vertical; -webkit-line-clamp: 6; }
.calendar-asset-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
.calendar-detail-actions { flex-wrap: wrap; margin-top: 16px; }
.upcoming-list { display: grid; }
.upcoming-list button { display: grid; gap: 7px; padding: 11px 0; border-bottom: 1px solid var(--color-border); text-align: left; }
.upcoming-list button:last-child { border-bottom: 0; }
.upcoming-list button div { display: grid; gap: 3px; }
.upcoming-list strong { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.upcoming-list span, .upcoming-list time { color: var(--color-muted); font-size: 10px; }
.upcoming-list button:hover strong, .upcoming-list button:focus-visible strong { color: var(--color-primary); }
.upcoming-list button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.calendar-filter-empty { border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.publication-form { display: grid; gap: 16px; }
.publication-form dl { padding: 12px; border-radius: 6px; background: var(--color-well); }
.publication-error { color: #991b1b; font-size: 12px; }
.calendar-modal-actions { justify-content: flex-end; }
.calendar-large-preview { min-height: 440px; overflow: hidden; border-radius: var(--radius-card); background: #eff4ff; }
.calendar-large-preview img { width: 100%; max-height: 70vh; object-fit: contain; }
.calendar-large-preview > div { display: flex; flex-direction: column; justify-content: flex-end; min-height: 440px; padding: 40px; color: white; background: linear-gradient(145deg, #0b1c30, #153d83); }
.calendar-large-preview small { margin-bottom: auto; letter-spacing: .1em; text-transform: uppercase; opacity: .75; }
.calendar-large-preview strong { max-width: 12ch; font-size: clamp(28px, 5vw, 52px); line-height: 1.05; font-weight: 600; }
.calendar-large-preview span { margin-top: 28px; color: #bae6fd; }
@media (max-width: 1150px) { .calendar-layout { grid-template-columns: 1fr; } .calendar-sidebar { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .calendar-sidebar { grid-template-columns: 1fr; } .calendar-toolbar__row { align-items: flex-start; flex-direction: column; } .calendar-filter-row :deep(.ui-field) { min-width: 100%; } }
</style>
