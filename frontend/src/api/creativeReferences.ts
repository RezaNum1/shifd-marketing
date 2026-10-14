import { createRequestKey, request } from './client'
import type { BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceFormat, CreativeReferenceGenerationMode, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from '../types/backend'

export interface CreativeReferenceInput {
  generationMode?: CreativeReferenceGenerationMode
  platform: CreativeReferencePlatform
  format: CreativeReferenceFormat
  slideCount: number
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
}

export function listCreativeReferences(contentId: string) {
  return request<{ batches: BackendCreativeReferenceBatch[]; canvaReadyAvailable: boolean }>(`/contents/${contentId}/creative-references`)
}

export function createCreativeReferences(contentId: string, input: CreativeReferenceInput, idempotencyKey = createRequestKey('creative-references.create'), signal?: AbortSignal) {
  return request<{ batch: BackendCreativeReferenceBatch }>(`/contents/${contentId}/creative-references`, { method: 'POST', json: input, idempotencyKey, signal })
}

export function selectCreativeReference(contentId: string, referenceId: string) {
  return request<BackendCreativeReferenceBatch>(`/contents/${contentId}/creative-references/${referenceId}/select`, { method: 'POST', json: {} })
}
