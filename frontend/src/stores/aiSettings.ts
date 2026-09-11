import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mockAiRequestLogs, mockPromptVersions } from '../data/ai'
import type { AiRequestLog, AiSettings, PromptVersion } from '../types/ai'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

export const useAiSettingsStore = defineStore('aiSettings', () => {
  const settings = ref<AiSettings>({ provider: 'Claude', model: 'Claude Sonnet', generationLanguage: 'English' })
  const promptVersions = ref<PromptVersion[]>(mockPromptVersions.map(clone))
  const requestLogs = ref<AiRequestLog[]>(mockAiRequestLogs.map(clone))

  function saveSettings(next: AiSettings) { settings.value = clone(next) }

  return { settings, promptVersions, requestLogs, saveSettings }
})
