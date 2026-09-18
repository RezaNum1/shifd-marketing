export type PerformancePlatform = 'instagram' | 'linkedin'
export type PerformanceSource = 'mock' | 'instagram_api' | 'linkedin_manual' | 'manual' | 'mixed'

export interface MetricEvidence {
  assetId?: string
  file?: File
  name: string
  type: 'PNG' | 'JPG' | 'JPEG'
  url: string
}

export interface WeeklyMetric {
  id: string
  platform: PerformancePlatform
  weekStart: string
  weekEnd: string
  followers: number
  reach: number | null
  impressions: number
  likes: number
  comments: number
  saves: number
  /** Backend-calculated engagement total and rate for this account-week. */
  engagements?: number
  engagementRate?: number | null
  publishedPosts: number
  source: PerformanceSource
  referenceScreenshot?: MetricEvidence
  notes?: string
  version?: number
}

export interface InboundInquiryMetric {
  id: string
  weekStart: string
  weekEnd: string
  count: number
  source: 'mock' | 'manual'
  version?: number
}

export interface PerformancePeriodOption {
  weeks: 4 | 8 | 12
  label: string
}
