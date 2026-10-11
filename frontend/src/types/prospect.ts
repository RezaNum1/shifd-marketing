export type ProspectStatus = 'lead' | 'qualified' | 'customer' | 'disqualified'
export interface Prospect {
  id: string; name: string; industry: string | null; website: string | null; address: string | null
  employeeCount: number | null; employeeSize: string | null; contactName: string | null; contactEmail: string | null
  contactPhone: string | null; notes: string | null; status: ProspectStatus; source: 'manual' | 'excel_import'
  archivedAt: string | null; createdAt: string; updatedAt: string; version: number
}
export interface ProspectInput {
  name: string; industry?: string | null; website?: string | null; address?: string | null; employeeCount?: number | null; employeeSize?: string | null
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; notes?: string | null; status?: ProspectStatus
}
export interface ProspectPage { number: number; limit: number; total: number; totalPages: number }
export type ProspectImportField = 'name' | 'industry' | 'website' | 'address' | 'employeeCount' | 'employeeSize' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes'
export interface ProspectImportRow { rowNumber: number; data: Omit<ProspectInput, 'status'> | null; errors: string[]; duplicateOf: { id?: string; name: string; archived?: boolean; rowNumber?: number }[]; status: 'valid' | 'invalid' | 'duplicate' | 'ambiguous' }
export interface ProspectImportPreview {
  previewToken: string; expiresAt: string; headers: { column: number; label: string }[]; mapping: Partial<Record<ProspectImportField, number>>
  rows: ProspectImportRow[]; summary: { total: number; valid: number; invalid: number; duplicates: number; ambiguous: number }
}
export interface ProspectResearchSource { id: string; title: string; publisher: string | null; domain: string; url: string; retrievedAt: string; sourceType: 'official' | 'external'; availability: string }
export interface ProspectResearchClaim { id: string; text: string; category: string; claimType: 'sourced_fact' | 'hypothesis'; reviewStatus: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; reviewedAt: string | null; reviewedBy: string | null; sources: Pick<ProspectResearchSource, 'id' | 'title' | 'domain' | 'url'>[] }
export interface ProspectResearchRun { id: string; prospectId: string; status: string; identityStatus: 'matched' | 'needs_confirmation'; identityExplanation: string; summary: string; limitations: string[]; researchedAt: string; createdAt: string; provider: string; model: string; usage: { inputTokens: string | null; outputTokens: string | null; estimatedCostUsd: string | null }; sources: ProspectResearchSource[]; claims: ProspectResearchClaim[] }
export interface ProspectResearchHistoryItem { id: string; status: string; identityStatus: string; summary: string; researchedAt: string; createdAt: string }
export interface ProspectOutreachFact { id: string; text: string; category: string; claimType: 'sourced_fact'; reviewStatus: 'approved'; reviewedAt: string | null; runId: string; researchedAt: string; sources: Pick<ProspectResearchSource, 'id' | 'title' | 'domain' | 'url'>[] }
export interface ProspectEmailDraftListItem { id: string; subject: string; origin: 'manual' | 'ai'; status: 'draft'; language: string; createdAt: string; updatedAt: string }
export interface ProspectEmailDraft {
  id: string; prospectId: string; recipientName: string | null; recipientEmail: string | null; subject: string; body: string
  language: 'English' | 'Indonesian'; tone: string; objective: string; offering: string; origin: 'manual' | 'ai'; status: 'draft' | 'archived'
  createdBy: string; createdAt: string; updatedAt: string; version: number
  generation: { id: string; provider: string; model: string; inputTokens: string | null; outputTokens: string | null; estimatedCostUsd: string | null } | null
  researchClaims: ProspectOutreachFact[]
}
export interface ProspectEmailDraftInput {
  subject: string; body: string; recipientName?: string | null; recipientEmail?: string | null
  language?: 'English' | 'Indonesian'; tone?: string; objective?: string; offering?: string
  origin?: 'manual' | 'ai'; generationId?: string | null; claimIds?: string[]
}
export type OutboundActivityType = 'email_sent' | 'follow_up' | 'reply_received' | 'meeting' | 'product_demonstration' | 'other'
export type OutboundProvenance = 'historical' | 'artifact_assisted' | 'non_artifact_assisted'
export type ResponseClassification = 'interested' | 'not_interested' | 'requested_information' | 'follow_up_requested' | 'meeting_requested' | 'other'
export interface OutboundActivity {
  id: string; prospectId: string; activityType: OutboundActivityType; status: 'recorded' | 'pending' | 'scheduled' | 'completed' | 'cancelled'
  occurredAt: string | null; dueAt: string | null; completedAt: string | null; contactName: string | null; contactEmail: string | null
  emailDraftId: string | null; emailDraft: { id: string; subject: string; origin: 'manual' | 'ai'; status: 'draft' | 'archived' } | null
  subject: string | null; description: string | null; responseClassification: ResponseClassification | null; provenance: OutboundProvenance
  notes: string | null; createdAt: string; updatedAt: string; archivedAt: string | null; creator: { name: string }
}
export interface OutboundActivityInput {
  activityType: OutboundActivityType; occurredAt?: string; dueAt?: string; status?: 'scheduled' | 'completed'; emailDraftId?: string | null
  contactName?: string | null; contactEmail?: string | null; subject?: string | null; description?: string | null
  responseClassification?: ResponseClassification | null; provenance: OutboundProvenance; notes?: string | null
}
export interface OutboundSummary {
  emailsSent: number; followUpsCompleted: number; repliesReceived: number; interestedResponses: number; meetings: number
  demonstrations: number; pendingFollowUps: number; overdueFollowUps: number; lastInteractionAt: string | null
}
