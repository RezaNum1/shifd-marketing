import { request } from './client'
import type { Prospect, ProspectInput, ProspectImportField, ProspectImportPreview, ProspectResearchRun, ProspectResearchHistoryItem } from '../types/prospect'

export function listProspects(query: URLSearchParams) { return request<Prospect[]>('/prospects?' + query.toString()) }
export function getProspect(id: string) { return request<Prospect>(`/prospects/${id}`) }
export function createProspect(input: ProspectInput) { return request<Prospect>('/prospects', { method: 'POST', json: input }) }
export function updateProspect(id: string, input: ProspectInput, version: number) { return request<Prospect>(`/prospects/${id}`, { method: 'PUT', json: input, ifMatch: version }) }
export function archiveProspect(id: string, version: number) { return request<Prospect>(`/prospects/${id}/archive`, { method: 'POST', json: {}, ifMatch: version }) }
export function startProspectResearch(id: string) { return request<ProspectResearchRun>(`/prospects/${id}/research`, { method: 'POST', json: {} }) }
export function listProspectResearch(id: string) { return request<ProspectResearchHistoryItem[]>(`/prospects/${id}/research-runs`) }
export function getProspectResearch(id: string, runId: string) { return request<ProspectResearchRun>(`/prospects/${id}/research-runs/${runId}`) }
export function reviewProspectResearchClaim(id: string, claimId: string, status: 'approved' | 'rejected', note: string | null) { return request(`/prospects/${id}/research-claims/${claimId}/review`, { method: 'PUT', json: { status, note } }) }
export function previewProspectImport(file: File, mapping?: Partial<Record<ProspectImportField, number | ''>>) {
  const form = new FormData(); form.append('file', file)
  if (mapping) form.append('headerMap', JSON.stringify(mapping))
  return request<ProspectImportPreview>('/prospects/import/preview', { method: 'POST', json: form })
}
export function confirmProspectImport(previewToken: string, selectedRowNumbers: number[]) {
  return request<{ selected: number; imported: number; duplicates: number; invalid: number; ambiguous: number; skipped: { rowNumber: number; reason: string }[]; prospects: Prospect[] }>('/prospects/import/confirm', { method: 'POST', json: { confirmed: true, previewToken, selectedRowNumbers } })
}
