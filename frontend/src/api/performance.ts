import { request } from './client'
import type { BackendInquiryMetric, BackendPerformanceReport, BackendPublicationFeedItem, BackendOverviewReport, BackendWeeklyMetric } from '../types/backend'

export function getPerformance(weeks: 4 | 8 | 12, platform: 'combined' | 'instagram' | 'linkedin') {
  return request<BackendPerformanceReport>(`/performance?weeks=${weeks}&platform=${platform}`)
}
export function getOverview() { return request<BackendOverviewReport>('/overview') }
export function listPublications() { return request<BackendPublicationFeedItem[]>('/publications?limit=100') }
export function listLinkedInMetrics() { return request<BackendWeeklyMetric[]>('/metrics/linkedin?limit=100') }
export function listInquiryMetrics() { return request<BackendInquiryMetric[]>('/metrics/inquiries?limit=100') }
export function createLinkedInMetric(input: Record<string, unknown>) { return request<BackendWeeklyMetric>('/metrics/linkedin', { method: 'POST', json: input }) }
export function updateLinkedInMetric(id: string, input: Record<string, unknown>, etag: string | number) { return request<BackendWeeklyMetric>(`/metrics/linkedin/${id}`, { method: 'PUT', json: input, ifMatch: etag }) }
export function createInquiryMetric(input: Record<string, unknown>) { return request<BackendInquiryMetric>('/metrics/inquiries', { method: 'POST', json: input }) }
export function updateInquiryMetric(id: string, input: Record<string, unknown>, etag: string | number) { return request<BackendInquiryMetric>(`/metrics/inquiries/${id}`, { method: 'PUT', json: input, ifMatch: etag }) }
