<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import PageHeader from '../components/app/PageHeader.vue'
import ContextListEditor from '../components/context/ContextListEditor.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import AccessibleTabs from '../components/ui/AccessibleTabs.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useCompanyContextStore } from '../stores/companyContext'
import type { CompanyBusinessType } from '../types/companyContext'

const store = useCompanyContextStore()
const initial = store.snapshot()
const draft = reactive(initial)
const tab = ref<'profile' | 'bmc' | 'brand'>('profile')
const savedAt = ref<string | null>(null)
const requiredErrors = ref<string[]>([])
const tabs = [
  { id: 'profile' as const, label: 'Company Profile' },
  { id: 'bmc' as const, label: 'Business Model Canvas' },
  { id: 'brand' as const, label: 'Brand' },
]
const isDirty = computed(() => JSON.stringify(draft) !== JSON.stringify(store.snapshot()))
const profileComplete = computed(() => Boolean(draft.companyProfile.name.trim() && draft.companyProfile.description.trim()))
const bmcComplete = computed(() => draft.bmcBlocks.every((block) => block.entries.some((entry) => entry.trim())))
const brandComplete = computed(() => Boolean(draft.brandProfile.brandVoice.trim() && draft.brandProfile.toneDescription.trim() && draft.brandProfile.preferredLanguage.trim()))
const completionItems = computed(() => [
  { label: 'Company Profile', complete: profileComplete.value },
  { label: 'BMC', complete: bmcComplete.value },
  { label: 'Brand', complete: brandComplete.value },
])

function toggleBusinessType(type: CompanyBusinessType) {
  const types = draft.companyProfile.businessTypes
  draft.companyProfile.businessTypes = types.includes(type) ? types.filter((item) => item !== type) : [...types, type]
}
async function save() {
  const errors: string[] = []
  if (!draft.companyProfile.name.trim()) errors.push('Company Name')
  if (!draft.companyProfile.description.trim()) errors.push('Company Description')
  requiredErrors.value = errors
  if (errors.length) { tab.value = 'profile'; return }
  const saved = await store.save(draft)
  if (!saved) return
  savedAt.value = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())
}
function errorFor(label: string) { return requiredErrors.value.includes(label) ? `Enter ${label.toLowerCase()}.` : undefined }

watch(() => store.loaded, (loaded) => { if (loaded) Object.assign(draft, store.snapshot()) }, { immediate: true })
onMounted(() => { void store.load() })
</script>

