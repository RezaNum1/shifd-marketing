import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as settingsApi from '../api/settings'
import { errorMessage } from '../api/client'
import type { BackendAiRequest, BackendAiSettings, BackendAiUsage, BackendPromptVersion } from '../types/backend'
import type { AiRequestLog, AiSettings, PromptVersion } from '../types/ai'

export const useAiSettingsStore = defineStore('aiSettings', () => {
  const settings = ref<AiSettings>({ provider: '', model: '', generationLanguage: 'English', mode: 'real', status: 'unknown', systemStatus: { contextEngine: 'unknown', promptConfiguration: 'unknown', aiConfiguration: 'unknown' } })
  const promptVersions = ref<PromptVersion[]>([])
  const requestLogs = ref<AiRequestLog[]>([])
  const usage = ref<BackendAiUsage | null>(null)
  const etag = ref<string | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const end = new Date().toISOString()
      const [aiSettings, prompts, requests, usageResult] = await Promise.all([settingsApi.getAiSettings(), settingsApi.listPromptVersions(), settingsApi.listAiRequests(), settingsApi.getAiUsage('1970-01-01T00:00:00.000Z', end)])
      replaceSettings(aiSettings.data, aiSettings.etag)
      promptVersions.value = prompts.data.map(toPromptVersion)
      requestLogs.value = requests.data.map(toRequestLog)
      usage.value = usageResult.data
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load AI system status.')
    } finally { loading.value = false }
  }

  async function saveSettings(next: AiSettings) {
    if (!etag.value) { await load(true); if (!etag.value) return false }
    try {
      const result = await settingsApi.updateAiSettings(next.generationLanguage, etag.value)
      replaceSettings(result.data, result.etag)
      return true
    } catch (reason: unknown) { error.value = errorMessage(reason, 'Unable to save AI settings.'); return false }
  }

  function replaceSettings(value: BackendAiSettings, nextEtag?: string | null) {
    settings.value = { provider: value.provider, model: value.model, generationLanguage: value.generationLanguage, mode: value.mode, status: value.status, systemStatus: value.systemStatus, version: value.version }
    etag.value = nextEtag ?? `"${value.version}"`
  }

  return { settings, promptVersions, requestLogs, usage, etag, loading, loaded, error, load, saveSettings }
})

function toPromptVersion(value: BackendPromptVersion): PromptVersion {
  return { id: value.id, module: value.module as PromptVersion['module'], operation: value.operation as PromptVersion['operation'], version: value.version, status: value.status === 'active' ? 'Active' : 'Retired', updatedAt: value.updatedAt }
}

function toRequestLog(value: BackendAiRequest): AiRequestLog {
  return { id: value.id, module: value.module as AiRequestLog['module'], operation: value.operation as AiRequestLog['operation'], contentId: value.contentId ?? undefined, provider: value.provider, model: value.model, promptVersion: value.promptVersion.version, inputTokens: value.inputTokens ?? 0, outputTokens: value.outputTokens ?? 0, estimatedCostUsd: Number(value.estimatedCostUsd ?? 0), latencyMs: value.latencyMs ?? undefined, status: value.status === 'success' ? 'Success' : 'Failed', createdAt: value.createdAt }
}
