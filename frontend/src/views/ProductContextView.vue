<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import ContextListEditor from '../components/context/ContextListEditor.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { objectiveOptions } from '../data/contentBrief'
import { useProductsStore } from '../stores/products'
import type { Product, ProductProfile } from '../types/productContext'
import type { Tone } from '../types/ui'

const route = useRoute(); const router = useRouter(); const store = useProductsStore()
const product = computed(() => store.getProduct(String(route.params.id)))
const profile = computed(() => product.value ? store.getProfile(product.value.id) : undefined)
const draftProduct = reactive<Product>({ id: '', companyId: '', name: '', slug: '', description: '', category: '', status: 'Draft', url: '', createdAt: '', updatedAt: '' })
const draftProfile = reactive<ProductProfile>({ productId: '', targetUsers: [], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: '', features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: 'awareness', positioning: '', keyMessages: [], proofPoints: [], defaultCta: '', inheritCompanyTone: true, toneOverride: '' })
const initialized = ref(false); const savedAt = ref<string | null>(null)
const statusOptions = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Draft', label: 'Draft' }]
const campaignObjectiveOptions = objectiveOptions.map((option) => ({ ...option, label: option.value === 'discovery' ? 'Product Discovery' : option.label }))
const dirty = computed(() => initialized.value && (JSON.stringify(draftProduct) !== JSON.stringify(product.value) || JSON.stringify(draftProfile) !== JSON.stringify(profile.value)))
const resolved = computed(() => product.value ? store.resolveProductContext(product.value.id) : undefined)
const resolvedTone = computed(() => draftProfile.inheritCompanyTone ? (resolved.value?.company.brandProfile.brandVoice ?? '') : (draftProfile.toneOverride || resolved.value?.company.brandProfile.brandVoice || ''))
const productStatusTone = computed<Tone>(() => draftProduct.status === 'Active' ? 'success' : draftProduct.status === 'Inactive' ? 'neutral' : 'warning')

watch(() => String(route.params.id), () => {
  if (!product.value || !profile.value) return
  Object.assign(draftProduct, JSON.parse(JSON.stringify(product.value)))
  Object.assign(draftProfile, JSON.parse(JSON.stringify(profile.value)))
  initialized.value = true
  savedAt.value = null
}, { immediate: true })

function save() { if (!draftProduct.name.trim() || !draftProduct.description.trim()) return; draftProduct.updatedAt = new Date().toISOString(); store.saveProduct(draftProduct); store.saveProfile(draftProfile); savedAt.value = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()) }
</script>

