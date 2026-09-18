<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTable from '../components/ui/BaseTable.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useCompanyContextStore } from '../stores/companyContext'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useProductsStore } from '../stores/products'
import { useUiStore } from '../stores/ui'
import type { PromptVersion } from '../types/ai'
import type { SelectOption } from '../types/ui'

const router = useRouter()
const ai = useAiSettingsStore()
const company = useCompanyContextStore()
const contentLibrary = useContentLibraryStore()
const products = useProductsStore()
const ui = useUiStore()
const draft = reactive({ generationLanguage: ai.settings.generationLanguage })
const promptDetailsOpen = ref(false)
const selectedPrompt = ref<PromptVersion>()

const languageOptions: SelectOption[] = [{ value: 'English', label: 'English' }, { value: 'Indonesian', label: 'Indonesian' }]
const promptColumns = [
  { key: 'operation', label: 'Operation' }, { key: 'version', label: 'Version' }, { key: 'status', label: 'Status' }, { key: 'updatedAt', label: 'Last Updated' }, { key: 'actions', label: '' },
]
const requestColumns = [
  { key: 'operation', label: 'Operation' }, { key: 'content', label: 'Content' }, { key: 'model', label: 'Model' }, { key: 'tokens', label: 'Tokens' }, { key: 'cost', label: 'Estimated Cost' }, { key: 'status', label: 'Status' }, { key: 'createdAt', label: 'Timestamp' },
]
const operations = [
  { module: 'M2', name: 'Content Generation', description: 'Generates the master marketing content and visual direction using the selected company or product context.' },
  { module: 'M3', name: 'Platform Adaptation', description: 'Adapts approved master content for Instagram and LinkedIn.' },
  { module: 'M4', name: 'Brand Consistency Check', description: 'Assesses platform content against the selected business and brand context before human approval.' },
]
const dirty = computed(() => draft.generationLanguage !== ai.settings.generationLanguage)
const activeProduct = computed(() => products.products.find((product) => product.status === 'Active'))
const totalRequests = computed(() => ai.usage?.requests ?? ai.requestLogs.length)
const inputTokens = computed(() => ai.usage?.inputTokens ?? ai.requestLogs.reduce((sum, item) => sum + item.inputTokens, 0))
const outputTokens = computed(() => ai.usage?.outputTokens ?? ai.requestLogs.reduce((sum, item) => sum + item.outputTokens, 0))
const estimatedCost = computed(() => ai.usage?.estimatedCostUsd === null ? null : ai.usage ? Number(ai.usage.estimatedCostUsd) : ai.requestLogs.reduce((sum, item) => sum + item.estimatedCostUsd, 0))

async function saveChanges() {
  if (await ai.saveSettings({ ...ai.settings, generationLanguage: draft.generationLanguage as 'English' | 'Indonesian' })) ui.notify('Changes saved', 'success')
}
function viewPrompt(prompt: PromptVersion) { selectedPrompt.value = prompt; promptDetailsOpen.value = true }
function contentTitle(contentId?: string) {
  if (!contentId) return 'No linked content'
  return contentLibrary.records.find((record) => record.id === contentId)?.title ?? 'Content unavailable'
}
function formatCost(value: number | null) { return value === null ? '—' : `$${value.toFixed(2)}` }
watch(() => ai.settings.generationLanguage, (value) => { draft.generationLanguage = value })
onMounted(() => { void Promise.all([ai.load(), company.load(), contentLibrary.load(), products.load()]) })
</script>

