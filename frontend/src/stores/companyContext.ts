import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as contextApi from '../api/context'
import { errorMessage } from '../api/client'
import { companyContext as normalizeCompanyContext } from '../api/normalizers'
import type { CompanyContextState } from '../types/companyContext'
import type { BackendTaxonomy } from '../types/backend'

function emptyContext(): CompanyContextState {
  return {
    companyProfile: { id: '', name: '', description: '', industry: '', businessTypes: [], primaryMarket: '', website: '', mission: '', vision: '', positioning: '', coreValueProposition: '', differentiators: [], customerSegments: [], decisionMakers: [], painPoints: [] },
    brandProfile: { brandVoice: '', toneDescription: '', preferredLanguage: 'English', communicationGuidelines: [], preferredTerms: [], thingsToAvoid: [], ctaStyle: '', brandKeywords: [] },
    bmcBlocks: [],
  }
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

export const useCompanyContextStore = defineStore('companyContext', () => {
  const state = emptyContext()
  const companyProfile = ref(state.companyProfile)
  const brandProfile = ref(state.brandProfile)
  const bmcBlocks = ref(state.bmcBlocks)
  const contextVersion = ref<number | null>(null)
  const etag = ref<string | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const taxonomy = ref<BackendTaxonomy | null>(null)
  const taxonomyLoading = ref(false)
  const taxonomyError = ref('')

  function replace(value: CompanyContextState, nextEtag?: string | null, version?: number) {
    companyProfile.value = clone(value.companyProfile)
    brandProfile.value = clone(value.brandProfile)
    bmcBlocks.value = clone(value.bmcBlocks)
    if (nextEtag !== undefined) etag.value = nextEtag
    if (version !== undefined) contextVersion.value = version
    loaded.value = true
  }

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const result = await contextApi.getCompany()
      replace(normalizeCompanyContext(result.data), result.etag, result.data.contextVersion)
      await loadTaxonomy()
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load company context.')
    } finally {
      loading.value = false
    }
  }

  async function loadTaxonomy(force = false) {
    if (taxonomyLoading.value || (taxonomy.value && !force)) return taxonomy.value
    taxonomyLoading.value = true
    taxonomyError.value = ''
    try {
      const result = await contextApi.getTaxonomy()
      taxonomy.value = result.data
      return result.data
    } catch (reason: unknown) {
      taxonomyError.value = errorMessage(reason, 'Unable to load the content taxonomy.')
      return undefined
    } finally {
      taxonomyLoading.value = false
    }
  }

  async function save(context: CompanyContextState) {
    if (!etag.value) {
      await load(true)
      if (!etag.value) return false
    }
    loading.value = true
    error.value = ''
    try {
      const result = await contextApi.updateCompany({
        profile: context.companyProfile,
        brand: context.brandProfile,
        bmcBlocks: context.bmcBlocks,
      }, etag.value)
      replace(normalizeCompanyContext(result.data), result.etag, result.data.contextVersion)
      return true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to save company context.')
      if (error.value.includes('changed elsewhere')) await load(true)
      return false
    } finally {
      loading.value = false
    }
  }

  function snapshot(): CompanyContextState {
    return clone({ companyProfile: companyProfile.value, brandProfile: brandProfile.value, bmcBlocks: bmcBlocks.value })
  }

  return { companyProfile, brandProfile, bmcBlocks, contextVersion, etag, loading, loaded, error, taxonomy, taxonomyLoading, taxonomyError, load, loadTaxonomy, save, snapshot }
})
