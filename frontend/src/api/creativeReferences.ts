import { createRequestKey, request } from './client'
import type { BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceFormat, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from '../types/backend'

export interface CreativeReferenceInput {
  platform: CreativeReferencePlatform
  format: CreativeReferenceFormat
  slideCount: number
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
  sourceBatchId?: string | null
  lockedSlideNumbers?: number[]
}

export function listCreativeReferences(contentId: string) {
  return request<{ batches: BackendCreativeReferenceBatch[] }>(`/contents/${contentId}/creative-references`)
}

export function createCreativeReferences(contentId: string, input: CreativeReferenceInput, idempotencyKey = createRequestKey('creative-references.create')) {
  return request<{ batch: BackendCreativeReferenceBatch }>(`/contents/${contentId}/creative-references`, { method: 'POST', json: input, idempotencyKey })
}

export function selectCreativeReference(contentId: string, referenceId: string) {
  return request<BackendCreativeReferenceBatch>(`/contents/${contentId}/creative-references/${referenceId}/select`, { method: 'POST', json: {} })
}

export function reviseCreativeReference(contentId: string, referenceId: string, instruction: string) {
  return request<BackendCreativeReferenceBatch>(`/contents/${contentId}/creative-references/${referenceId}/revise`, { method: 'POST', json: { instruction }, idempotencyKey: createRequestKey('creative-references.revise') })
}
