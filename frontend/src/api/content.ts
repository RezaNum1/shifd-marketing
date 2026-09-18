import { createRequestKey, request } from './client'
import type { BackendApprovalAction, BackendContent, BackendContentSummary, BackendEvent, BackendPlatform } from '../types/backend'

export interface ContentBriefInput {
  contextType: 'company' | 'product'
  productId?: string | null
  pillarCode: string
  objective: string
  targetAudience: string
  topic: string
  angle?: string | null
  additionalInstructions?: string | null
}

export function listContents() { return request<BackendContentSummary[]>('/contents?limit=100') }
export function getContent(id: string) { return request<BackendContent>(`/contents/${id}`) }
export function createContent(input: { sourceIdeaId?: string; brief: ContentBriefInput; enabledPlatforms: BackendPlatform[] }, idempotencyKey = createRequestKey('content.create')) {
  return request<BackendContent>('/contents', { method: 'POST', json: input, idempotencyKey })
}
export function updateContent(id: string, patch: Record<string, unknown>, etag: string | number) {
  return request<BackendContent>(`/contents/${id}`, { method: 'PATCH', json: patch, ifMatch: etag })
}
export function updateVariant(id: string, platform: BackendPlatform, input: { copy: string; cta: string; hashtags: string; visualRecommendation: string }, etag: string | number) {
  return request<BackendContent>(`/contents/${id}/variants/${platform}`, { method: 'PUT', json: input, ifMatch: etag })
}
export function progressContent(id: string, stage: 'adapted' | 'creative_in_progress' | 'ready_for_review', etag: string | number) {
  return request<BackendContent>(`/contents/${id}/progress`, { method: 'POST', json: { stage }, ifMatch: etag })
}
export function generateContent(id: string, etag: string | number, idempotencyKey = createRequestKey('content.generate')) {
  return request<{ content: BackendContent; request: unknown }>(`/contents/${id}/generate`, { method: 'POST', json: {}, ifMatch: etag, idempotencyKey })
}
export function adaptContent(id: string, platform: BackendPlatform, etag: string | number, idempotencyKey = createRequestKey(`content.adapt.${platform}`)) {
  return request<{ content: BackendContent; request: unknown }>(`/contents/${id}/adapt`, { method: 'POST', json: { platform }, ifMatch: etag, idempotencyKey })
}
export function brandCheckContent(id: string, platform: BackendPlatform, etag: string | number, idempotencyKey = createRequestKey(`content.brand-check.${platform}`)) {
  return request<{ content: BackendContent; request: unknown }>(`/contents/${id}/brand-check`, { method: 'POST', json: { platform }, ifMatch: etag, idempotencyKey })
}
export function recordOverride(id: string, input: { platform: BackendPlatform; assessmentId: string; justification: string }, etag: string | number, idempotencyKey = createRequestKey(`content.override.${input.platform}`)) {
  return request<{ action: BackendApprovalAction; content: BackendContent }>(`/contents/${id}/override`, { method: 'POST', json: input, ifMatch: etag, idempotencyKey })
}
export function approveContent(id: string, checklist: BackendApprovalAction['checklist'], etag: string | number, idempotencyKey = createRequestKey('content.approve')) {
  return request<{ action: BackendApprovalAction; content: BackendContent }>(`/contents/${id}/approve`, { method: 'POST', json: { checklist }, ifMatch: etag, idempotencyKey })
}
export function requestRevision(id: string, reason: string, etag: string | number, idempotencyKey = createRequestKey('content.request-revision')) {
  return request<{ action: BackendApprovalAction; content: BackendContent }>(`/contents/${id}/request-revision`, { method: 'POST', json: { reason }, ifMatch: etag, idempotencyKey })
}
export function duplicateContent(id: string, etag: string | number, idempotencyKey = createRequestKey('content.duplicate')) { return request<BackendContent>('/contents/' + id + '/duplicate', { method: 'POST', json: {}, ifMatch: etag, idempotencyKey }) }
export function archiveContent(id: string, etag: string | number) { return request<BackendContent>('/contents/' + id + '/archive', { method: 'POST', json: {}, ifMatch: etag }) }
export function listContentEvents(id: string) { return request<BackendEvent[]>(`/contents/${id}/events?limit=100`) }
export function listReviewActions(id: string) { return request<BackendApprovalAction[]>(`/contents/${id}/review-actions?limit=100`) }
