import { createRequestKey, request } from './client'
import type { BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from '../types/backend'

export interface CreativeReferenceInput {
  platform: CreativeReferencePlatform
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
}

export function listCreativeReferences(contentId: string) {
  return request<BackendCreativeReferenceBatch[]>(`/contents/${contentId}/creative-references`)
}

export function createCreativeReferences(contentId: string, input: CreativeReferenceInput, idempotencyKey = createRequestKey('creative-references.create')) {
  return request<{ batch: BackendCreativeReferenceBatch }>(`/contents/${contentId}/creative-references`, { method: 'POST', json: input, idempotencyKey })
}

export function selectCreativeReference(contentId: string, referenceId: string) {
  return request<BackendCreativeReferenceBatch>(`/contents/${contentId}/creative-references/${referenceId}/select`, { method: 'POST', json: {} })
}
