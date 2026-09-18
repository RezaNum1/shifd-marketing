import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as performanceApi from '../api/performance'
import { errorMessage } from '../api/client'
import type { BackendOverviewReport } from '../types/backend'

export const useOverviewStore = defineStore('overview', () => {
  const report = ref<BackendOverviewReport | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return report.value
    loading.value = true
    error.value = ''
    try {
      const result = await performanceApi.getOverview()
      report.value = result.data
      loaded.value = true
      return result.data
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load the overview.')
      return undefined
    } finally { loading.value = false }
  }

  return { report, loading, loaded, error, load }
})
