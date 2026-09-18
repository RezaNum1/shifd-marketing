import { request } from './client'
import type { BackendAiRequest, BackendAiSettings, BackendAiUsage, BackendPromptVersion } from '../types/backend'

export function getAiSettings() { return request<BackendAiSettings>('/settings/ai') }
export function updateAiSettings(generationLanguage: 'English' | 'Indonesian', etag: string | number) { return request<BackendAiSettings>('/settings/ai', { method: 'PUT', json: { generationLanguage }, ifMatch: etag }) }
export function listPromptVersions() { return request<BackendPromptVersion[]>('/prompt-versions?limit=100') }
export function listAiRequests() { return request<BackendAiRequest[]>('/ai-requests?limit=100') }
export function getAiUsage(start: string, end: string, mode: 'real' | 'demo' = 'real') { return request<BackendAiUsage>(`/ai-usage?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&mode=${mode}`) }
