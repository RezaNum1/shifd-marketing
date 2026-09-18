import { request } from './client'
import type { BackendIntegration, BackendIntegrations } from '../types/backend'

export function listIntegrations() { return request<BackendIntegrations>('/integrations') }
export function connectInstagram(etag: string | number) { return request<BackendIntegration>('/integrations/instagram/connect', { method: 'POST', json: {}, ifMatch: etag }) }
export function disconnectInstagram(etag: string | number) { return request<BackendIntegration>('/integrations/instagram/disconnect', { method: 'POST', json: {}, ifMatch: etag }) }
export function syncInstagram(etag: string | number) { return request<{ integration: BackendIntegration; mode: string; metricsChanged: boolean }>('/integrations/instagram/sync', { method: 'POST', json: {}, ifMatch: etag }) }
