<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import ContentIdeaEditor from '../components/content/ContentIdeaEditor.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTable from '../components/ui/BaseTable.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { ideaContextOptions, ideaObjectiveOptions, pillarOptions } from '../constants/contentOptions'
import { useContentIdeasStore } from '../stores/contentIdeas'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { useUiStore } from '../stores/ui'
import { useProductsStore } from '../stores/products'
import { useCompanyContextStore } from '../stores/companyContext'
import type { ContentIdea, ContentIdeaStatus } from '../types/contentIdea'
import type { TableColumn } from '../types/ui'

const store = useContentIdeasStore()
const workflow = useContentWorkflowStore()
const router = useRouter()
const ui = useUiStore()
const products = useProductsStore()
const companyContext = useCompanyContextStore()
const search = ref('')
const status = ref<'All' | ContentIdeaStatus>('All')
const context = ref('all')
const product = ref('all')
const pillar = ref('all')
const objective = ref('all')
const editorOpen = ref(false)
const editingIdea = ref<ContentIdea>()
const tabs = ['All', 'Ready', 'Used', 'Archived'] as const
const columns: TableColumn[] = [
  { key: 'idea', label: 'Idea' }, { key: 'context', label: 'Context' },
  { key: 'pillar', label: 'Pillar / Objective' }, { key: 'audience', label: 'Target Audience' },
  { key: 'status', label: 'Status' }, { key: 'updated', label: 'Updated' }, { key: 'actions', label: 'Actions' },
]
const contextOptions = [{ value: 'all', label: 'All Contexts' }, ...ideaContextOptions]
const productOptions = computed(() => [{ value: 'all', label: 'All Products' }, ...products.productOptions])
const pillars = [{ value: 'all', label: 'All Pillars' }, ...pillarOptions]
const objectives = [{ value: 'all', label: 'All Objectives' }, ...ideaObjectiveOptions]
const activeFilters = computed(() => Boolean(search.value.trim()) || status.value !== 'All'
  || [context.value, product.value, pillar.value, objective.value].some((value) => value !== 'all'))
const filteredIdeas = computed(() => {
  const query = search.value.trim().toLowerCase()
  return store.ideas.filter((idea) =>
    (!query || [idea.title, idea.notes, products.nameFor(idea.productId), idea.contextType === 'company' ? companyContext.companyProfile.name : 'Product', idea.targetAudience].some((value) => value?.toLowerCase().includes(query)))
    && (status.value === 'All' || idea.status === status.value)
    && (context.value === 'all' || idea.contextType === context.value)
    && (product.value === 'all' || idea.productId === product.value)
    && (pillar.value === 'all' || idea.pillar === pillar.value)
    && (objective.value === 'all' || idea.objective === objective.value))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
})

