import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mockCompanyContext } from '../data/companyContext'
import type { CompanyContextState } from '../types/companyContext'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

export const useCompanyContextStore = defineStore('companyContext', () => {
  const companyProfile = ref(clone(mockCompanyContext.companyProfile))
  const brandProfile = ref(clone(mockCompanyContext.brandProfile))
  const bmcBlocks = ref(clone(mockCompanyContext.bmcBlocks))

  function save(context: CompanyContextState) {
    companyProfile.value = clone(context.companyProfile)
    brandProfile.value = clone(context.brandProfile)
    bmcBlocks.value = clone(context.bmcBlocks)
  }

  function snapshot(): CompanyContextState {
    return clone({ companyProfile: companyProfile.value, brandProfile: brandProfile.value, bmcBlocks: bmcBlocks.value })
  }

  return { companyProfile, brandProfile, bmcBlocks, save, snapshot }
})
