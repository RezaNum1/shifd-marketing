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
