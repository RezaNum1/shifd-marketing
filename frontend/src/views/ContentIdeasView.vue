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
import BaseDrawer from '../components/ui/BaseDrawer.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import * as topicDiscoveryApi from '../api/topicDiscovery'
import * as industryIdeationApi from '../api/industryIdeation'
import * as prospectsApi from '../api/prospects'
import { errorMessage } from '../api/client'
import { ideaContextOptions, ideaObjectiveOptions, pillarOptions } from '../constants/contentOptions'
import { useContentIdeasStore } from '../stores/contentIdeas'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import { useUiStore } from '../stores/ui'
import { useProductsStore } from '../stores/products'
import { useCompanyContextStore } from '../stores/companyContext'
import type { ContentIdea, ContentIdeaStatus } from '../types/contentIdea'
import type { TableColumn } from '../types/ui'
import type { TopicDiscoveryRun } from '../types/topicDiscovery'
import type { Prospect } from '../types/prospect'
import type { IndustryIdea } from '../api/industryIdeation'

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
const deleteConfirmIdea = ref<ContentIdea | null>(null)
const deleteModalOpen = computed({ get: () => deleteConfirmIdea.value !== null, set: (v) => { if (!v) deleteConfirmIdea.value = null } })
const deleteLoading = ref(false)
const discoveryOpen = ref(false)
const discoveryLoading = ref(false)
const discoveryError = ref('')
const discoveryProduct = ref('')
const discoveryTimeframe = ref<'last_7_days' | 'last_30_days'>('last_7_days')
const discoveryFocus = ref('')
const discoveryRun = ref<TopicDiscoveryRun | null>(null)
const usingCandidateId = ref<string | null>(null)
const ideationOpen = ref(false)
const ideationLoading = ref(false)
const ideationError = ref('')
const ideationIndustry = ref('')
const customIndustry = ref('')
const ideationProspectId = ref('')
const ideationProductId = ref('')
const ideationAudience = ref('')
const ideationObjective = ref('industry_education')
const ideationGuidance = ref('')
const prospects = ref<Prospect[]>([])
const generatedIdeas = ref<IndustryIdea[]>([])
const savingIdeaIndex = ref<number | null>(null)
const ideationObjectiveOptions = [
  { value: 'brand_awareness', label: 'Brand awareness' }, { value: 'industry_education', label: 'Industry education' },
  { value: 'problem_awareness', label: 'Problem awareness' }, { value: 'product_introduction', label: 'Product/service introduction' },
  { value: 'thought_leadership', label: 'Thought leadership' }, { value: 'engagement', label: 'Engagement' },
]
const targetIndustries = computed(() => [...new Set(prospects.value.map((prospect) => prospect.industry?.trim()).filter((industry): industry is string => Boolean(industry)))].sort())
const industryOptions = computed(() => [{ value: '', label: 'General content (no industry)' }, ...targetIndustries.value.map((industry) => ({ value: industry, label: industry })), { value: '__custom__', label: 'Enter another industry…' }])
const targetProspectOptions = computed(() => [{ value: '', label: 'No prospect (optional)' }, ...prospects.value.map((prospect) => ({ value: prospect.id, label: `${prospect.name}${prospect.industry ? ` · ${prospect.industry}` : ''}` }))])
const ideationProductOptions = computed(() => [{ value: '', label: 'Company / services' }, ...products.productOptions])
const selectedIndustry = computed(() => ideationIndustry.value === '__custom__' ? customIndustry.value.trim() || null : ideationIndustry.value || null)
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
const discoveryProductOptions = computed(() => [{ value: '', label: 'Company / All products' }, ...products.productOptions])
const discoveryTimeframeOptions = [{ value: 'last_7_days', label: 'Last 7 days' }, { value: 'last_30_days', label: 'Last 30 days' }]
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
function sourceDomain(value: string) { try { return new URL(value).hostname } catch { return value } }
function ideaTargetingLabel(idea: ContentIdea) {
  if (!idea.targetIndustry && !idea.targetProspectId) return 'General content'
  const prospect = prospects.value.find((item) => item.id === idea.targetProspectId)
  if (!idea.targetIndustry) return prospect ? `Prospect context: ${prospect.name} · No industry target` : 'General content'
  return [idea.targetIndustry, prospect?.name].filter(Boolean).join(' · ')
}
function generatedTargetingLabel() {
  const prospect = prospects.value.find((item) => item.id === ideationProspectId.value)
  if (!selectedIndustry.value) return prospect ? `Prospect context: ${prospect.name} · No industry target` : 'General content'
  return [selectedIndustry.value, prospect?.name].filter(Boolean).join(' · ')
}
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
function confirmDelete(idea: ContentIdea) { deleteConfirmIdea.value = idea }
async function deleteIdea() {
  if (!deleteConfirmIdea.value || deleteLoading.value) return
  deleteLoading.value = true
  const id = deleteConfirmIdea.value.id
  deleteConfirmIdea.value = null
  if (await store.remove(id)) ui.notify('Idea deleted.', 'success')
  deleteLoading.value = false
}
function openDiscovery() { discoveryError.value = ''; discoveryOpen.value = true }
function openIdeation() { ideationError.value = ''; ideationOpen.value = true }
function discoverForIdeation() {
  discoveryProduct.value = ideationProductId.value
  discoveryFocus.value = selectedIndustry.value ? `Industry: ${selectedIndustry.value}` : ''
  ideationOpen.value = false
  openDiscovery()
}
function chooseProspect() {
  const prospect = prospects.value.find((item) => item.id === ideationProspectId.value)
  if (prospect?.industry && !ideationIndustry.value) ideationIndustry.value = targetIndustries.value.includes(prospect.industry) ? prospect.industry : '__custom__'
  if (prospect?.industry && ideationIndustry.value === '__custom__' && !customIndustry.value) customIndustry.value = prospect.industry
}
async function generateIndustryIdeas() {
  if (ideationLoading.value) return
  ideationLoading.value = true; ideationError.value = ''; generatedIdeas.value = []
  try {
    const result = await industryIdeationApi.generateIndustryIdeas({ industry: selectedIndustry.value, prospectId: ideationProspectId.value || null, productId: ideationProductId.value || null, audience: ideationAudience.value.trim() || null, objective: ideationObjective.value, guidance: ideationGuidance.value.trim() || null })
    generatedIdeas.value = result.data.ideas
  } catch (reason: unknown) { ideationError.value = errorMessage(reason, 'Content ideation could not be completed.') }
  finally { ideationLoading.value = false }
}
async function useGeneratedIdea(item: IndustryIdea, index: number, continueToContent: boolean) {
  if (savingIdeaIndex.value !== null) return
  savingIdeaIndex.value = index
  const objectiveMap: Record<string, string> = { brand_awareness: 'awareness', industry_education: 'education', problem_awareness: 'discovery', product_introduction: 'consideration', thought_leadership: 'credibility', engagement: 'engagement' }
  const idea = await store.save({ title: item.title, contextType: ideationProductId.value ? 'product' : 'company', productId: ideationProductId.value || undefined, pillar: ideationObjective.value === 'thought_leadership' ? 'thought-leadership' : ideationObjective.value === 'product_introduction' ? 'product' : 'industry', objective: objectiveMap[ideationObjective.value], targetAudience: item.targetAudience, notes: [`Angle: ${item.angle}`, `Hook: ${item.hook}`, `Talking points: ${item.talkingPoints.join('; ')}`, `Industry relevance: ${item.industryRelevance}`, `Shifd capability: ${item.capability}`, `Suggested format: ${item.format}${item.platform ? ` (${item.platform})` : ''}`, `Soft CTA: ${item.softCta}`].join('\n'), targetIndustry: selectedIndustry.value ?? undefined, targetProspectId: ideationProspectId.value || undefined, contentObjective: ideationObjective.value, evidenceReferences: item.evidence }, undefined)
  savingIdeaIndex.value = null
  if (!idea) { ideationError.value = store.error || 'The idea could not be saved.'; return }
  ui.notify('Idea saved to the M2 Ideas library.', 'success')
  if (continueToContent) createContent(idea)
  else await store.load(true)
}
async function discover() {
  if (discoveryLoading.value) return
  discoveryLoading.value = true
  discoveryError.value = ''
  try {
    const result = await topicDiscoveryApi.discoverTopics({ productId: discoveryProduct.value || null, market: 'ID', timeframe: discoveryTimeframe.value, focus: discoveryFocus.value.trim() || null })
    discoveryRun.value = result.data
  } catch (reason: unknown) {
    discoveryError.value = errorMessage(reason, 'Current topic discovery could not be completed.')
  } finally { discoveryLoading.value = false }
}
async function useCandidate(candidateId: string) {
  if (usingCandidateId.value) return
  usingCandidateId.value = candidateId
  discoveryError.value = ''
  try {
    const result = await topicDiscoveryApi.useTopicCandidate(candidateId)
    const candidate = discoveryRun.value?.candidates.find((item) => item.id === candidateId)
    if (candidate) { candidate.selectedAt = new Date().toISOString(); candidate.createdIdeaId = result.data.id }
    await store.load(true)
    ui.notify('The current topic was added as a Ready Idea.', 'success')
  } catch (reason: unknown) {
    discoveryError.value = errorMessage(reason, 'The topic could not be converted into an Idea.')
  } finally { usingCandidateId.value = null }
}

