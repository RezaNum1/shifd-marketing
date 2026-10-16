import { createRequestKey, request } from './client'
import type { BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceFact, CreativeReferenceFormat, CreativeReferenceGenerationMode, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from '../types/backend'

export interface CreativeReferenceInput {
  generationMode?: CreativeReferenceGenerationMode
  platform: CreativeReferencePlatform
  format: CreativeReferenceFormat
  slideCount: number
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
  selectedFacts?: CreativeReferenceFact[]
}

export function discoverCreativeReferenceFacts(contentId: string, concern = '') {
  return request<{ facts: CreativeReferenceFact[]; researchedAt: string }>(`/contents/${contentId}/creative-reference-facts`, { method: 'POST', json: { concern } })
}

export function listCreativeReferences(contentId: string) {
  return request<{ batches: BackendCreativeReferenceBatch[]; canvaReadyAvailable: boolean }>(`/contents/${contentId}/creative-references`)
}

export function createCreativeReferences(contentId: string, input: CreativeReferenceInput, idempotencyKey = createRequestKey('creative-references.create')) {
  return request<{ batch: BackendCreativeReferenceBatch }>(`/contents/${contentId}/creative-references`, { method: 'POST', json: input, idempotencyKey })
}

export function selectCreativeReference(contentId: string, referenceId: string) {
  return request<BackendCreativeReferenceBatch>(`/contents/${contentId}/creative-references/${referenceId}/select`, { method: 'POST', json: {} })
}
