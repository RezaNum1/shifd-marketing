<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTable from '../components/ui/BaseTable.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { useProductsStore } from '../stores/products'
import { useCompanyContextStore } from '../stores/companyContext'
import type { ContentLifecycleStatus, ContentLibraryRecord, ContentPlatform } from '../types/content'
import type { SelectOption, TableColumn, Tone } from '../types/ui'
import { contentLifecycle, contentStatus } from '../utils/contentRecords'

const router = useRouter()
const library = useContentLibraryStore()
const workflow = useContentWorkflowStore()
const products = useProductsStore()
const companyContext = useCompanyContextStore()
const search = ref('')
const context = ref('all')
const product = ref('all')
const platform = ref('all')
const pillar = ref('all')
const status = ref('all')
const openMenu = ref<string | null>(null)
const archiveTarget = ref<ContentLibraryRecord | null>(null)
const archiveModalOpen = ref(false)

const contextOptions: SelectOption[] = [
  { value: 'all', label: 'All Contexts' },
  { value: 'company', label: 'Company' },
  { value: 'product', label: 'Product' },
]
const productOptions = computed<SelectOption[]>(() => [{ value: 'all', label: 'All Products' }, ...products.productOptions])
const platformOptions: SelectOption[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
]
const pillarOptions: SelectOption[] = [
  { value: 'all', label: 'All Pillars' },
  ...['Educational', 'Problem / Pain Point', 'Product Insight', 'Use Case', 'Industry Insight', 'Thought Leadership', 'Company / Brand'].map((value) => ({ value, label: value })),
]
const statusOptions: SelectOption[] = [
  { value: 'all', label: 'All Statuses' },
  ...(['Draft', 'Generated', 'Adapted', 'Creative In Progress', 'Ready for Review', 'Needs Revision', 'Approved', 'Scheduled', 'Published', 'Archived'] as ContentLifecycleStatus[]).map((value) => ({ value, label: value })),
]
const columns: TableColumn[] = [
  { key: 'content', label: 'Content' },
  { key: 'context', label: 'Context' },
  { key: 'pillar', label: 'Pillar' },
  { key: 'platforms', label: 'Platforms' },
  { key: 'status', label: 'Status' },
  { key: 'schedule', label: 'Schedule / Published' },
  { key: 'updated', label: 'Last Updated' },
  { key: 'actions', label: 'Actions' },
]

function contextName(record: ContentLibraryRecord) {
  if (record.context === 'company') return companyContext.companyProfile.name
  return products.nameFor(record.productId)
}

const activeFilters = computed(() => Boolean(search.value.trim()) || [context.value, product.value, platform.value, pillar.value, status.value].some((value) => value !== 'all'))
const filteredRecords = computed(() => {
  const query = search.value.trim().toLowerCase()
  return library.records.filter((record) => {
    const matchesSearch = !query || [record.title, record.topic, contextName(record)].filter(Boolean).some((value) => value!.toLowerCase().includes(query))
    return matchesSearch &&
      (context.value === 'all' || record.context === context.value) &&
      (product.value === 'all' || record.productId === product.value) &&
      (platform.value === 'all' || record.platforms.includes(platform.value as ContentPlatform)) &&
      (pillar.value === 'all' || record.pillar === pillar.value) &&
      (status.value === 'all' || contentStatus(record) === status.value)
  })
})
const summary = computed(() => [
  { label: 'All Content', value: library.records.length },
  { label: 'In Progress', value: library.records.filter((record) => ['Generated', 'Adapted', 'Creative In Progress'].includes(contentStatus(record))).length },
  { label: 'Needs Review', value: library.records.filter((record) => ['Ready for Review', 'Needs Revision'].includes(contentStatus(record))).length },
  { label: 'Scheduled', value: library.records.filter((record) => contentStatus(record) === 'Scheduled').length },
  { label: 'Published', value: library.records.filter((record) => contentStatus(record) === 'Published').length },
])
const hasRecords = computed(() => library.records.length > 0)

function statusTone(value: ContentLifecycleStatus): Tone {
  if (value === 'Published' || value === 'Approved') return 'success'
  if (value === 'Scheduled' || value === 'Generated' || value === 'Adapted' || value === 'Creative In Progress') return 'info'
  if (value === 'Ready for Review' || value === 'Needs Revision') return 'warning'
  return 'neutral'
}

function clearFilters() {
  search.value = ''
  context.value = 'all'
  product.value = 'all'
  platform.value = 'all'
  pillar.value = 'all'
  status.value = 'all'
}

