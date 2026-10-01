import { request } from './client'
import type { BackendTelegramIntegration } from '../types/backend'

export function getTelegramIntegration() { return request<BackendTelegramIntegration>('/integrations/telegram') }
export function createTelegramLink() { return request<{ telegramDeepLink: string; expiresAt: string }>('/integrations/telegram/link', { method: 'POST', json: {} }) }
export function disconnectTelegram() { return request<BackendTelegramIntegration>('/integrations/telegram/disconnect', { method: 'POST', json: {} }) }