<template>
  <div class="page-stack company-context-page">
    <PageHeader title="Company Context" description="Define the business, customer, and brand context used throughout Shifd Marketing." :breadcrumbs="[{ label: 'Context Engine' }, { label: 'Company Context' }]">
      <template #actions><span v-if="savedAt && !isDirty" class="context-saved"><AppIcon name="check" :size="15" />Saved {{ savedAt }}</span><BaseButton :disabled="!isDirty" @click="save">Save Changes</BaseButton></template>
    </PageHeader>

    <InlineAlert v-if="store.loading" title="Loading company context">Loading the canonical company, brand, and BMC context…</InlineAlert>
    <InlineAlert v-if="store.error" title="Company context unavailable" tone="danger">{{ store.error }}</InlineAlert>

    <template v-if="store.loaded">
    <section class="context-completeness" aria-label="Context completeness">
      <div><span class="context-completeness__eyebrow">Context completeness</span><strong>{{ completionItems.filter((item) => item.complete).length }} of {{ completionItems.length }} sections complete</strong></div>
      <div class="context-completeness__items"><span v-for="item in completionItems" :key="item.label" :class="{ 'is-complete': item.complete }"><AppIcon :name="item.complete ? 'check' : 'circle'" :size="14" />{{ item.label }}</span></div>
    </section>

    <AccessibleTabs v-model="tab" :items="tabs" label="Company context sections" id-prefix="context-tab" panel-prefix="context-panel" variant="context" />

    <div v-if="tab === 'profile'" id="context-panel-profile" class="context-stack" role="tabpanel" aria-labelledby="context-tab-profile" tabindex="0">
      <BaseCard title="Basic Information" description="Organization-level information inherited by future product contexts.">
        <div class="context-form-grid">
          <BaseInput v-model="draft.companyProfile.name" label="Company Name" required :error="errorFor('Company Name')" />
          <BaseInput v-model="draft.companyProfile.industry" label="Industry" />
          <BaseTextarea v-model="draft.companyProfile.description" label="Company Description" :rows="3" required :error="errorFor('Company Description')" />
          <div class="ui-field"><span class="ui-field__label">Business Type</span><div class="context-choice-group"><label v-for="type in (['B2B', 'B2G'] as CompanyBusinessType[])" :key="type" class="context-choice"><input type="checkbox" :checked="draft.companyProfile.businessTypes.includes(type)" @change="toggleBusinessType(type)" />{{ type }}</label></div></div>
          <BaseInput v-model="draft.companyProfile.primaryMarket" label="Primary Market" />
          <BaseInput v-model="draft.companyProfile.website" label="Website" type="url" />
          <BaseTextarea v-model="draft.companyProfile.mission" label="Mission" :rows="3" />
          <BaseTextarea v-model="draft.companyProfile.vision" label="Vision" :rows="3" />
        </div>
      </BaseCard>
      <BaseCard title="Positioning" description="Describe how Shifd Labs should be understood in plain, practical language.">
        <div class="context-form-grid"><BaseTextarea v-model="draft.companyProfile.positioning" label="Positioning" :rows="3" /><BaseTextarea v-model="draft.companyProfile.coreValueProposition" label="Core Value Proposition" :rows="3" /></div>
        <ContextListEditor v-model="draft.companyProfile.differentiators" label="Differentiators" hint="Add the qualities that make your approach distinct." />
      </BaseCard>
      <BaseCard title="Customer Context" description="Editable working context for the teams and people your marketing serves.">
        <div class="context-list-grid"><ContextListEditor v-model="draft.companyProfile.customerSegments" label="Customer Segments" /><ContextListEditor v-model="draft.companyProfile.decisionMakers" label="Decision Makers" /><ContextListEditor v-model="draft.companyProfile.painPoints" label="Customer Pain Points" /></div>
      </BaseCard>
    </div>

    <div v-else-if="tab === 'bmc'" id="context-panel-bmc" class="context-stack" role="tabpanel" aria-labelledby="context-tab-bmc" tabindex="0">
      <div class="context-section-intro"><div><h2>Business Model Canvas</h2><p>Keep a concise, editable view of how Shifd Labs creates and delivers value.</p></div><span class="context-muted-note">9 blocks</span></div>
      <section class="bmc-grid" aria-label="Business Model Canvas blocks">
        <BaseCard v-for="block in draft.bmcBlocks" :key="block.id" :title="block.title"><textarea class="bmc-textarea" :aria-label="block.title" rows="6" placeholder="One entry per line" :value="block.entries.join('\n')" @input="block.entries = ($event.target as HTMLTextAreaElement).value.split('\n').map((entry) => entry.trim()).filter(Boolean)" /><p class="bmc-hint">Use one short entry per line.</p></BaseCard>
      </section>
    </div>

    <div v-else id="context-panel-brand" class="context-stack" role="tabpanel" aria-labelledby="context-tab-brand" tabindex="0">
      <BaseCard title="Brand Voice" description="Communication rules inherited by content generation and review.">
        <div class="context-form-grid"><BaseInput v-model="draft.brandProfile.brandVoice" label="Brand Voice" /><BaseInput v-model="draft.brandProfile.preferredLanguage" label="Preferred Language" /><BaseTextarea v-model="draft.brandProfile.toneDescription" label="Tone Description" :rows="4" /><BaseInput v-model="draft.brandProfile.ctaStyle" label="CTA Style" /></div>
      </BaseCard>
      <BaseCard title="Communication Guidelines">
        <div class="context-list-grid brand-list-grid"><ContextListEditor v-model="draft.brandProfile.communicationGuidelines" label="Communication Guidelines" /><ContextListEditor v-model="draft.brandProfile.preferredTerms" label="Preferred Words / Terms" /><ContextListEditor v-model="draft.brandProfile.thingsToAvoid" label="Things to Avoid" /><ContextListEditor v-model="draft.brandProfile.brandKeywords" label="Brand Keywords" /></div>
      </BaseCard>
    </div>
    </template>
  </div>
