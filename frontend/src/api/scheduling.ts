import { createRequestKey, request } from './client'
import type { BackendCalendarReport, BackendContent, BackendPlatform, BackendPublication, BackendSchedule } from '../types/backend'

export function getCalendar(start: string, end: string, filters: { platform?: BackendPlatform; status?: BackendSchedule['status']; productId?: string; contextType?: string } = {}) {
  const query = new URLSearchParams({ start: apiTimestamp(start), end: apiTimestamp(end) })
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  return request<BackendCalendarReport>(`/calendar?${query.toString()}`)
}

function apiTimestamp(value: string) {
  return /T/.test(value) ? value : `${value}T00:00:00+07:00`
}

export function createSchedules(contentId: string, schedules: Array<{ platform: BackendPlatform; scheduledAt: string; timezone: string }>, etag: string | number, idempotencyKey = createRequestKey('schedule.create')) {
  return request<BackendContent>(`/contents/${contentId}/schedules`, { method: 'POST', json: { schedules }, ifMatch: etag, idempotencyKey })
}
export function updateSchedule(id: string, input: { scheduledAt: string; timezone: string }, contentEtag: string | number) {
  return request<BackendContent>(`/schedules/${id}`, { method: 'PUT', json: input, ifMatch: contentEtag })
}
export function deleteSchedule(id: string, contentEtag: string | number) {
  return request<BackendContent>(`/schedules/${id}`, { method: 'DELETE', ifMatch: contentEtag })
}
export function publishSchedule(id: string, input: { publishedAt: string; postUrl?: string | null }, contentEtag: string | number, idempotencyKey = createRequestKey('schedule.publish')) {
  return request<{ publication: BackendPublication; content: BackendContent }>(`/schedules/${id}/publish`, { method: 'POST', json: input, ifMatch: contentEtag, idempotencyKey })
}
