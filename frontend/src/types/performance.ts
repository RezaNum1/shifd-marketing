export type PerformancePlatform = 'instagram' | 'linkedin'
export type PerformanceSource = 'mock' | 'instagram_api' | 'linkedin_manual'

export interface MetricEvidence {
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
  reach: number
  impressions: number
  likes: number
  comments: number
  saves: number
  publishedPosts: number
  source: PerformanceSource
  referenceScreenshot?: MetricEvidence
  notes?: string
}

export interface InboundInquiryMetric {
  id: string
  weekStart: string
  count: number
  source: 'mock' | 'manual'
}

export interface PerformancePeriodOption {
  weeks: 4 | 8 | 12
  label: string
}