function openRecord(record: ContentLibraryRecord) {
  openMenu.value = null
  router.push(`/content/${record.id}`)
}

async function continueEditing(record: ContentLibraryRecord) {
  const loaded = await workflow.load(record.id)
  if (!loaded) return
  openMenu.value = null
  router.push('/content/create')
}

function startNewContent() {
  workflow.startNewWorkflow()
  router.push('/content/create')
}

function canContinueEditing(record: ContentLibraryRecord) {
  return !['Published', 'Archived'].includes(contentStatus(record))
}

async function duplicateRecord(record: ContentLibraryRecord) {
  await library.duplicate(record.id)
  openMenu.value = null
}

async function archiveRecord() {
  if (archiveTarget.value) await library.archive(archiveTarget.value.id)
  archiveTarget.value = null
  archiveModalOpen.value = false
  openMenu.value = null
}

function formatSchedule(record: ContentLibraryRecord) {
  const lifecycle = contentLifecycle(record)
  const publication = Object.values(lifecycle.publications)[0]
  const schedule = Object.values(lifecycle.schedules)[0]
  if (contentStatus(record) === 'Published' && publication) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(publication.publishedAt))
  }
  if (schedule) return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${schedule.date}T${schedule.time}`))} · ${schedule.time}`
  return '—'
}

onMounted(() => { void Promise.all([library.load(), products.load(), companyContext.load()]) })
</script>

<template>
  <div class="page-stack content-library-page">
    <PageHeader title="Content Library" description="Manage your marketing content from draft to publication." :breadcrumbs="[{ label: 'Content Studio' }, { label: 'Content Library' }]">
      <template #actions><BaseButton @click="startNewContent"><AppIcon name="plus" :size="16" />Create Content</BaseButton></template>
    </PageHeader>

    <InlineAlert v-if="library.loading" title="Loading content">Loading canonical Content records…</InlineAlert>
    <InlineAlert v-if="library.error" title="Content library unavailable" tone="danger">{{ library.error }}</InlineAlert>

    <section class="library-summary" aria-label="Content summary">
      <div v-for="item in summary" :key="item.label" class="library-summary__item"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
    </section>

    <BaseCard class="library-controls">
      <div class="library-controls__top">
        <label class="library-search"><AppIcon name="search" :size="17" /><span class="sr-only">Search content</span><input v-model="search" type="search" placeholder="Search content..." /></label>
        <div class="library-filters">
          <BaseSelect v-model="context" label="Context" :options="contextOptions" size="compact" />
          <BaseSelect v-model="product" label="Product" :options="productOptions" size="compact" />
          <BaseSelect v-model="platform" label="Platform" :options="platformOptions" size="compact" />
          <BaseSelect v-model="pillar" label="Content Pillar" :options="pillarOptions" size="compact" />
          <BaseSelect v-model="status" label="Status" :options="statusOptions" size="compact" />
        </div>
      </div>
      <div v-if="activeFilters" class="library-controls__footer"><span class="library-filter-count">{{ filteredRecords.length }} matching content records</span><BaseButton variant="ghost" size="compact" @click="clearFilters">Clear Filters</BaseButton></div>
    </BaseCard>

    <template v-if="library.loaded && hasRecords && filteredRecords.length">
      <BaseTable :columns="columns" :rows="filteredRecords" caption="Content library records">
        <template #cell-content="{ row }"><button class="library-title-cell" type="button" @click="openRecord(row)"><strong>{{ row.title }}</strong><span>{{ row.topic }}</span></button></template>
        <template #cell-context="{ row }"><div class="library-context-cell"><strong>{{ contextName(row) }}</strong><span>{{ row.context === 'company' ? 'Company' : 'Product' }}</span></div></template>
        <template #cell-pillar="{ row }"><span class="library-muted-cell">{{ row.pillar }}</span></template>
        <template #cell-platforms="{ row }"><div class="platform-indicators" :aria-label="row.platforms.map((item) => item === 'instagram' ? 'Instagram' : 'LinkedIn').join(' and ')"><span v-for="item in row.platforms" :key="item" class="platform-indicator">{{ item === 'instagram' ? 'IG' : 'IN' }}</span></div></template>
        <template #cell-status="{ row }"><StatusBadge :tone="statusTone(contentStatus(row))" dot>{{ contentStatus(row) }}</StatusBadge></template>
        <template #cell-schedule="{ row }"><div class="library-context-cell"><strong>{{ formatSchedule(row) }}</strong><span v-if="!['Draft', 'Generated', 'Adapted'].includes(contentStatus(row))">{{ contentStatus(row) }}</span></div></template>
        <template #cell-updated="{ row }"><span class="library-muted-cell">{{ row.updatedAt }}</span></template>
        <template #cell-actions="{ row }"><div class="library-row-actions"><BaseButton variant="ghost" size="compact" aria-label="Open actions" @click.stop="openMenu = openMenu === row.id ? null : row.id"><AppIcon name="settings" :size="15" /></BaseButton><div v-if="openMenu === row.id" class="library-action-menu"><button type="button" @click="openRecord(row)">Open</button><button v-if="canContinueEditing(row)" type="button" @click="continueEditing(row)">Continue Editing</button><button type="button" @click="duplicateRecord(row)">Duplicate</button><button v-if="contentStatus(row) !== 'Archived'" type="button" @click="archiveTarget = row; archiveModalOpen = true; openMenu = null">Archive</button></div></div></template>
      </BaseTable>
    </template>
    <BaseCard v-else-if="library.loaded && !hasRecords"><EmptyState icon="library" title="No content yet" description="Create your first marketing content and manage its journey from idea to publication."><BaseButton @click="startNewContent"><AppIcon name="plus" :size="16" />Create Content</BaseButton></EmptyState></BaseCard>
    <BaseCard v-else-if="library.loaded"><EmptyState icon="search" title="No content matches these filters." description="Try adjusting your search or filters to find a content record."><BaseButton variant="secondary" @click="clearFilters">Clear Filters</BaseButton></EmptyState></BaseCard>

    <BaseModal v-model="archiveModalOpen" title="Archive content" description="Archived content remains available through the Archived status filter."><p v-if="archiveTarget">Archive “{{ archiveTarget.title }}”?</p><template #footer><div class="modal-actions"><BaseButton variant="ghost" @click="archiveModalOpen = false">Cancel</BaseButton><BaseButton variant="danger" @click="archiveRecord">Archive</BaseButton></div></template></BaseModal>
  </div>
