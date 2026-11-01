<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
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
import type { AiRequestLog, PromptVersion } from '../types/ai'
import type { SelectOption } from '../types/ui'

const router = useRouter()
const ai = useAiSettingsStore()
const company = useCompanyContextStore()
const contentLibrary = useContentLibraryStore()
const products = useProductsStore()
const ui = useUiStore()
const draft = reactive({ generationLanguage: ai.settings.generationLanguage, weeklyContentTarget: ai.settings.weeklyContentTarget })
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
const brandCheckInputs = [
  'Company atau Product Context yang dipilih',
  'Brand Profile dan resolved brand voice',
  'Brief: objective, audience, topic, angle, dan instruksi',
  'Master Content dan Visual Direction',
  'Copy, CTA, hashtag, serta rekomendasi visual per platform',
  'Maksimal tiga aset visual efektif pertama per platform',
]
const brandCheckDimensions = [
  { label: 'Tone / Brand Voice', criterion: 'Mencocokkan karakter, formalitas, istilah, dan gaya komunikasi dengan profil Brand.', warningWhen: 'Warning jika copy jelas bertentangan dengan brand voice, preferred terms, atau hal yang harus dihindari.' },
  { label: 'Messaging Alignment', criterion: 'Membandingkan pesan platform dengan core message, hook, body, CTA, dan Visual Direction pada Master Content.', warningWhen: 'Warning jika adaptasi mengubah pesan utama, manfaat, atau arah visual secara material.' },
  { label: 'Audience Fit', criterion: 'Menilai apakah bahasa, masalah, tingkat detail, dan manfaat relevan bagi target audience pada brief.', warningWhen: 'Warning jika copy diarahkan ke audiens berbeda atau tidak menjawab kebutuhan audiens terpilih.' },
  { label: 'Claim Grounding', criterion: 'Memeriksa apakah klaim faktual didukung Company atau Product Context yang tersedia.', warningWhen: 'Warning untuk klaim pelanggan, sertifikasi, relasi pemerintah, jaminan keamanan, statistik performa, ROI, pendapatan, pangsa pasar, atau hasil terukur yang tidak didukung.' },
  { label: 'CTA Alignment', criterion: 'Mencocokkan ajakan bertindak dengan objective, pesan, dan tindakan yang memang relevan.', warningWhen: 'Warning jika CTA terlalu jauh dari objective, bertentangan dengan pesan, atau menjanjikan tindakan yang tidak didukung.' },
  { label: 'Company/Product Context Alignment', criterion: 'Memeriksa nama, kemampuan, positioning, manfaat, dan referensi perusahaan atau produk.', warningWhen: 'Warning jika informasi salah atau tercampur. Pada konteks general, referensi perusahaan atau produk tidak diwajibkan.' },
  { label: 'Platform Appropriateness', criterion: 'Menilai struktur dan gaya copy untuk Instagram atau LinkedIn secara terpisah.', warningWhen: 'Warning jika format, panjang, struktur, tone, CTA, atau hashtag jelas tidak sesuai platform tujuan.' },
  { label: 'Visual Creative Review', criterion: 'Jika gambar dapat dianalisis, memeriksa relevansi pesan, hierarki, keterbacaan, serta masalah brand atau layout.', warningWhen: 'Warning jika visual tidak mendukung pesan atau mempunyai masalah keterbacaan/brand yang material. Aset yang gagal dianalisis menjadi Not assessed dan tidak mengurangi skor.' },
]
const brandCheckScoreExamples = [
  { warnings: 0, score: 100, status: 'Aligned' },
  { warnings: 1, score: 88, status: 'Aligned, kecuali warning Claim Grounding' },
  { warnings: 2, score: 76, status: 'Needs Attention' },
  { warnings: 3, score: 64, status: 'Needs Attention' },
  { warnings: 8, score: 4, status: 'Needs Attention' },
]
const dirty = computed(() => draft.generationLanguage !== ai.settings.generationLanguage || draft.weeklyContentTarget !== ai.settings.weeklyContentTarget)
const activeProduct = computed(() => products.products.find((product) => product.status === 'Active'))
const totalRequests = computed(() => ai.usage?.requests ?? ai.requestLogs.length)
const inputTokens = computed(() => ai.usage?.inputTokens ?? ai.requestLogs.reduce((sum, item) => sum + item.inputTokens, 0))
const outputTokens = computed(() => ai.usage?.outputTokens ?? ai.requestLogs.reduce((sum, item) => sum + item.outputTokens, 0))
const estimatedCost = computed(() => {
  if (ai.usage) return ai.usage.estimatedCostUsd === null ? null : Number(ai.usage.estimatedCostUsd)
  const knownCosts = ai.requestLogs.flatMap((item) => item.estimatedCostUsd === null ? [] : [item.estimatedCostUsd])
  return knownCosts.length ? knownCosts.reduce((sum, cost) => sum + cost, 0) : null
})
const unknownCostRequests = computed(() => ai.usage?.unknownCostRequests ?? ai.requestLogs.filter((item) => item.estimatedCostUsd === null).length)