function count(tab: typeof tabs[number]) { return tab === 'All' ? store.ideas.length : store.ideas.filter((idea) => idea.status === tab).length }
function label(options: { value: string; label: string }[], value: string) { return options.find((option) => option.value === value)?.label ?? value }
function date(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function clearFilters() { search.value = ''; status.value = 'All'; context.value = product.value = pillar.value = objective.value = 'all' }
function edit(idea?: ContentIdea) { editingIdea.value = idea; editorOpen.value = true }
function createContent(idea: ContentIdea) {
  workflow.startFromIdea(idea)
  router.push('/content/create')
}
function startNewContent() {
  workflow.startNewWorkflow()
  router.push('/content/create')
}
async function duplicate(idea: ContentIdea) {
  if (await store.duplicate(idea.id)) { clearFilters(); ui.notify('Idea duplicated as Ready.', 'success') }
}
async function archive(idea: ContentIdea) { if (await store.archive(idea.id)) ui.notify('Idea archived. You can restore it from Archived.', 'info') }
async function restore(idea: ContentIdea) { if (await store.restore(idea.id)) ui.notify('Idea restored to Ready.', 'success') }

onMounted(() => { void Promise.all([store.load(), products.load(), companyContext.loadTaxonomy(), companyContext.load()]) })
</script>

<template>
  <div class="page-stack ideas-page">
    <PageHeader title="Content Ideas" description="Capture and organize ideas before turning them into marketing content." :breadcrumbs="[{ label: 'Content Studio' }, { label: 'Ideas' }]">
      <template #actions><BaseButton variant="secondary" @click="startNewContent">Create Content</BaseButton><BaseButton @click="edit()"><AppIcon name="plus" :size="16" />Add Idea</BaseButton></template>
    </PageHeader>

    <div class="idea-tabs" role="group" aria-label="Idea status">
      <button v-for="tab in tabs" :key="tab" type="button" :aria-pressed="status === tab" @click="status = tab">{{ tab }} <span>{{ count(tab) }}</span></button>
    </div>

    <BaseCard>
      <div class="idea-filters">
        <BaseInput v-model="search" type="search" label="Search ideas" placeholder="Search ideas..." />
        <BaseSelect v-model="context" label="Context" :options="contextOptions" />
        <BaseSelect v-model="product" label="Product" :options="productOptions" />
        <BaseSelect v-model="pillar" label="Content Pillar" :options="pillars" />
        <BaseSelect v-model="objective" label="Objective" :options="objectives" />
      </div>
      <div v-if="activeFilters" class="idea-filter-footer"><span role="status">{{ filteredIdeas.length }} matching ideas</span><BaseButton variant="ghost" size="compact" @click="clearFilters">Clear Filters</BaseButton></div>
    </BaseCard>

    <InlineAlert v-if="store.loading" title="Loading ideas">Loading canonical ideas from the backend…</InlineAlert>
    <InlineAlert v-if="store.error" title="Ideas unavailable" tone="danger">{{ store.error }}</InlineAlert>

    <BaseTable v-if="store.loaded && filteredIdeas.length" :columns="columns" :rows="filteredIdeas" caption="Content ideas">
      <template #cell-idea="{ row }"><div class="idea-title"><strong>{{ row.title }}</strong><p v-if="row.notes">{{ row.notes }}</p></div></template>
      <template #cell-context="{ row }"><div class="idea-cell"><strong>{{ row.contextType === 'product' ? products.nameFor(row.productId) : companyContext.companyProfile.name }}</strong><span>{{ row.contextType === 'product' ? 'Product' : 'Company' }}</span></div></template>
      <template #cell-pillar="{ row }"><div class="idea-cell"><strong>{{ label(pillarOptions, row.pillar) }}</strong><span>{{ label(ideaObjectiveOptions, row.objective) }}</span></div></template>
      <template #cell-audience="{ row }"><span class="idea-audience">{{ row.targetAudience || '—' }}</span></template>
      <template #cell-status="{ row }"><StatusBadge :tone="row.status === 'Ready' ? 'success' : row.status === 'Used' ? 'info' : 'neutral'" dot>{{ row.status }}</StatusBadge></template>
      <template #cell-updated="{ row }"><time :datetime="row.updatedAt" :title="`Created ${date(row.createdAt)}`">{{ date(row.updatedAt) }}</time></template>
      <template #cell-actions="{ row }">
        <div class="idea-actions" role="group" :aria-label="`Actions for ${row.title}`">
          <template v-if="row.status === 'Ready'"><BaseButton variant="secondary" size="compact" @click="createContent(row)">Create Content</BaseButton><BaseButton variant="ghost" size="compact" @click="edit(row)">Edit</BaseButton></template>
          <template v-else-if="row.status === 'Used'"><BaseButton v-if="row.relatedContentId" variant="secondary" size="compact" @click="router.push(`/content/${row.relatedContentId}`)">View Related Content</BaseButton><span v-else class="idea-related-hint">Content not yet saved to Library</span></template>
          <BaseButton v-if="row.status === 'Archived'" variant="secondary" size="compact" @click="restore(row)">Restore</BaseButton>
          <BaseButton v-if="row.status !== 'Ready'" variant="ghost" size="compact" @click="duplicate(row)">Duplicate Idea</BaseButton>
          <BaseButton v-if="row.status !== 'Archived'" variant="ghost" size="compact" @click="archive(row)">Archive</BaseButton>
        </div>
      </template>
    </BaseTable>
    <BaseCard v-else-if="store.loaded && !store.ideas.length"><EmptyState icon="idea" title="No ideas yet." description="Capture potential topics and turn them into structured content briefs when ready."><BaseButton @click="edit()">Add Idea</BaseButton></EmptyState></BaseCard>
    <BaseCard v-else-if="store.loaded"><EmptyState icon="search" title="No ideas match these filters." description="Try another search or clear your filters."><BaseButton variant="secondary" @click="clearFilters">Clear Filters</BaseButton></EmptyState></BaseCard>

    <ContentIdeaEditor v-model="editorOpen" :idea="editingIdea" @saved="clearFilters(); ui.notify('Idea saved.', 'success')" />
  </div>
</template>

<style scoped>
.idea-tabs { display: flex; gap: 4px; padding: 4px; border-radius: var(--radius-card); background: var(--color-well); align-self: flex-start; max-width: 100%; overflow-x: auto; }
.idea-tabs button { display: flex; gap: 8px; padding: 8px 14px; border-radius: var(--radius-control); color: var(--color-muted); white-space: nowrap; font-size: 13px; }
.idea-tabs button[aria-pressed='true'] { background: var(--color-surface); color: var(--color-ink); font-weight: 600; }
.idea-tabs span { color: var(--color-subtle); font-size: 12px; }
.idea-filters { display: grid; grid-template-columns: minmax(200px, 1.5fr) repeat(4, minmax(130px, 1fr)); gap: 16px; }
.idea-filter-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; color: var(--color-muted); font-size: 13px; }
.idea-title { min-width: 240px; max-width: 340px; }
.idea-title strong { font-size: 14px; line-height: 1.5; }
.idea-title p { color: var(--color-muted); font-size: 12px; line-height: 1.6; margin-top: 6px; white-space: pre-line; overflow-wrap: anywhere; }
.idea-cell { display: grid; gap: 4px; min-width: 125px; }
.idea-cell strong { font-weight: 500; }
.idea-cell span, .idea-audience, time { color: var(--color-muted); font-size: 12px; }
.idea-actions { display: flex; flex-wrap: wrap; gap: 4px; width: 175px; }
.idea-related-hint { color: var(--color-subtle); font-size: 11px; }
@media (max-width: 1200px) { .idea-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .idea-filters > :first-child { grid-column: 1 / -1; } }
@media (max-width: 520px) { .idea-filters { grid-template-columns: minmax(0, 1fr); } .idea-tabs button { padding-inline: 10px; } }
</style>
