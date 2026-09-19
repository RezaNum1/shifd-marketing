import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as integrationsApi from '../api/integrations'
import { errorMessage } from '../api/client'
import type { BackendIntegration } from '../types/backend'
import type { InstagramIntegration, ManualIntegration } from '../types/integration'

export const useIntegrationsStore = defineStore('integrations', () => {
  const instagram = ref<InstagramIntegration | null>(null)
  const linkedin = ref<ManualIntegration | null>(null)
  const whatsapp = ref<ManualIntegration | null>(null)
  const etags = ref<Record<string, string>>({})
  const instagramSyncState = ref<'idle' | 'syncing' | 'success'>('idle')
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const result = await integrationsApi.listIntegrations()
      instagram.value = result.data.instagram ? toInstagram(result.data.instagram) : null
      linkedin.value = result.data.linkedin ? toManual(result.data.linkedin, 'LinkedIn') : null
      whatsapp.value = result.data.whatsapp ? toManual(result.data.whatsapp, 'WhatsApp Business') : null
      Object.values(result.data).forEach((item) => { if (item) etags.value[item.platform] = `"${item.version}"` })
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load integration status.')
    } finally { loading.value = false }
  }

  async function syncInstagram() {
    if (!instagram.value || instagram.value.status !== 'connected' || instagramSyncState.value === 'syncing') return false
    instagramSyncState.value = 'syncing'
    error.value = ''
    try {
      const result = await integrationsApi.syncInstagram(etagFor('instagram'))
      instagram.value = toInstagram(result.data.integration)
      etags.value.instagram = result.etag ?? `"${result.data.integration.version}"`
      instagramSyncState.value = 'success'
      return true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to sync Instagram.')
      instagramSyncState.value = 'idle'
      return false
    }
  }

  async function connectInstagram() {
    if (!instagram.value) return false
    try {
      const result = await integrationsApi.connectInstagram(etagFor('instagram'))
      instagram.value = toInstagram(result.data)
      etags.value.instagram = result.etag ?? `"${result.data.version}"`
      return true
    } catch (reason: unknown) { error.value = errorMessage(reason, 'Unable to connect Instagram.'); return false }
  }

  async function disconnectInstagram() {
    if (!instagram.value) return false
    try {
      const result = await integrationsApi.disconnectInstagram(etagFor('instagram'))
      instagram.value = toInstagram(result.data)
      etags.value.instagram = result.etag ?? `"${result.data.version}"`
      instagramSyncState.value = 'idle'
      return true
    } catch (reason: unknown) { error.value = errorMessage(reason, 'Unable to disconnect Instagram.'); return false }
  }

  function etagFor(platform: string) { return etags.value[platform] ?? `"${instagram.value?.version ?? 1}"` }

  return { instagram, linkedin, whatsapp, etags, instagramSyncState, loading, loaded, error, load, syncInstagram, connectInstagram, disconnectInstagram }
})

function toInstagram(value: BackendIntegration): InstagramIntegration {
  return { id: 'instagram', platform: 'Instagram', status: value.status === 'connected' ? 'connected' : 'disconnected', accountName: value.accountName ?? undefined, futureSource: value.currentSource === 'instagram_api' ? 'Instagram Graph API' : 'Not configured', lastSync: value.lastSync ?? undefined, mode: value.mode, currentSource: value.currentSource, version: value.version }
}

function toManual(value: BackendIntegration, platform: 'LinkedIn' | 'WhatsApp Business'): ManualIntegration {
  return { id: platform === 'LinkedIn' ? 'linkedin' : 'whatsapp', platform, status: 'manual', dataSource: value.mode === 'manual' ? 'Manual Entry' : value.currentSource, purpose: platform === 'LinkedIn' ? 'Weekly performance metrics' : 'Supplementary inbound inquiry tracking', mode: value.mode, currentSource: value.currentSource, version: value.version }
}