onMounted(() => { void Promise.all([store.load(), products.load(), companyContext.loadTaxonomy(), companyContext.load(), prospectsApi.listProspects(new URLSearchParams({ limit: '100', archived: 'false' })).then((result) => { prospects.value = result.data }).catch(() => undefined), topicDiscoveryApi.latestDiscovery().then((result) => { discoveryRun.value = result.data }).catch(() => undefined)]) })
</script>

<template>
  <div class="page-stack ideas-page">
    <PageHeader title="Content Ideas" description="Capture and organize ideas before turning them into marketing content." :breadcrumbs="[{ label: 'Content Studio' }, { label: 'Ideas' }]">
      <template #actions><BaseButton variant="secondary" @click="startNewContent">Create Content</BaseButton><BaseButton variant="secondary" @click="openDiscovery"><AppIcon name="search" :size="16" />Discover Current Topics</BaseButton><BaseButton variant="secondary" @click="openIdeation"><AppIcon name="idea" :size="16" />Generate Ideas</BaseButton><BaseButton @click="edit()"><AppIcon name="plus" :size="16" />Add Idea</BaseButton></template>
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
      <template #cell-idea="{ row }"><div class="idea-title"><strong>{{ row.title }}</strong><p class="idea-targeting">{{ ideaTargetingLabel(row) }}</p><p v-if="row.notes">{{ row.notes }}</p></div></template>
      <template #cell-context="{ row }"><div class="idea-cell"><strong>{{ row.contextType === 'product' ? products.nameFor(row.productId) : companyContext.companyProfile.name }}</strong><span>{{ row.contextType === 'product' ? 'Product' : 'Company' }}</span></div></template>
      <template #cell-pillar="{ row }"><div class="idea-cell"><strong>{{ label(pillarOptions, row.pillar) }}</strong><span>{{ label(ideaObjectiveOptions, row.objective) }}</span></div></template>
      <template #cell-audience="{ row }"><span class="idea-audience">{{ row.targetAudience || '—' }}</span></template>
      <template #cell-status="{ row }"><StatusBadge :tone="row.status === 'Ready' ? 'success' : row.status === 'Used' ? 'info' : 'neutral'" dot>{{ row.status }}</StatusBadge></template>
      <template #cell-updated="{ row }"><time :datetime="row.updatedAt" :title="`Created ${date(row.createdAt)}`">{{ date(row.updatedAt) }}</time></template>
      <template #cell-actions="{ row }">
        <div class="idea-actions" role="group" :aria-label="`Actions for ${row.title}`">
          <template v-if="row.status === 'Ready'"><BaseButton variant="secondary" size="compact" @click="createContent(row)">Create Content</BaseButton><BaseButton variant="ghost" size="compact" @click="edit(row)">Edit</BaseButton><BaseButton variant="ghost" size="compact" class="idea-delete-btn" @click="confirmDelete(row)">Delete</BaseButton></template>
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

    <BaseDrawer v-model="ideationOpen" title="Generate Content Ideas" description="Create practical M2 ideas with optional industry and prospect targeting." size="default">
      <form class="discovery-form" @submit.prevent="generateIndustryIdeas">
        <BaseSelect v-model="ideationIndustry" label="Target industry" :options="industryOptions" hint="Choose an industry from prospects, enter one, or keep general content." />
        <BaseInput v-if="ideationIndustry === '__custom__'" v-model="customIndustry" label="Custom industry" maxlength="120" placeholder="For example, healthcare distribution" />
        <BaseSelect v-model="ideationProspectId" label="Target prospect (optional)" :options="targetProspectOptions" hint="The prospect is only used as optional context; choosing one does not assert a problem." @update:model-value="chooseProspect" />
        <BaseSelect v-model="ideationProductId" label="Shifd Labs context" :options="ideationProductOptions" />
        <BaseSelect v-model="ideationObjective" label="Content objective" :options="ideationObjectiveOptions" required />
        <BaseInput v-model="ideationAudience" label="Target audience / decision-maker (optional)" placeholder="For example, operations leaders" />
        <BaseTextarea v-model="ideationGuidance" label="Custom guidance (optional)" :rows="2" maxlength="600" placeholder="Themes, voice, or constraints" />
        <p v-if="ideationError" class="discovery-error" role="alert">{{ ideationError }}</p>
        <div class="discovery-actions"><BaseButton variant="secondary" type="button" @click="discoverForIdeation">Find current industry topics</BaseButton><BaseButton type="submit" :loading="ideationLoading" :disabled="ideationLoading">Generate 3–5 Ideas</BaseButton></div>
      </form>
      <InlineAlert v-if="ideationLoading" title="Generating ideas">Using the selected Shifd Labs context and approved prospect research, when available…</InlineAlert>
      <EmptyState v-else-if="!generatedIdeas.length" icon="idea" title="Ready to ideate" description="Choose an optional target, then generate ideas for human review." />
      <div v-else class="discovery-results">
        <article v-for="(item, index) in generatedIdeas" :key="`${index}-${item.title}`" class="topic-card">
          <div class="topic-card__top"><span class="topic-card__position">{{ String(index + 1).padStart(2, '0') }}</span><div><h4>{{ item.title }}</h4><p>{{ item.angle }}</p><small class="idea-targeting">{{ generatedTargetingLabel() }}</small></div></div>
          <dl class="topic-card__details"><div><dt>Opening hook</dt><dd>{{ item.hook }}</dd></div><div><dt>Target audience</dt><dd>{{ item.targetAudience }}</dd></div><div><dt>Industry relevance</dt><dd>{{ item.industryRelevance }}</dd></div><div><dt>Shifd Labs capability</dt><dd>{{ item.capability }}</dd></div><div><dt>Talking points</dt><dd>{{ item.talkingPoints.join(' · ') }}</dd></div><div><dt>Suggested format</dt><dd>{{ item.format }}<template v-if="item.platform"> · {{ item.platform }}</template></dd></div><div><dt>Soft CTA</dt><dd>{{ item.softCta }}</dd></div></dl>
          <div v-if="item.evidence.some((entry) => entry.sources.length)" class="topic-card__sources"><strong>Evidence references</strong><template v-for="entry in item.evidence" :key="entry.claim"><p>{{ entry.claim }}</p><a v-for="source in entry.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a></template></div>
          <div class="idea-actions"><BaseButton variant="secondary" size="compact" :loading="savingIdeaIndex === index" :disabled="savingIdeaIndex !== null" @click="useGeneratedIdea(item, index, false)">Save Idea</BaseButton><BaseButton size="compact" :loading="savingIdeaIndex === index" :disabled="savingIdeaIndex !== null" @click="useGeneratedIdea(item, index, true)">Continue to Content</BaseButton></div>
        </article>
      </div>
      <template #footer><BaseButton variant="ghost" @click="ideationOpen = false">Close</BaseButton></template>
    </BaseDrawer>

    <BaseModal
      v-model="deleteModalOpen"
      title="Delete Idea"
      description="This action is permanent and cannot be undone."
    >
      <p>Delete &#8220;{{ deleteConfirmIdea?.title }}&#8221;?</p>
      <template #footer>
        <div class="idea-delete-modal-actions">
          <BaseButton variant="ghost" :disabled="deleteLoading" @click="deleteConfirmIdea = null">Cancel</BaseButton>
          <BaseButton variant="danger" :loading="deleteLoading" @click="deleteIdea">Delete</BaseButton>
        </div>
      </template>
    </BaseModal>

    <BaseDrawer v-model="discoveryOpen" title="Discover Current Topics" description="Search current web sources for timely topics relevant to your company and product." size="default">
      <form class="discovery-form" @submit.prevent="discover">
        <BaseSelect v-model="discoveryProduct" label="Product" :options="discoveryProductOptions" hint="Choose a product or use company context." />
        <BaseSelect v-model="discoveryTimeframe" label="Timeframe" :options="discoveryTimeframeOptions" required />
        <div class="discovery-market"><span class="discovery-label">Market</span><strong>Indonesia</strong><span>Sources are searched with Indonesia context.</span></div>
        <BaseTextarea v-model="discoveryFocus" label="Focus (optional)" :rows="3" maxlength="240" hint="Add a short business or product focus." />
        <p v-if="discoveryError" class="discovery-error" role="alert">{{ discoveryError }}</p>
        <div class="discovery-actions"><BaseButton type="submit" :loading="discoveryLoading" :disabled="discoveryLoading">Discover Topics</BaseButton></div>
      </form>

      <div v-if="discoveryRun" class="discovery-results">
        <div class="discovery-results__header"><div><h3>Current signal</h3><p>Snapshot searched {{ new Date(discoveryRun.searchedAt).toLocaleString() }} · {{ discoveryRun.timeframe === 'last_7_days' ? 'Last 7 days' : 'Last 30 days' }}</p></div><StatusBadge tone="info">{{ discoveryRun.candidates.length }} topics</StatusBadge></div>
        <EmptyState v-if="!discoveryRun.candidates.length" icon="search" title="No strong current topics were found for this context and time range." description="Change the focus or expand from 7 days to 30 days, then discover again." />
        <article v-for="candidate in discoveryRun.candidates" :key="candidate.id" class="topic-card">
          <div class="topic-card__top"><span class="topic-card__position">{{ String(candidate.position).padStart(2, '0') }}</span><div><h4>{{ candidate.title }}</h4><p>{{ candidate.summary }}</p></div></div>
          <dl class="topic-card__details"><div><dt>Why it matters now</dt><dd>{{ candidate.whyCurrent }}</dd></div><div><dt>Why it fits Shifd</dt><dd>{{ candidate.relevanceToCompany }}</dd></div><div><dt>Suggested angle</dt><dd>{{ candidate.contentAngle }}</dd></div></dl>
          <div class="topic-card__meta"><span>Objective: {{ candidate.suggestedObjective }}</span><span>Platforms: {{ candidate.suggestedPlatforms.join(' · ') }}</span></div>
          <div class="topic-card__sources"><strong>Sources</strong><a v-for="source in candidate.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}<small>{{ source.publisher || sourceDomain(source.url) }}<template v-if="source.publishedAt"> · {{ source.publishedAt }}</template></small></a></div>
          <BaseButton v-if="!candidate.createdIdeaId" variant="secondary" size="compact" :loading="usingCandidateId === candidate.id" :disabled="Boolean(usingCandidateId)" @click="useCandidate(candidate.id)">Use as Idea</BaseButton>
          <StatusBadge v-else tone="success">Added as Idea</StatusBadge>
        </article>
      </div>
      <template #footer><BaseButton variant="ghost" @click="discoveryOpen = false">Close</BaseButton></template>
    </BaseDrawer>
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
.idea-title .idea-targeting, .idea-targeting { color: var(--color-accent); font-size: 11px; font-weight: 600; margin-top: 4px; }
.idea-cell { display: grid; gap: 4px; min-width: 125px; }
.idea-cell strong { font-weight: 500; }
.idea-cell span, .idea-audience, time { color: var(--color-muted); font-size: 12px; }
.idea-actions { display: flex; flex-wrap: wrap; gap: 4px; width: 175px; }
.idea-related-hint { color: var(--color-subtle); font-size: 11px; }
.idea-delete-btn { color: var(--color-danger) !important; }
.idea-delete-btn:hover { background: color-mix(in srgb, var(--color-danger) 10%, transparent) !important; }
.idea-delete-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.discovery-form { display: grid; gap: 18px; }
.discovery-market { display: grid; gap: 4px; padding: 12px 14px; border-radius: var(--radius-control); background: var(--color-well); color: var(--color-muted); font-size: 12px; }
.discovery-market strong { color: var(--color-ink); font-size: 14px; }
.discovery-label, .topic-card dt { color: var(--color-subtle); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.discovery-actions { display: flex; justify-content: flex-end; }
.discovery-error { color: var(--color-danger); font-size: 13px; }
.discovery-results { display: grid; gap: 14px; margin-top: 26px; }
.discovery-results__header { display: flex; justify-content: space-between; gap: 12px; align-items: start; border-top: 1px solid var(--color-border); padding-top: 22px; }
.discovery-results__header h3 { font-size: 16px; font-weight: 700; }
.discovery-results__header p { color: var(--color-muted); font-size: 12px; margin-top: 4px; }
.topic-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.topic-card__top { display: flex; gap: 12px; }
.topic-card__position { color: var(--color-subtle); font-size: 12px; font-weight: 700; }
.topic-card h4 { font-size: 15px; font-weight: 700; line-height: 1.4; }
.topic-card__top p, .topic-card dd { color: var(--color-muted); font-size: 13px; line-height: 1.55; margin-top: 5px; }
.topic-card__details { display: grid; gap: 12px; }
.topic-card__details div { display: grid; gap: 3px; }
.topic-card__meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--color-muted); font-size: 12px; }
.topic-card__meta span { padding: 5px 8px; border-radius: 999px; background: var(--color-well); }
.topic-card__sources { display: grid; gap: 7px; }
.topic-card__sources > strong { font-size: 12px; }
.topic-card__sources a { display: grid; gap: 2px; color: var(--color-accent); font-size: 12px; line-height: 1.4; text-decoration: none; }
.topic-card__sources a:hover { text-decoration: underline; }
.topic-card__sources small { color: var(--color-muted); font-size: 11px; }
@media (max-width: 1200px) { .idea-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .idea-filters > :first-child { grid-column: 1 / -1; } }
@media (max-width: 520px) { .idea-filters { grid-template-columns: minmax(0, 1fr); } .idea-tabs button { padding-inline: 10px; } }
</style>