</template>

<style scoped>
.library-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.library-summary__item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.library-summary__item span { color: var(--color-muted); font-size: 12px; }
.library-summary__item strong { font-size: 20px; font-weight: 600; color: var(--color-text); }
.library-controls :deep(.ui-card__body) { padding: 16px; }
.library-controls__top { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.library-search { display: flex; align-items: center; gap: 8px; flex: 1 1 250px; min-height: 32px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-well); color: var(--color-muted); }
.library-search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; }
.library-search:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgb(29 78 216 / 0.14); }
.library-filters { display: grid; grid-template-columns: repeat(5, minmax(125px, 1fr)); flex: 3 1 650px; gap: 8px; }
.library-filters :deep(.form-field) { gap: 0; }
.library-filters :deep(.form-field__label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.library-controls__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border); }
.library-filter-count, .library-muted-cell, .library-context-cell span { color: var(--color-muted); font-size: 12px; }
.library-title-cell { display: flex; flex-direction: column; gap: 4px; min-width: 260px; text-align: left; color: var(--color-text); }
.library-title-cell strong { font-size: 14px; font-weight: 600; }
.library-title-cell span { color: var(--color-muted); font-size: 12px; }
.library-title-cell:hover strong { color: var(--color-primary); }
.library-context-cell { display: flex; flex-direction: column; gap: 3px; min-width: 110px; }
.library-context-cell strong { font-size: 13px; font-weight: 500; }
.platform-indicators { display: flex; gap: 4px; }
.platform-indicator { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 22px; padding: 0 5px; border-radius: 5px; background: var(--color-well); color: var(--color-primary); font-size: 10px; font-weight: 600; }
.library-row-actions { position: relative; display: flex; justify-content: flex-end; }
.library-action-menu { position: absolute; z-index: 5; top: calc(100% + 4px); right: 0; display: flex; flex-direction: column; min-width: 150px; padding: 4px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface); box-shadow: var(--shadow-popover); }
.library-action-menu button { padding: 8px 10px; border-radius: 4px; text-align: left; color: var(--color-text); font-size: 12px; white-space: nowrap; }
.library-action-menu button:hover, .library-action-menu button:focus-visible { background: var(--color-well); outline: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 1100px) { .library-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } .library-filters { grid-template-columns: repeat(3, minmax(125px, 1fr)); } }
@media (max-width: 700px) { .library-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .library-filters { grid-template-columns: repeat(2, minmax(125px, 1fr)); } }
</style>
