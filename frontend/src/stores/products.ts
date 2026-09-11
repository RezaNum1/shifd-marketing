import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mockProductProfiles, mockProducts } from '../data/products'
import { useCompanyContextStore } from './companyContext'
import type { SelectOption } from '../types/ui'
import type { Product, ProductProfile, ProductStatus, ResolvedProductContext } from '../types/productContext'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

export const useProductsStore = defineStore('products', () => {
  const products = ref<Product[]>(mockProducts.map(clone))
  const productProfiles = ref<Record<string, ProductProfile>>(clone(mockProductProfiles))
  const productOptions = computed<SelectOption[]>(() => products.value.map((product) => ({ value: product.id, label: product.name, disabled: product.status === 'Inactive' })))

  function getProduct(id: string) { return products.value.find((product) => product.id === id) }
  function getProfile(id: string) { return productProfiles.value[id] }
  function nameFor(id?: string) { return id ? getProduct(id)?.name ?? 'Product' : 'Product' }
  function profileSnapshot(id: string) { return clone(getProfile(id) ?? createEmptyProfile(id)) }

  function addProduct(input: Pick<Product, 'name' | 'description' | 'category' | 'status' | 'url'>) {
    const now = new Date().toISOString()
    const id = `${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'}-${Date.now()}`
    const product: Product = { ...input, id, companyId: 'company-shifd-labs', slug: id, name: input.name.trim(), description: input.description.trim(), createdAt: now, updatedAt: now }
    products.value.unshift(product)
    productProfiles.value[id] = createEmptyProfile(id)
    return product
  }

  function saveProduct(product: Product) {
    const index = products.value.findIndex((item) => item.id === product.id)
    if (index >= 0) products.value[index] = clone(product)
  }
  function saveProfile(profile: ProductProfile) { productProfiles.value[profile.productId] = clone(profile) }

  function resolveProductContext(id: string): ResolvedProductContext | undefined {
    const product = getProduct(id)
    const profile = getProfile(id)
    if (!product || !profile) return undefined
    const company = useCompanyContextStore().snapshot()
    return {
      company, product: clone(product), profile: clone(profile),
      resolvedBrandVoice: profile.inheritCompanyTone ? company.brandProfile.brandVoice : profile.toneOverride || company.brandProfile.brandVoice,
      resolvedCtaStyle: company.brandProfile.ctaStyle,
      resolvedLanguage: company.brandProfile.preferredLanguage,
    }
  }

  return { products, productProfiles, productOptions, getProduct, getProfile, nameFor, profileSnapshot, addProduct, saveProduct, saveProfile, resolveProductContext }
})

function createEmptyProfile(productId: string): ProductProfile {
  return { productId, targetUsers: [], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: '', features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: 'awareness', positioning: '', keyMessages: [], proofPoints: [], defaultCta: '', inheritCompanyTone: true, toneOverride: '' }
}

export type { ProductStatus }
