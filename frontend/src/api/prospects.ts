import { request, type ApiResult } from './client'
import type { Prospect, ProspectInput, ProspectImportField, ProspectImportPreview, ProspectResearchRun, ProspectResearchHistoryItem, ProspectEmailDraft, ProspectEmailDraftInput, ProspectEmailDraftListItem, ProspectEmailDraftFeedback, ProspectOutreachFact, OutboundActivity, OutboundActivityInput, OutboundSummary } from '../types/prospect'

export function listProspects(query: URLSearchParams): Promise<ApiResult<Prospect[]>> { return request<Prospect[]>('/prospects?' + query.toString()) }
export function getOutreachPeriodSummary(period: 'week' | 'month') { return request<{ period: 'week' | 'month'; start: string; approached: number; recentProspects: Array<{ id: string; name: string; approachedAt: string | null }> }>(`/outbound-activity-summary?period=${period}`) }
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
export function createProspectEmailDraftShare(id: string, draftId: string) { return request<{ token: string }>(`/prospects/${id}/outreach-drafts/${draftId}/share`, { method: 'POST', json: {} }) }
export function getPublicEmailDraft(token: string) { return request<{ subject: string; body: string }>(`/public-email-drafts/${encodeURIComponent(token)}`, { skipCsrf: true }) }
export function submitPublicEmailDraftFeedback(token: string, message: string) { return request<{ id: string; createdAt: string }>(`/public-email-drafts/${encodeURIComponent(token)}/feedback`, { method: 'POST', json: { message }, skipCsrf: true }) }
export function listProspectEmailDraftFeedback(id: string, draftId: string) { return request<ProspectEmailDraftFeedback[]>(`/prospects/${id}/outreach-drafts/${draftId}/feedback`) }
export function getProspectOutreachFacts(id: string) { return request<ProspectOutreachFact[]>(`/prospects/${id}/outreach-facts`) }
export function generateProspectEmailDraft(id: string, input: { objective: string; offering: string; tone: string; language: 'English' | 'Indonesian'; customInstructions?: string; claimIds: string[] }) { return request<{ subject: string; body: string; generationId: string; claims: ProspectOutreachFact[]; usage: { inputTokens: number | null; outputTokens: number | null } }>(`/prospects/${id}/outreach-drafts/generate`, { method: 'POST', json: input }) }
export function listProspectOutboundActivities(id: string, page = 1, limit = 100) { return request<OutboundActivity[]>(`/prospects/${id}/outbound-activities?page=${page}&limit=${limit}`) }
export function getProspectOutboundSummary(id: string) { return request<OutboundSummary>(`/prospects/${id}/outbound-activities/summary`) }
export function createProspectOutboundActivity(id: string, input: OutboundActivityInput) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities`, { method: 'POST', json: input }) }
export function getProspectOutboundActivity(id: string, activityId: string) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities/${activityId}`) }
export function updateProspectOutboundActivity(id: string, activityId: string, input: Partial<OutboundActivityInput>) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities/${activityId}`, { method: 'PUT', json: input }) }
export function completeProspectOutboundActivity(id: string, activityId: string, completedAt?: string) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities/${activityId}/complete`, { method: 'POST', json: completedAt ? { completedAt } : {} }) }
export function cancelProspectOutboundActivity(id: string, activityId: string) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities/${activityId}/cancel`, { method: 'POST', json: {} }) }
export function archiveProspectOutboundActivity(id: string, activityId: string) { return request<OutboundActivity>(`/prospects/${id}/outbound-activities/${activityId}/archive`, { method: 'POST', json: {} }) }
export function previewProspectImport(file: File, mapping?: Partial<Record<ProspectImportField, number | ''>>) {
  const form = new FormData(); form.append('file', file)
  if (mapping) form.append('headerMap', JSON.stringify(mapping))
  return request<ProspectImportPreview>('/prospects/import/preview', { method: 'POST', json: form })
}
export function confirmProspectImport(previewToken: string, selectedRowNumbers: number[]) {
  return request<{ selected: number; imported: number; duplicates: number; invalid: number; ambiguous: number; skipped: { rowNumber: number; reason: string }[]; prospects: Prospect[] }>('/prospects/import/confirm', { method: 'POST', json: { confirmed: true, previewToken, selectedRowNumbers } })
}