async function saveChanges() {
  if (await ai.saveSettings({ ...ai.settings, generationLanguage: draft.generationLanguage as 'English' | 'Indonesian', weeklyContentTarget: Number(draft.weeklyContentTarget) })) ui.notify('Changes saved', 'success')
}
function viewPrompt(prompt: PromptVersion) { selectedPrompt.value = prompt; promptDetailsOpen.value = true }
function contentTitle(contentId?: string) {
  if (!contentId) return 'No linked content'
  return contentLibrary.records.find((record) => record.id === contentId)?.title ?? 'Content unavailable'
}
function formatCost(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `$${value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`
}
function requestCost(request: AiRequestLog) {
  if (request.estimatedCostUsd !== null) return request.estimatedCostUsd
  const model = request.model.trim().toLowerCase().replace(/[\s_]+/g, '-')
  const createdAt = Date.parse(request.createdAt)
  const supportedModel = model === 'gpt-5.6-luna'
  if (request.status !== 'Success' || request.provider.toLowerCase() !== 'openai' || !supportedModel || !Number.isFinite(createdAt) || createdAt < Date.UTC(2026, 6, 30) || request.inputTokens <= 0 || request.outputTokens <= 0) return null

  // Fallback for request records without a persisted estimate. This mirrors
  // the verified, uncached-input rate recorded by the backend migration.
  return Number(((request.inputTokens * 0.2 + request.outputTokens * 1.2) / 1_000_000).toFixed(8))
}
function requestCostTitle(request: AiRequestLog) {
  if (request.estimatedCostUsd !== null) return undefined
  return requestCost(request) === null
    ? 'No verified rate or token usage is available for this request.'
    : 'Fallback estimate using GPT-5.6 Luna rates with uncached input tokens.'
}
watch(() => ai.settings.generationLanguage, (value) => { draft.generationLanguage = value })
watch(() => ai.settings.weeklyContentTarget, (value) => { draft.weeklyContentTarget = value })
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
    <section class="ai-notice"><AppIcon name="info" :size="17" /><span v-if="ai.settings.mode === 'demo'">Development mock is active. Responses are deterministic fixtures; live web search, image generation, and model evaluation are not performed. No OpenAI API tokens are used.</span><span v-else>AI-generated content and brand assessments require human review before final approval.</span></section>

    <section class="ai-top-grid">
      <BaseCard title="AI Configuration" description="The provider and model currently selected by the backend environment."><dl class="ai-details"><div><dt>Provider</dt><dd>{{ ai.settings.provider || '—' }}</dd></div><div><dt>Model</dt><dd>{{ ai.settings.model || '—' }}</dd></div><div><dt>Mode</dt><dd>{{ ai.settings.mode === 'demo' ? 'Development mock (no external API calls)' : 'Live API' }}</dd></div><div><dt>Status</dt><dd><StatusBadge :tone="ai.settings.status === 'configured' ? 'success' : 'warning'" dot>{{ ai.settings.status === 'configured' ? 'Configured' : 'Not configured' }}</StatusBadge></dd></div></dl><BaseSelect v-model="draft.generationLanguage" label="Generation Language" :options="languageOptions" hint="Applied to future backend generation requests." /></BaseCard>
      <BaseCard title="System Status" description="Readiness indicators supplied by the backend."><div class="system-status-list"><div><span>AI Configuration</span><StatusBadge :tone="ai.settings.systemStatus?.aiConfiguration === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.aiConfiguration ?? 'Unknown' }}</StatusBadge></div><div><span>Context Engine</span><StatusBadge :tone="ai.settings.systemStatus?.contextEngine === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.contextEngine ?? 'Unknown' }}</StatusBadge></div><div><span>Prompt Configuration</span><StatusBadge :tone="ai.settings.systemStatus?.promptConfiguration === 'configured' ? 'success' : 'warning'">{{ ai.settings.systemStatus?.promptConfiguration ?? 'Unknown' }}</StatusBadge></div></div></BaseCard>
    </section>

    <BaseCard title="Content Creation Consistency" description="Set the base number of content items to create each week."><template #actions><BaseButton :disabled="!dirty" @click="saveChanges">Save Changes</BaseButton></template><BaseInput v-model.number="draft.weeklyContentTarget" label="Base weekly content target" type="number" min="1" max="100" step="1" hint="Scheduled and published content items count toward this target." /></BaseCard>

    <BaseCard title="Supported AI Operations" description="Only the approved thesis workflow modules use AI assistance."><div class="operation-list"><article v-for="operation in operations" :key="operation.module" class="operation-row"><div class="operation-row__icon"><AppIcon name="sparkles" :size="18" /></div><div class="operation-row__copy"><div><strong>{{ operation.name }}</strong><span>Module {{ operation.module }}</span></div><p>{{ operation.description }}</p><small v-if="operation.module === 'M4'">Assessment is advisory; final approval remains a human decision.</small></div><StatusBadge tone="success" dot>Enabled</StatusBadge></article></div></BaseCard>

    <BaseCard title="Brand Consistency Check (Guidance)" description="Panduan teknis M4 untuk memahami input, faktor penilaian, perhitungan skor, error, dan keputusan override.">
      <div class="brand-check-overview-grid">
        <section>
          <span class="brand-check-kicker">Input yang dibandingkan</span>
          <ul><li v-for="input in brandCheckInputs" :key="input">{{ input }}</li></ul>
        </section>
        <section>
          <span class="brand-check-kicker">Cara kerja</span>
          <ol>
            <li>Instagram dan LinkedIn dinilai terpisah dari copy terakhir yang sudah disimpan.</li>
            <li>AI mengembalikan Pass atau Warning untuk dimensi yang relevan.</li>
            <li>Backend melengkapi check wajib yang hilang sebagai Warning, lalu menghitung ulang skor dan status secara deterministik.</li>
            <li>Hasil per platform menjadi evidence advisory. Persetujuan akhir tetap keputusan manusia.</li>
          </ol>
        </section>
      </div>

      <div class="brand-check-section-heading">
        <div><span class="brand-check-kicker">Faktor penilaian</span><h3>Delapan dimensi yang dapat memengaruhi skor</h3></div>
        <StatusBadge tone="info">7 wajib + 1 visual kondisional</StatusBadge>
      </div>
      <div class="brand-check-list">
        <article v-for="dimension in brandCheckDimensions" :key="dimension.label" class="brand-check-row">
          <strong>{{ dimension.label }}</strong>
          <p>{{ dimension.criterion }}</p>
          <small>{{ dimension.warningWhen }}</small>
        </article>
      </div>

      <section class="brand-score-guide">
        <div class="brand-score-formula">
          <span class="brand-check-kicker">Formula backend</span>
          <code>score = max(0, 100 - (12 × jumlah Warning))</code>
          <p>Semua Warning mengurangi 12 poin dengan bobot yang sama. Status <strong>Not assessed</strong> tidak dihitung sebagai Warning. Skor sementara dari model tidak dipakai sebagai skor akhir.</p>
        </div>
        <div class="brand-score-examples" aria-label="Contoh perhitungan skor Brand Check">
          <div class="brand-score-example brand-score-example--heading"><span>Warning</span><span>Skor</span><span>Status</span></div>
          <div v-for="example in brandCheckScoreExamples" :key="example.warnings" class="brand-score-example">
            <span>{{ example.warnings }}</span><strong>{{ example.score }}/100</strong><span>{{ example.status }}</span>
          </div>
        </div>
      </section>

      <div class="brand-check-rules">
        <div><strong>Mengapa skor tersebut diberikan?</strong><p>Alasan kuantitatif berasal dari jumlah dan nama dimensi berstatus Warning. Di kartu hasil Review, sistem menampilkan rumus pengurangan, daftar faktor Warning, dan rekomendasi AI sebagai penjelasan kualitatif.</p></div>
        <div><strong>Aturan status</strong><p>Satu Warning non-Claim menghasilkan skor 88 tetapi masih Aligned. Claim Grounding yang Warning, atau sedikitnya dua Warning apa pun, menghasilkan Needs Attention. Skor bukan ambang approval otomatis.</p></div>
        <div><strong>Visual dan batas pemeriksaan</strong><p>M4 menganalisis maksimal tiga aset efektif pertama. Tanpa aset, dimensi visual dihilangkan. Jika satu atau lebih aset terpilih gagal dianalisis, hasil visual menjadi Not assessed tanpa pengurangan skor dan human visual review tetap wajib.</p></div>
        <div><strong>Error dan Override</strong><p>Request yang gagal tidak diberi skor buatan. UI menampilkan kode error, input yang kurang, serta referensi request bila tersedia. Pengguna dapat retry atau melakukan Override pada kegagalan AI yang tercatat maupun hasil Needs Attention. Justifikasi wajib, berlaku per platform dan input saat itu, tercatat dalam review history, serta tidak mengubah skor atau otomatis menyetujui konten.</p></div>
      </div>
    </BaseCard>

    <BaseCard title="AI Context" description="Operations resolve context through the Multi-Context Profile Engine selected in the content brief."><div class="context-summary"><div><span>Company Context</span><strong>{{ company.companyProfile.name }}</strong><small>Organization-level business and brand context</small></div><div><span>Product Context</span><strong>{{ activeProduct?.name ?? 'Selected product when applicable' }}</strong><small>{{ activeProduct ? 'Product-specific context is added when a product brief is selected.' : 'Choose a product in the Brief to add product context.' }}</small></div></div><div class="context-actions"><BaseButton variant="secondary" size="compact" @click="router.push('/context/company')">Manage Company Context <AppIcon name="arrow-right" :size="14" /></BaseButton><BaseButton variant="ghost" size="compact" @click="router.push('/context/products')">Manage Products <AppIcon name="arrow-right" :size="14" /></BaseButton></div></BaseCard>

    <BaseCard title="Prompt Versions" description="Prompt versions help keep AI-assisted content generation consistent and traceable."><BaseTable caption="Prompt versions" :columns="promptColumns" :rows="ai.promptVersions"><template #cell-operation="{ row }"><strong>{{ row.operation }}</strong><small class="table-subtext">{{ row.module }}</small></template><template #cell-status="{ row }"><StatusBadge tone="success">{{ row.status }}</StatusBadge></template><template #cell-actions="{ row }"><BaseButton variant="ghost" size="compact" @click="viewPrompt(row)">View Details</BaseButton></template></BaseTable></BaseCard>

    <BaseCard title="AI Usage" description="Token-based estimate from verified model rates. Cache-write charges and other provider billing adjustments are not included."><div class="usage-grid"><div><span>Requests</span><strong>{{ totalRequests }}</strong></div><div><span>Input Tokens</span><strong>{{ inputTokens.toLocaleString() }}</strong></div><div><span>Output Tokens</span><strong>{{ outputTokens.toLocaleString() }}</strong></div><div><span>Estimated Cost (USD)</span><strong>{{ formatCost(estimatedCost) }}</strong></div></div><p v-if="unknownCostRequests" class="usage-cost-note">Cost is unavailable for {{ unknownCostRequests }} request{{ unknownCostRequests === 1 ? '' : 's' }} because a verified rate or token usage is missing.</p></BaseCard>

    <BaseCard title="Recent AI Requests" description="Backend request records retained for workflow traceability."><BaseTable caption="Recent AI requests" :columns="requestColumns" :rows="ai.requestLogs"><template #cell-operation="{ row }"><strong>{{ row.operation }}</strong><small class="table-subtext">{{ row.module }} · {{ row.promptVersion }}</small></template><template #cell-content="{ row }">{{ contentTitle(row.contentId) }}</template><template #cell-tokens="{ row }">{{ row.inputTokens.toLocaleString() }} / {{ row.outputTokens.toLocaleString() }}</template><template #cell-cost="{ row }"><span :title="requestCostTitle(row)">{{ formatCost(requestCost(row)) }}</span></template><template #cell-status="{ row }"><StatusBadge :tone="row.status === 'Success' ? 'success' : 'warning'">{{ row.status }}</StatusBadge></template></BaseTable></BaseCard>

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
.brand-check-overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.brand-check-overview-grid section { padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); }
.brand-check-overview-grid ul, .brand-check-overview-grid ol { display: grid; gap: 6px; margin: 9px 0 0; padding-left: 18px; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.brand-check-kicker { color: var(--color-primary); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.brand-check-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
.brand-check-section-heading h3 { margin: 4px 0 0; color: var(--color-ink); font-size: 15px; line-height: 1.4; }
.brand-check-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.brand-check-row { padding: 13px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); }
.brand-check-row strong, .brand-check-rules strong { color: var(--color-ink); font-size: 13px; }
.brand-check-row p, .brand-check-rules p { margin: 5px 0 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.brand-check-row small { display: block; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-border); color: var(--color-subtle); font-size: 11px; line-height: 1.5; }
.brand-score-guide { display: grid; grid-template-columns: minmax(0, .9fr) minmax(360px, 1.1fr); gap: 12px; margin-top: 14px; }
.brand-score-formula, .brand-score-examples { padding: 14px; border: 1px solid #cfdcff; border-radius: var(--radius-control); background: #f5f8ff; }
.brand-score-formula code { display: block; margin: 10px 0; padding: 10px; border-radius: 6px; background: #17233b; color: #eef4ff; font-family: var(--font-mono); font-size: 13px; overflow-wrap: anywhere; }
.brand-score-formula p { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.brand-score-example { display: grid; grid-template-columns: .45fr .55fr minmax(0, 1.6fr); gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #dce5fb; color: var(--color-muted); font-size: 11px; }
.brand-score-example:last-child { border-bottom: 0; }
.brand-score-example strong { color: var(--color-ink); font-variant-numeric: tabular-nums; }
.brand-score-example--heading { padding-top: 0; color: var(--color-subtle); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.brand-check-rules { display: grid; gap: 10px; margin-top: 14px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); }
@media (max-width: 760px) { .brand-check-list, .brand-check-overview-grid, .brand-score-guide { grid-template-columns: 1fr; } .brand-check-section-heading { align-items: flex-start; flex-direction: column; } }
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
.usage-cost-note { margin: 12px 0 0; color: var(--color-subtle); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .ai-top-grid, .context-summary { grid-template-columns: 1fr; } .usage-grid { grid-template-columns: repeat(2, 1fr); } .operation-row { grid-template-columns: 38px minmax(0, 1fr); } .operation-row > .ui-badge { grid-column: 2; justify-self: start; } }
@media (max-width: 480px) { .usage-grid { grid-template-columns: 1fr; } }
</style>