<template>
  <div class="page-stack ai-system-page">
    <PageHeader title="AI &amp; System" description="Review AI configuration, prompt versions, and system usage." :breadcrumbs="[{ label: 'System' }, { label: 'AI & System' }]">
      <template #actions><BaseButton :disabled="!dirty" @click="saveChanges">Save Changes</BaseButton></template>
    </PageHeader>
    <InlineAlert v-if="ai.loading" title="Loading AI system status">Reading safe backend configuration and request history…</InlineAlert>
    <InlineAlert v-else-if="ai.error" title="AI system status unavailable" tone="danger">{{ ai.error }}</InlineAlert>

    <template v-if="ai.loaded">
    <section class="ai-notice"><AppIcon name="info" :size="17" /><span>AI-generated content and brand assessments require human review before final approval.</span></section>

    <section class="ai-top-grid">
      <BaseCard title="AI Configuration" description="Safe provider metadata returned by the backend."><dl class="ai-details"><div><dt>Provider</dt><dd>{{ ai.settings.provider || '—' }}</dd></div><div><dt>Model</dt><dd>{{ ai.settings.model || '—' }}</dd></div><div><dt>Status</dt><dd><StatusBadge :tone="ai.settings.status === 'configured' ? 'success' : 'warning'" dot>{{ ai.settings.status === 'configured' ? 'Configured' : 'Not configured' }}</StatusBadge></dd></div></dl><BaseSelect v-model="draft.generationLanguage" label="Generation Language" :options="languageOptions" hint="Applied to future backend generation requests." /></BaseCard>
      <BaseCard title="System Status" description="Readiness indicators supplied by the backend."><div class="system-status-list"><div><span>AI Configuration</span><StatusBadge :tone="ai.settings.systemStatus?.aiConfiguration === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.aiConfiguration ?? 'Unknown' }}</StatusBadge></div><div><span>Context Engine</span><StatusBadge :tone="ai.settings.systemStatus?.contextEngine === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.contextEngine ?? 'Unknown' }}</StatusBadge></div><div><span>Prompt Configuration</span><StatusBadge :tone="ai.settings.systemStatus?.promptConfiguration === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.promptConfiguration ?? 'Unknown' }}</StatusBadge></div></div></BaseCard>
    </section>

    <BaseCard title="Supported AI Operations" description="Only the approved thesis workflow modules use AI assistance."><div class="operation-list"><article v-for="operation in operations" :key="operation.module" class="operation-row"><div class="operation-row__icon"><AppIcon name="sparkles" :size="18" /></div><div class="operation-row__copy"><div><strong>{{ operation.name }}</strong><span>Module {{ operation.module }}</span></div><p>{{ operation.description }}</p><small v-if="operation.module === 'M4'">Assessment is advisory; final approval remains a human decision.</small></div><StatusBadge tone="success" dot>Enabled</StatusBadge></article></div></BaseCard>

    <BaseCard title="AI Context" description="Operations resolve context through the Multi-Context Profile Engine selected in the content brief."><div class="context-summary"><div><span>Company Context</span><strong>{{ company.companyProfile.name }}</strong><small>Organization-level business and brand context</small></div><div><span>Product Context</span><strong>{{ activeProduct?.name ?? 'Selected product when applicable' }}</strong><small>{{ activeProduct ? 'Product-specific context is added when a product brief is selected.' : 'Choose a product in the Brief to add product context.' }}</small></div></div><div class="context-actions"><BaseButton variant="secondary" size="compact" @click="router.push('/context/company')">Manage Company Context <AppIcon name="arrow-right" :size="14" /></BaseButton><BaseButton variant="ghost" size="compact" @click="router.push('/context/products')">Manage Products <AppIcon name="arrow-right" :size="14" /></BaseButton></div></BaseCard>

    <BaseCard title="Prompt Versions" description="Prompt versions help keep AI-assisted content generation consistent and traceable."><BaseTable caption="Prompt versions" :columns="promptColumns" :rows="ai.promptVersions"><template #cell-operation="{ row }"><strong>{{ row.operation }}</strong><small class="table-subtext">{{ row.module }}</small></template><template #cell-status="{ row }"><StatusBadge tone="success">{{ row.status }}</StatusBadge></template><template #cell-actions="{ row }"><BaseButton variant="ghost" size="compact" @click="viewPrompt(row)">View Details</BaseButton></template></BaseTable></BaseCard>

    <BaseCard title="AI Usage" description="Backend request usage for transparency; this is not production billing."><div class="usage-grid"><div><span>Requests</span><strong>{{ totalRequests }}</strong></div><div><span>Input Tokens</span><strong>{{ inputTokens.toLocaleString() }}</strong></div><div><span>Output Tokens</span><strong>{{ outputTokens.toLocaleString() }}</strong></div><div><span>Estimated Cost</span><strong>{{ formatCost(estimatedCost) }}</strong></div></div></BaseCard>

    <BaseCard title="Recent AI Requests" description="Backend request records retained for workflow traceability."><BaseTable caption="Recent AI requests" :columns="requestColumns" :rows="ai.requestLogs"><template #cell-operation="{ row }"><strong>{{ row.operation }}</strong><small class="table-subtext">{{ row.module }} · {{ row.promptVersion }}</small></template><template #cell-content="{ row }">{{ contentTitle(row.contentId) }}</template><template #cell-tokens="{ row }">{{ row.inputTokens.toLocaleString() }} / {{ row.outputTokens.toLocaleString() }}</template><template #cell-cost="{ row }">{{ formatCost(row.estimatedCostUsd) }}</template><template #cell-status="{ row }"><StatusBadge :tone="row.status === 'Success' ? 'success' : 'warning'">{{ row.status }}</StatusBadge></template></BaseTable></BaseCard>

    <BaseModal v-model="promptDetailsOpen" title="Prompt Version Details" :description="selectedPrompt?.operation"><dl v-if="selectedPrompt" class="ai-details"><div><dt>Operation</dt><dd>{{ selectedPrompt.operation }}</dd></div><div><dt>Module</dt><dd>{{ selectedPrompt.module }}</dd></div><div><dt>Version</dt><dd>{{ selectedPrompt.version }}</dd></div><div><dt>Status</dt><dd>{{ selectedPrompt.status }}</dd></div><div><dt>Updated At</dt><dd>{{ selectedPrompt.updatedAt }}</dd></div></dl></BaseModal>
    </template>
  </div>
