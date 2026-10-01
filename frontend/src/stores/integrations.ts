import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as integrationsApi from '../api/integrations'
import * as telegramApi from '../api/telegram'
import { errorMessage } from '../api/client'
import type { BackendIntegration } from '../types/backend'
import type { InstagramIntegration, ManualIntegration } from '../types/integration'
import type { BackendTelegramIntegration } from '../types/backend'

export const useIntegrationsStore = defineStore('integrations', () => {
  const instagram = ref<InstagramIntegration | null>(null)
  const linkedin = ref<ManualIntegration | null>(null)
  const whatsapp = ref<ManualIntegration | null>(null)
  const telegram = ref<BackendTelegramIntegration>({ status: 'disconnected', telegramUsername: null, activeProduct: null, linkedAt: null })
  const telegramLink = ref<{ telegramDeepLink: string; expiresAt: string } | null>(null)
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
      const telegramResult = await telegramApi.getTelegramIntegration()
      telegram.value = telegramResult.data
      Object.values(result.data).forEach((item) => { if (item) etags.value[item.platform] = `"${item.version}"` })
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load integration status.')
    } finally { loading.value = false }
  }

  async function connectTelegram() {
    error.value = ''
    try {
      const result = await telegramApi.createTelegramLink()
      telegramLink.value = result.data
      window.open(result.data.telegramDeepLink, '_blank', 'noopener,noreferrer')
      return true
    } catch (reason: unknown) { error.value = errorMessage(reason, 'Unable to create a Telegram link.'); return false }
  }

  async function disconnectTelegram() {
    error.value = ''
    try { const result = await telegramApi.disconnectTelegram(); telegram.value = result.data; telegramLink.value = null; return true }
    catch (reason: unknown) { error.value = errorMessage(reason, 'Unable to disconnect Telegram.'); return false }
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

  return { instagram, linkedin, whatsapp, telegram, telegramLink, etags, instagramSyncState, loading, loaded, error, load, syncInstagram, connectInstagram, disconnectInstagram, connectTelegram, disconnectTelegram }
})

function toInstagram(value: BackendIntegration): InstagramIntegration {
  return { id: 'instagram', platform: 'Instagram', status: value.status === 'connected' ? 'connected' : 'disconnected', accountName: value.accountName ?? undefined, futureSource: value.currentSource === 'instagram_api' ? 'Instagram Graph API' : 'Not configured', lastSync: value.lastSync ?? undefined, mode: value.mode, currentSource: value.currentSource, version: value.version }
}

function toManual(value: BackendIntegration, platform: 'LinkedIn' | 'WhatsApp Business'): ManualIntegration {
  return { id: platform === 'LinkedIn' ? 'linkedin' : 'whatsapp', platform, status: 'manual', dataSource: value.mode === 'manual' ? 'Manual Entry' : value.currentSource, purpose: platform === 'LinkedIn' ? 'Weekly performance metrics' : 'Supplementary inbound inquiry tracking', mode: value.mode, currentSource: value.currentSource, version: value.version }
}
