import { createRequestKey, request } from './client'
import type { BackendAsset, BackendContent, BackendPlatform } from '../types/backend'

export function uploadAsset(file: File, purpose: 'creative' | 'metric_evidence' = 'creative', idempotencyKey = createRequestKey('asset.upload')) {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', purpose)
  return request<BackendAsset>('/assets', { method: 'POST', json: form, idempotencyKey })
}

export function attachAssets(contentId: string, platform: BackendPlatform, assetIds: string[], etag: string | number) {
  return request<BackendContent>(`/contents/${contentId}/variants/${platform}/assets`, { method: 'PUT', json: { assetIds }, ifMatch: etag })
}

export function setCreativeReuse(contentId: string, reuseInstagramCreative: boolean, etag: string | number) {
  return request<BackendContent>(`/contents/${contentId}/variants/linkedin/creative-reuse`, { method: 'PUT', json: { reuseInstagramCreative }, ifMatch: etag })
}

export function deleteAsset(id: string) { return request<undefined>(`/assets/${id}`, { method: 'DELETE' }) }
