import { request } from './client'
import type { BackendInquiryMetric, BackendPerformanceReport, BackendPublicationFeedItem, BackendOverviewReport, BackendWeeklyMetric } from '../types/backend'
import type { MarketingEvaluationDashboard } from '../types/performance'

export function getPerformance(weeks: 4 | 8 | 12, platform: 'combined' | 'instagram' | 'linkedin') {
  return request<BackendPerformanceReport>(`/performance?weeks=${weeks}&platform=${platform}`)
}
export function getEvaluation() { return request<MarketingEvaluationDashboard>('/evaluation') }
export function saveEvaluation(input: { startDate: string; timezone?: string; definitions?: { customNotes?: string } }) { return request<MarketingEvaluationDashboard['evaluation']>('/evaluation', { method: 'PUT', json: input }) }
export function recordEvaluationSnapshot(id: string, input: Record<string, unknown>) { return request(`/evaluation/${id}/snapshots`, { method: 'POST', json: input }) }
export function listBusinessInquiries(page = 1) { return request(`/business-inquiries?page=${page}&limit=100`) }
export function createBusinessInquiry(input: Record<string, unknown>) { return request('/business-inquiries', { method: 'POST', json: input }) }
export function createProductionTime(input: { contentId: string; minutes: number; occurredAt?: string; notes?: string }) { return request('/production-time', { method: 'POST', json: input }) }
export function getOverview() { return request<BackendOverviewReport>('/overview') }
export function listPublications(cursor?: string) { const query = new URLSearchParams({ limit: '100' }); if (cursor) query.set('cursor', cursor); return request<BackendPublicationFeedItem[]>(`/publications?${query.toString()}`) }
export function listLinkedInMetrics() { return request<BackendWeeklyMetric[]>('/metrics/linkedin?limit=100') }
export function listInquiryMetrics() { return request<BackendInquiryMetric[]>('/metrics/inquiries?limit=100') }
export function createLinkedInMetric(input: Record<string, unknown>) { return request<BackendWeeklyMetric>('/metrics/linkedin', { method: 'POST', json: input }) }
export function updateLinkedInMetric(id: string, input: Record<string, unknown>, etag: string | number) { return request<BackendWeeklyMetric>(`/metrics/linkedin/${id}`, { method: 'PUT', json: input, ifMatch: etag }) }
export function createInquiryMetric(input: Record<string, unknown>) { return request<BackendInquiryMetric>('/metrics/inquiries', { method: 'POST', json: input }) }
export function updateInquiryMetric(id: string, input: Record<string, unknown>, etag: string | number) { return request<BackendInquiryMetric>(`/metrics/inquiries/${id}`, { method: 'PUT', json: input, ifMatch: etag }) }
