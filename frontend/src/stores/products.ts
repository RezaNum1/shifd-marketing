import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as contextApi from '../api/context'
import { errorMessage, isApiError } from '../api/client'
import { beginCommand, completeCommand, discardCommand } from '../api/idempotency'
import { product as normalizeProduct, resolvedProductContext as normalizeResolvedContext } from '../api/normalizers'
import { useCompanyContextStore } from './companyContext'
import type { SelectOption } from '../types/ui'
import type { Product, ProductProfile, ProductStatus, ResolvedProductContext } from '../types/productContext'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function createEmptyProfile(productId: string): ProductProfile {
  return { productId, targetUsers: [], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: '', features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: 'awareness', positioning: '', keyMessages: [], proofPoints: [], defaultCta: '', inheritCompanyTone: true, toneOverride: '' }
}

export const useProductsStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const productProfiles = ref<Record<string, ProductProfile>>({})
  const resolvedContexts = ref<Record<string, ResolvedProductContext>>({})
  const resolvedEtags = ref<Record<string, string>>({})
  const resolvedLoading = ref(false)
  const versions = ref<Record<string, number>>({})
  const etags = ref<Record<string, string>>({})
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const productOptions = computed<SelectOption[]>(() => products.value.map((item) => ({ value: item.id, label: item.name, disabled: item.status === 'Inactive' })))

  function replace(value: { product: Product; profile: ProductProfile }, etag?: string | null) {
    const index = products.value.findIndex((item) => item.id === value.product.id)
    if (index < 0) products.value.push(clone(value.product))
    else products.value[index] = clone(value.product)
    productProfiles.value[value.product.id] = clone(value.profile)
    if (value.product.version !== undefined) versions.value[value.product.id] = value.product.version
    if (etag) etags.value[value.product.id] = etag
  }

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const result = await contextApi.listProducts()
      products.value = []
      productProfiles.value = {}
      result.data.forEach((item) => replace(normalizeProduct(item)))
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load products.')
    } finally { loading.value = false }
  }

  async function loadProduct(id: string, force = false) {
    if (!force && products.value.some((item) => item.id === id) && productProfiles.value[id]) return getProduct(id)
    loading.value = true
    error.value = ''
    try {
      const result = await contextApi.getProduct(id)
      replace(normalizeProduct(result.data), result.etag)
      return getProduct(id)
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load the product.')
      return undefined
    } finally { loading.value = false }
  }

  async function loadResolvedContext(id: string, force = false) {
    if (!force && resolvedContexts.value[id]) return resolvedContexts.value[id]
    resolvedLoading.value = true
    try {
      const result = await contextApi.getResolvedContext(id)
      const value = normalizeResolvedContext(result.data)
      if (value) {
        resolvedContexts.value[id] = value
        if (result.etag) resolvedEtags.value[id] = result.etag
      }
      return value
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to resolve product context.')
      return undefined
    } finally {
      resolvedLoading.value = false
    }
  }

  function getProduct(id: string) { return products.value.find((item) => item.id === id) }
  function getProfile(id: string) { return productProfiles.value[id] }
  function nameFor(id?: string) { return id ? getProduct(id)?.name ?? 'Product' : 'Product' }
  function profileSnapshot(id: string) { return clone(getProfile(id) ?? createEmptyProfile(id)) }

  async function addProduct(input: Pick<Product, 'name' | 'description' | 'category' | 'status' | 'url'>) {
    error.value = ''
    const payload = { ...input, status: backendStatus(input.status), category: input.category || null, url: input.url || null }
    const command = beginCommand('product.create', JSON.stringify(payload))
    try {
      const result = await contextApi.createProduct(payload, command.key)
      completeCommand(command.identity)
      const normalized = normalizeProduct(result.data)
      replace(normalized, result.etag)
      await loadResolvedContext(normalized.product.id, true)
      return normalized.product
    } catch (reason: unknown) {
      if (isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(command.identity)
      error.value = errorMessage(reason, 'Unable to create the product.')
      return undefined
    }
  }

  async function saveProduct(value: Product, profileOverride?: ProductProfile) {
    const profile = profileOverride ?? getProfile(value.id) ?? createEmptyProfile(value.id)
    const version = etags.value[value.id] ?? versions.value[value.id]
    if (version === undefined) { await loadProduct(value.id, true); return false }
    error.value = ''
    try {
      const result = await contextApi.updateProduct(value.id, { name: value.name.trim(), description: value.description.trim(), category: value.category || null, status: backendStatus(value.status), url: value.url || null }, backendProfile(profile), version)
      replace(normalizeProduct(result.data), result.etag)
      await loadResolvedContext(value.id, true)
      return true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to save the product.')
      if (error.value.includes('changed elsewhere')) await loadProduct(value.id, true)
      return false
    }
  }

  async function saveProfile(profile: ProductProfile) {
    const item = getProduct(profile.productId)
    const version = item?.version !== undefined ? (etags.value[profile.productId] ?? item.version) : undefined
    if (!item || version === undefined) return false
    error.value = ''
    try {
      const result = await contextApi.updateProduct(item.id, { name: item.name, description: item.description, category: item.category || null, status: backendStatus(item.status), url: item.url || null }, backendProfile(profile), version)
      replace(normalizeProduct(result.data), result.etag)
      await loadResolvedContext(item.id, true)
      return true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to save the product profile.')
      if (error.value.includes('changed elsewhere')) await loadProduct(item.id, true)
      return false
    }
  }

  function resolveProductContext(id: string): ResolvedProductContext | undefined {
    if (resolvedContexts.value[id]) return resolvedContexts.value[id]
    const item = getProduct(id)
    const profile = getProfile(id)
    if (!item || !profile) return undefined
    const company = useCompanyContextStore().snapshot()
    return {
      company,
      product: clone(item),
      profile: clone(profile),
      resolvedBrandVoice: profile.inheritCompanyTone ? company.brandProfile.brandVoice : profile.toneOverride || company.brandProfile.brandVoice,
      resolvedCtaStyle: company.brandProfile.ctaStyle,
      resolvedLanguage: company.brandProfile.preferredLanguage,
    }
  }

  return { products, productProfiles, productOptions, versions, etags, resolvedContexts, resolvedEtags, resolvedLoading, loading, loaded, error, load, loadProduct, loadResolvedContext, getProduct, getProfile, nameFor, profileSnapshot, addProduct, saveProduct, saveProfile, resolveProductContext }
})

function backendStatus(status: ProductStatus) { return status.toLowerCase() }

function backendProfile(value: ProductProfile) {
  const { productId: _productId, ...profile } = value
  return { ...profile, valueProposition: value.valueProposition || null, campaignObjective: value.campaignObjective || null, positioning: value.positioning || null, defaultCta: value.defaultCta || null, toneOverride: value.toneOverride || null }
}

export type { ProductStatus }
