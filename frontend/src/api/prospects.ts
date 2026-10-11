import { request } from './client'
import type { Prospect, ProspectInput, ProspectImportField, ProspectImportPreview, ProspectResearchRun, ProspectResearchHistoryItem, ProspectEmailDraft, ProspectEmailDraftInput, ProspectEmailDraftListItem, ProspectOutreachFact } from '../types/prospect'

export function listProspects(query: URLSearchParams) { return request<Prospect[]>('/prospects?' + query.toString()) }
export function getProspect(id: string) { return request<Prospect>(`/prospects/${id}`) }
export function createProspect(input: ProspectInput) { return request<Prospect>('/prospects', { method: 'POST', json: input }) }
export function updateProspect(id: string, input: ProspectInput, version: number) { return request<Prospect>(`/prospects/${id}`, { method: 'PUT', json: input, ifMatch: version }) }
export function archiveProspect(id: string, version: number) { return request<Prospect>(`/prospects/${id}/archive`, { method: 'POST', json: {}, ifMatch: version }) }
export function startProspectResearch(id: string) { return request<ProspectResearchRun>(`/prospects/${id}/research`, { method: 'POST', json: {} }) }
export function listProspectResearch(id: string) { return request<ProspectResearchHistoryItem[]>(`/prospects/${id}/research-runs`) }
export function getProspectResearch(id: string, runId: string) { return request<ProspectResearchRun>(`/prospects/${id}/research-runs/${runId}`) }
export function reviewProspectResearchClaim(id: string, claimId: string, status: 'approved' | 'rejected', note: string | null) { return request(`/prospects/${id}/research-claims/${claimId}/review`, { method: 'PUT', json: { status, note } }) }
export function listProspectEmailDrafts(id: string) { return request<ProspectEmailDraftListItem[]>(`/prospects/${id}/outreach-drafts`) }
export function getProspectEmailDraft(id: string, draftId: string) { return request<ProspectEmailDraft>(`/prospects/${id}/outreach-drafts/${draftId}`) }
export function createProspectEmailDraft(id: string, input: ProspectEmailDraftInput) { return request<ProspectEmailDraft>(`/prospects/${id}/outreach-drafts`, { method: 'POST', json: input }) }
export function updateProspectEmailDraft(id: string, draftId: string, input: Pick<ProspectEmailDraftInput, 'subject' | 'body' | 'recipientName' | 'recipientEmail'>) { return request<ProspectEmailDraft>(`/prospects/${id}/outreach-drafts/${draftId}`, { method: 'PUT', json: input }) }
export function archiveProspectEmailDraft(id: string, draftId: string) { return request<{ id: string; status: 'archived' }>(`/prospects/${id}/outreach-drafts/${draftId}/archive`, { method: 'POST', json: {} }) }
export function getProspectOutreachFacts(id: string) { return request<ProspectOutreachFact[]>(`/prospects/${id}/outreach-facts`) }
export function generateProspectEmailDraft(id: string, input: { objective: string; offering: string; tone: string; language: 'English' | 'Indonesian'; customInstructions?: string; claimIds: string[] }) { return request<{ subject: string; body: string; generationId: string; claims: ProspectOutreachFact[]; usage: { inputTokens: number | null; outputTokens: number | null } }>(`/prospects/${id}/outreach-drafts/generate`, { method: 'POST', json: input }) }
export function previewProspectImport(file: File, mapping?: Partial<Record<ProspectImportField, number | ''>>) {
  const form = new FormData(); form.append('file', file)
  if (mapping) form.append('headerMap', JSON.stringify(mapping))
  return request<ProspectImportPreview>('/prospects/import/preview', { method: 'POST', json: form })
}
export function confirmProspectImport(previewToken: string, selectedRowNumbers: number[]) {
  return request<{ selected: number; imported: number; duplicates: number; invalid: number; ambiguous: number; skipped: { rowNumber: number; reason: string }[]; prospects: Prospect[] }>('/prospects/import/confirm', { method: 'POST', json: { confirmed: true, previewToken, selectedRowNumbers } })
}
