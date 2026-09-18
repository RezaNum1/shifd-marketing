<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useProductsStore } from '../stores/products'
import type { ProductStatus } from '../types/productContext'
import type { SelectOption, Tone } from '../types/ui'

const router = useRouter()
const store = useProductsStore()
const search = ref('')
const statusFilter = ref<'All' | ProductStatus>('All')
const modalOpen = ref(false)
const attempted = ref(false)
const form = ref({ name: '', description: '', category: '', status: 'Draft' as ProductStatus, url: '' })
const statusOptions: SelectOption[] = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Draft', label: 'Draft' }]
const filterOptions: SelectOption[] = [{ value: 'All', label: 'All Products' }, ...statusOptions]
const filteredProducts = computed(() => store.products.filter((product) => {
  const query = search.value.trim().toLowerCase()
  return (!query || [product.name, product.description, product.category].some((value) => value.toLowerCase().includes(query))) && (statusFilter.value === 'All' || product.status === statusFilter.value)
}))
function tone(status: ProductStatus): Tone { return status === 'Active' ? 'success' : status === 'Inactive' ? 'neutral' : 'warning' }
function openAdd() { form.value = { name: '', description: '', category: '', status: 'Draft', url: '' }; attempted.value = false; modalOpen.value = true }
async function save() {
  attempted.value = true
  if (!form.value.name.trim() || !form.value.description.trim()) return
  const product = await store.addProduct(form.value)
  if (!product) return
  modalOpen.value = false
  router.push(`/context/products/${product.id}`)
}

onMounted(() => { void store.load() })
</script>

<template>
  <div class="page-stack products-page">
    <PageHeader title="Products" description="Manage product-specific context used during content creation." :breadcrumbs="[{ label: 'Context Engine' }, { label: 'Products' }]">
      <template #actions><BaseButton @click="openAdd"><AppIcon name="plus" :size="16" />Add Product</BaseButton></template>
    </PageHeader>
    <BaseCard class="products-controls"><div class="products-controls__inner"><BaseInput v-model="search" type="search" label="Search products" placeholder="Search products..." /><BaseSelect v-model="statusFilter" label="Status" :options="filterOptions" /></div></BaseCard>
    <InlineAlert v-if="store.loading" title="Loading products">Loading canonical product context…</InlineAlert>
    <InlineAlert v-if="store.error" title="Products unavailable" tone="danger">{{ store.error }}</InlineAlert>
    <section v-if="store.loaded && filteredProducts.length" class="products-grid" aria-label="Products">
      <BaseCard v-for="product in filteredProducts" :key="product.id" class="product-card">
        <button type="button" class="product-card__body" @click="router.push(`/context/products/${product.id}`)"><div class="product-card__heading"><div class="product-card__icon"><AppIcon name="product" :size="20" /></div><div><h2>{{ product.name }}</h2><StatusBadge :tone="tone(product.status)" dot>{{ product.status }}</StatusBadge></div></div><p>{{ product.description }}</p><dl><div><dt>Category</dt><dd>{{ product.category || '—' }}</dd></div><div><dt>Last Updated</dt><dd>{{ new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(product.updatedAt)) }}</dd></div></dl><span class="product-card__link">Open Product Context <AppIcon name="arrow-right" :size="15" /></span></button>
      </BaseCard>
    </section>
    <BaseCard v-else-if="store.loaded && !store.products.length"><EmptyState icon="product" title="No products found." description="Add a product to start defining product-specific marketing context."><BaseButton @click="openAdd">Add Product</BaseButton></EmptyState></BaseCard>
    <BaseCard v-else-if="store.loaded"><EmptyState icon="search" title="No products match these filters." description="Try another search or clear your filters."><BaseButton variant="secondary" @click="search = ''; statusFilter = 'All'">Clear Filters</BaseButton></EmptyState></BaseCard>
    <BaseModal v-model="modalOpen" title="Add Product" description="Create a product record and its editable context layer."><form class="product-form" @submit.prevent="save"><BaseInput v-model="form.name" label="Product Name" required :error="attempted && !form.name.trim() ? 'Enter a product name.' : undefined" /><BaseTextarea v-model="form.description" label="Description" :rows="3" required :error="attempted && !form.description.trim() ? 'Enter a description.' : undefined" /><BaseInput v-model="form.category" label="Category" /><BaseSelect v-model="form.status" label="Status" :options="statusOptions" /><BaseInput v-model="form.url" label="Product URL" type="url" /><div class="modal-actions"><BaseButton variant="ghost" type="button" @click="modalOpen = false">Cancel</BaseButton><BaseButton type="submit">Save Product</BaseButton></div></form></BaseModal>
  </div>
</template>

<style scoped>
.products-page { max-width: 1200px; }
.products-controls__inner { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
.products-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.product-card__body { display: grid; gap: 18px; width: 100%; text-align: left; }
.product-card__body:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 4px; border-radius: var(--radius-control); }
.product-card__heading { display: flex; align-items: flex-start; gap: 12px; }
.product-card__heading h2 { margin-bottom: 6px; font-size: 18px; font-weight: 600; }
.product-card__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-control); color: var(--color-primary); background: var(--color-info-soft); }
.product-card__body > p { color: var(--color-muted); line-height: 1.6; }
.product-card__body dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 14px; border-top: 1px solid var(--color-border); }
.product-card__body dt { color: var(--color-subtle); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.product-card__body dd { margin-top: 4px; font-size: 13px; }
.product-card__link { display: inline-flex; align-items: center; gap: 6px; color: var(--color-link); font-size: 13px; font-weight: 500; }
.product-form { display: grid; gap: 16px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
@media (max-width: 700px) { .products-controls__inner, .products-grid { grid-template-columns: 1fr; } }
</style>
