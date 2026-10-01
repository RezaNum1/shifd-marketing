import { createRequestKey, request } from './client'
import type { BackendIdea } from '../types/backend'

export interface IdeaInput {
  title: string
  contextType: 'company' | 'product'
  productId?: string | null
  pillarCode: string
  objective: string
  targetAudience?: string | null
  notes?: string | null
}

export function listIdeas() { return request<BackendIdea[]>('/content-ideas?limit=100') }
export function createIdea(input: IdeaInput, idempotencyKey = createRequestKey('idea.create')) { return request<BackendIdea>('/content-ideas', { method: 'POST', json: input, idempotencyKey }) }
export function updateIdea(id: string, input: IdeaInput, etag: string | number) { return request<BackendIdea>(`/content-ideas/${id}`, { method: 'PUT', json: input, ifMatch: etag }) }
export function duplicateIdea(id: string, etag: string | number, idempotencyKey = createRequestKey('idea.duplicate')) { return request<BackendIdea>(`/content-ideas/${id}/duplicate`, { method: 'POST', json: {}, ifMatch: etag, idempotencyKey }) }
export function archiveIdea(id: string, etag: string | number) { return request<BackendIdea>(`/content-ideas/${id}/archive`, { method: 'POST', json: {}, ifMatch: etag }) }
export function restoreIdea(id: string, etag: string | number) { return request<BackendIdea>(`/content-ideas/${id}/restore`, { method: 'POST', json: {}, ifMatch: etag }) }
export function deleteIdea(id: string, etag: string | number) { return request<void>(`/content-ideas/${id}`, { method: 'DELETE', json: {}, ifMatch: etag }) }