<template>
  <div v-if="product && profile && resolved" class="page-stack product-context-page">
    <PageHeader :title="draftProduct.name" description="Define product-specific audience, positioning, and marketing context." :breadcrumbs="[{ label: 'Context Engine' }, { label: 'Products', to: '/context/products' }, { label: draftProduct.name }]">
      <template #actions><StatusBadge :tone="productStatusTone" dot>{{ draftProduct.status }}</StatusBadge><span v-if="savedAt && !dirty" class="product-saved"><AppIcon name="check" :size="15" />Saved {{ savedAt }}</span><BaseButton :disabled="!dirty" @click="save">Save Changes</BaseButton></template>
    </PageHeader>
    <BaseCard class="inheritance-card"><div class="inheritance-card__icon"><AppIcon name="company" :size="18" /></div><div><strong>Inherits company context from {{ resolved.company.companyProfile.name }}</strong><p>Brand, market, and business context remain managed in Company Context.</p></div><BaseButton variant="secondary" size="compact" @click="router.push('/context/company')">View Company Context</BaseButton></BaseCard>
    <section class="inherited-summary" aria-label="Inherited company context"><div><span>Inherited Company Context</span><strong>{{ resolved.company.companyProfile.name }}</strong></div><div><span>Brand Voice</span><strong>{{ draftProfile.inheritCompanyTone ? resolvedTone : 'Product-specific override' }}</strong></div><div><span>Primary Market</span><strong>{{ resolved.company.companyProfile.primaryMarket }}</strong></div><div><span>Business Type</span><strong>{{ resolved.company.companyProfile.businessTypes.join(' / ') }}</strong></div></section>

    <BaseCard title="Product Information"><div class="product-form-grid"><BaseInput v-model="draftProduct.name" label="Product Name" required /><BaseInput v-model="draftProduct.category" label="Category" /><BaseTextarea v-model="draftProduct.description" label="Product Description" :rows="3" required /><BaseSelect v-model="draftProduct.status" label="Status" :options="statusOptions" /><BaseInput v-model="draftProduct.url" label="Product URL" type="url" /></div></BaseCard>
    <BaseCard title="Target Audience" description="Editable product context, not validated customer research."><div class="product-lists-grid"><ContextListEditor v-model="draftProfile.targetUsers" label="Target Users" /><ContextListEditor v-model="draftProfile.targetOrganizations" label="Target Organizations" /><ContextListEditor v-model="draftProfile.decisionMakers" label="Decision Makers" /><ContextListEditor v-model="draftProfile.problemsAddressed" label="Problems Addressed" /></div></BaseCard>
    <BaseCard title="Product Value"><div class="product-form-grid"><BaseTextarea v-model="draftProfile.valueProposition" label="Value Proposition" :rows="3" /><BaseTextarea v-model="draftProfile.positioning" label="Product Positioning" :rows="3" /></div><div class="product-lists-grid product-lists-grid--four"><ContextListEditor v-model="draftProfile.features" label="Key Features" /><ContextListEditor v-model="draftProfile.benefits" label="Key Benefits" /><ContextListEditor v-model="draftProfile.differentiators" label="Differentiators" /><ContextListEditor v-model="draftProfile.useCases" label="Use Cases" /></div></BaseCard>
    <BaseCard title="Marketing Context"><div class="product-form-grid"><BaseSelect v-model="draftProfile.campaignObjective" label="Campaign Objective" :options="campaignObjectiveOptions" /><BaseInput v-model="draftProfile.defaultCta" label="Default CTA" /><ContextListEditor v-model="draftProfile.keyMessages" label="Key Messages" /><ContextListEditor v-model="draftProfile.proofPoints" label="Proof Points" hint="Add only evidence or claims that can be supported." /></div></BaseCard>
    <BaseCard title="Communication / Tone" description="Product context can inherit the Company Brand values without copying them."><label class="tone-toggle"><input v-model="draftProfile.inheritCompanyTone" type="checkbox" /> <span><strong>Inherit Company Brand Tone</strong><small>Use the current Company Context brand rules dynamically.</small></span></label><div v-if="draftProfile.inheritCompanyTone" class="inherited-tone-grid"><div><span>Inherited Brand Voice</span><strong>{{ resolvedTone }}</strong></div><div><span>Inherited CTA Style</span><strong>{{ resolved.company.brandProfile.ctaStyle }}</strong></div><div><span>Inherited Preferred Language</span><strong>{{ resolved.company.brandProfile.preferredLanguage }}</strong></div></div><div v-else class="tone-override"><BaseTextarea v-model="draftProfile.toneOverride" label="Product Tone Override" :rows="3" hint="This overrides only the brand voice; other Company Context remains inherited." /><div class="tone-resolution-grid"><div><span>Inherited Company Brand Voice</span><strong>{{ resolved.company.brandProfile.brandVoice }}</strong></div><div><span>Resolved Product Brand Voice</span><strong>{{ resolvedTone }}</strong></div></div></div></BaseCard>
  </div>
  <BaseCard v-else class="product-not-found"><EmptyState icon="product" title="Product not found." description="The requested product context is not available."><BaseButton variant="secondary" @click="router.push('/context/products')">Back to Products</BaseButton><BaseButton @click="router.push('/context/products')">Add Product</BaseButton></EmptyState></BaseCard>
</template>

<style scoped>
.product-context-page { max-width: 1200px; }
.product-saved { display: inline-flex; align-items: center; gap: 6px; color: var(--color-success); font-size: 13px; }
.inheritance-card { display: flex; align-items: center; gap: 14px; background: var(--color-well); }
.inheritance-card > div:nth-child(2) { flex: 1; }
.inheritance-card p { margin-top: 4px; color: var(--color-muted); font-size: 13px; }
.inheritance-card__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-control); color: var(--color-primary); background: var(--color-surface); }
.inherited-summary { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; background: var(--color-border); }
.inherited-summary > div { display: grid; gap: 6px; padding: 16px; background: var(--color-surface); }
.inherited-summary span, .inherited-tone-grid span { color: var(--color-subtle); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.inherited-summary strong { font-size: 13px; line-height: 1.45; }
.product-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px 20px; }
.product-form-grid > :nth-child(3) { grid-column: 1 / -1; }
.product-lists-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; }
.product-lists-grid--four { margin-top: 20px; }
.tone-toggle { display: flex; align-items: flex-start; gap: 10px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); cursor: pointer; }
.tone-toggle input { margin-top: 3px; accent-color: var(--color-primary); }
.tone-toggle span { display: grid; gap: 4px; }
.tone-toggle small { color: var(--color-muted); font-size: 12px; }
.inherited-tone-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-top: 16px; }
.inherited-tone-grid > div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.inherited-tone-grid strong { font-size: 13px; line-height: 1.45; }
.tone-override { margin-top: 16px; }
.tone-resolution-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.tone-resolution-grid > div { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); }
.tone-resolution-grid span { color: var(--color-subtle); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
.tone-resolution-grid strong { font-size: 13px; line-height: 1.45; }
.product-not-found { max-width: 760px; }
@media (max-width: 800px) { .inherited-summary { grid-template-columns: repeat(2, minmax(0,1fr)); } .product-lists-grid, .inherited-tone-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .inheritance-card { align-items: flex-start; flex-wrap: wrap; } .inheritance-card > .ui-button { margin-left: 50px; } .product-form-grid, .inherited-summary, .tone-resolution-grid { grid-template-columns: 1fr; } .product-form-grid > :nth-child(3) { grid-column: auto; } }
</style>
