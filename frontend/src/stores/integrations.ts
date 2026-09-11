import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { InstagramIntegration, ManualIntegration } from '../types/integration'

export const useIntegrationsStore = defineStore('integrations', () => {
  const instagram = ref<InstagramIntegration>({
    id: 'instagram',
    platform: 'Instagram',
    status: 'connected',
    accountName: '@shifdlabs',
    futureSource: 'Instagram Graph API',
    lastSync: 'Sep 9, 2026 · 14:20',
  })
  const instagramSyncState = ref<'idle' | 'syncing' | 'success'>('idle')
  const linkedin: ManualIntegration = {
    id: 'linkedin', platform: 'LinkedIn', status: 'manual',
    dataSource: 'Manual Entry', purpose: 'Weekly performance metrics',
  }
  const whatsapp: ManualIntegration = {
    id: 'whatsapp', platform: 'WhatsApp Business', status: 'manual',
    dataSource: 'Manual Entry', purpose: 'Supplementary inbound inquiry tracking',
  }
  let syncTimer: ReturnType<typeof setTimeout> | undefined

  async function syncInstagram() {
    if (instagram.value.status !== 'connected' || instagramSyncState.value === 'syncing') return
    instagramSyncState.value = 'syncing'
    await new Promise((resolve) => setTimeout(resolve, 650))
    instagram.value.lastSync = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
    instagramSyncState.value = 'success'
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => { instagramSyncState.value = 'idle' }, 3200)
  }

  function connectInstagram() {
    instagram.value.status = 'connected'
    instagram.value.accountName = '@shifdlabs'
  }

  function disconnectInstagram() {
    instagram.value.status = 'disconnected'
    instagramSyncState.value = 'idle'
    if (syncTimer) clearTimeout(syncTimer)
  }

  return { instagram, instagramSyncState, linkedin, whatsapp, syncInstagram, connectInstagram, disconnectInstagram }
})