</template>

<style scoped>
.company-context-page { max-width: 1200px; }
.context-saved { display: inline-flex; align-items: center; gap: 6px; color: var(--color-success); font-size: 13px; }
.context-completeness { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 20px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-well); }
.context-completeness > div:first-child { display: grid; gap: 4px; }
.context-completeness__eyebrow, .context-muted-note { color: var(--color-subtle); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; font-weight: 600; }
.context-completeness__items { display: flex; flex-wrap: wrap; gap: 14px; color: var(--color-muted); font-size: 12px; }
.context-completeness__items span { display: inline-flex; align-items: center; gap: 5px; }
.context-completeness__items .is-complete { color: var(--color-success); }
.context-tabs { display: flex; gap: 4px; padding: 4px; background: var(--color-well); border-radius: var(--radius-card); overflow-x: auto; }
.context-tabs button { min-height: 36px; padding: 8px 16px; color: var(--color-muted); border-radius: var(--radius-control); white-space: nowrap; font-size: 13px; }
.context-tabs button[aria-selected='true'] { background: var(--color-surface); color: var(--color-ink); font-weight: 600; box-shadow: var(--shadow-popover); }
.context-stack { display: grid; gap: 20px; }
.context-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 20px; }
.context-form-grid > :nth-child(3), .context-form-grid > :nth-child(7), .context-form-grid > :nth-child(8) { grid-column: 1 / -1; }
.context-list-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: start; }
.context-list-grid > :last-child:nth-child(4) { grid-column: 1 / -1; }
.brand-list-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.brand-list-grid > :last-child:nth-child(4) { grid-column: auto; }
.context-list-editor { display: grid; gap: 10px; }
.context-list-editor__heading { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.context-list-editor__hint, .bmc-hint { color: var(--color-subtle); font-size: 12px; }
.context-list-editor__input { display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
.context-list-editor__input > :first-child { width: 100%; }
.context-list-editor__input > .ui-button { align-self: flex-start; }
.context-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.context-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px 5px 10px; border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-ink); background: var(--color-well); font-size: 12px; }
.context-chip button { display: inline-flex; align-items: center; color: var(--color-subtle); }
.context-choice-group { display: flex; gap: 8px; }
.context-choice { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 7px 12px; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); color: var(--color-muted); font-size: 13px; }
.context-choice:has(input:checked) { border-color: var(--color-primary); background: var(--color-info-soft); color: var(--color-ink); }
.context-choice input { accent-color: var(--color-primary); }
.context-section-intro { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.context-section-intro h2 { font-size: 20px; font-weight: 600; }
.context-section-intro p { margin-top: 4px; color: var(--color-muted); font-size: 13px; }
.bmc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.bmc-grid .ui-card { min-height: 220px; }
.bmc-textarea { width: 100%; min-height: 130px; resize: vertical; border: 1px solid var(--color-control-border); border-radius: var(--radius-control); background: var(--color-well); padding: 10px 12px; color: var(--color-ink); font: inherit; font-size: 13px; line-height: 1.55; }
.bmc-textarea:focus { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.bmc-hint { margin-top: 8px; }
@media (max-width: 900px) { .bmc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .context-list-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .context-completeness { align-items: flex-start; flex-direction: column; } .context-form-grid, .context-list-grid, .bmc-grid { grid-template-columns: 1fr; } .context-form-grid > :nth-child(3), .context-form-grid > :nth-child(7), .context-form-grid > :nth-child(8) { grid-column: auto; } .context-list-grid > :last-child:nth-child(4) { grid-column: auto; } .context-section-intro { align-items: flex-start; flex-direction: column; } }
</style>
