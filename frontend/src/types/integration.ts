export type IntegrationStatus = 'connected' | 'disconnected' | 'manual'

export interface InstagramIntegration {
  id: 'instagram'
  platform: 'Instagram'
  status: Exclude<IntegrationStatus, 'manual'>
  accountName?: string
  futureSource: string
  lastSync?: string
  mode?: 'demo' | 'manual' | 'api'
  currentSource?: string
  version?: number
}

export interface ManualIntegration {
  id: 'linkedin' | 'whatsapp'
  platform: 'LinkedIn' | 'WhatsApp Business'
  status: 'manual'
  dataSource: string
  purpose: string
  mode?: 'demo' | 'manual' | 'api'
  currentSource?: string
  version?: number
}