</template>

<style scoped>
.ai-system-page { max-width: 1180px; }
.ai-notice { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-well); color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.ai-notice .app-icon { flex: 0 0 auto; color: var(--color-primary); }
.ai-top-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.ai-details { display: grid; gap: 1px; margin: 0 0 18px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.ai-details div { display: grid; grid-template-columns: minmax(110px, .7fr) minmax(0, 1.3fr); gap: 12px; padding: 11px 12px; background: var(--color-surface); font-size: 12px; line-height: 1.4; }
.ai-details dt { color: var(--color-subtle); }
.ai-details dd { margin: 0; color: var(--color-ink); font-weight: 500; }
.system-status-list { display: grid; gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.system-status-list div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; background: var(--color-surface); font-size: 13px; }
.operation-list { display: grid; gap: 10px; }
.operation-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 13px; border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.operation-row__icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; background: var(--color-well); color: var(--color-primary); }
.operation-row__copy > div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.operation-row__copy strong { font-size: 14px; }
.operation-row__copy span, .operation-row__copy small { color: var(--color-subtle); font-size: 11px; }
.operation-row__copy p { margin: 5px 0 0; color: var(--color-muted); font-size: 12px; line-height: 1.45; }
.operation-row__copy small { display: block; margin-top: 5px; color: var(--color-primary); }
.context-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.context-summary > div { display: grid; gap: 5px; padding: 14px; background: var(--color-surface); }
.context-summary span { color: var(--color-subtle); font-size: 11px; }
.context-summary strong { font-size: 15px; }
.context-summary small { color: var(--color-muted); font-size: 11px; line-height: 1.4; }
.context-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.table-subtext { display: block; margin-top: 3px; color: var(--color-subtle); font-size: 11px; }
.usage-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-border); }
.usage-grid div { display: grid; gap: 6px; padding: 15px; background: var(--color-surface); }
.usage-grid span { color: var(--color-subtle); font-size: 11px; }
.usage-grid strong { font-size: 22px; }
@media (max-width: 760px) { .ai-top-grid, .context-summary { grid-template-columns: 1fr; } .usage-grid { grid-template-columns: repeat(2, 1fr); } .operation-row { grid-template-columns: 38px minmax(0, 1fr); } .operation-row > .ui-badge { grid-column: 2; justify-self: start; } }
@media (max-width: 480px) { .usage-grid { grid-template-columns: 1fr; } }
</style>
