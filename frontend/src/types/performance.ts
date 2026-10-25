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
  impressions: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  /** Backend-calculated engagement total and rate for this account-week. */
  engagements?: number | null
  engagementRate?: number | null
  nativeEngagementRate?: number | null
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

export interface MarketingEvaluationDashboard {
  evaluation: {
    id: string
    revision: number
    startDate: string
    timezone: string
    definitions: Record<string, unknown>
    createdAt: string
    snapshots: Array<{ id: string; stage: 'week0' | 'week4'; capturedAt: string; measurements: Record<string, number | null>; source: string; notes: string | null; recordedBy: string }>
  } | null
  periods: { baseline: { start: string; endExclusive: string }; intervention: { start: string; endExclusive: string } } | null
  progress: { elapsedDays: number; elapsedPercent: number; complete: boolean }
  completeness: { status: 'not_configured' | 'not_started' | 'partial' | 'complete'; sources: Array<{ source: string; status: string; records: number }> }
  baseline: EvaluationPeriodSummary | null
  intervention: EvaluationPeriodSummary | null
  comparison: Array<{ kpi: string; baseline: number | null; intervention: number | null; absoluteChange: number | null; percentageChange: number | null; status: string; source: string; sourceRecordIds?: string[] }>
  inquiries: Array<{ id: string; receivedAt: string; channel: string; companyName: string | null; summary: string; relevance: string; source: string; sourceReference: string | null; prospect: { id: string; name: string; industry: string | null } | null; recordedBy: string; createdAt: string }>
  historicalOutbound: { emailsSent: number; followUpsCompleted: number; repliesReceived: number; interestedResponses: number; meetings: number; demonstrations: number; approachedCompanies: number; provenance: { historical: number; artifactAssisted: number; nonArtifactAssisted: number }; sourceRecordIds: string[] }
}

export interface CustomEvaluationRange {
  range: { startDate: string; endDate: string; endExclusive: string; days: number; timezone: string }
  totals: {
    publishedPosts: number; instagram: number; linkedin: number; uniqueContentCampaigns: number; prospectLinkedPublications: number
    emailsSent: number; followUpsCompleted: number; repliesReceived: number; interestedResponses: number; meetings: number
    demonstrations: number; otherActivities: number; outboundActivities: number; prospectsContacted: number
  }
  weekly: Array<{
    startDate: string; endDate: string; publishedPosts: number; instagram: number; linkedin: number
    outboundActivities: number; emailsSent: number; followUpsCompleted: number; repliesReceived: number
    interestedResponses: number; meetings: number; demonstrations: number; otherActivities: number; prospectsContacted: number
  }>
  publications: Array<{
    id: string; title: string; contentId: string; platform: string; publishedAt: string; targetIndustry: string | null; targetProspectId: string | null
    metrics: PublicationMetricValues | null
    metricHistory: Array<{ observedAt: string } & PublicationMetricValues>
  }>
  outboundActivities: Array<{ id: string; prospectId: string; prospectName: string; activityType: string; status: string; occurredAt: string | null; responseClassification: string | null }>
}

export interface PublicationMetricValues {
  views: string | null; reach: string | null; likes: string | null; comments: string | null
  saves: string | null; shares: string | null; totalInteractions: string | null
}

export interface EvaluationPeriodSummary {
  period: { start: string; endExclusive: string; days: number; status: 'complete' | 'partial' | 'not_started' }
  publications: { total: number; byPlatform: { instagram: number; linkedin: number }; campaigns: number; targeting: { industryTargeted: number; prospectLinked: number; industryOnly: number; general: number; byIndustry: Record<string, number> }; records: Array<Record<string, unknown>>; source: string; sourceRecordIds: string[] }
  schedules: { planned: number; cancelled: number }
  cadence: Record<'instagram' | 'linkedin', { platform: string; weeklyCounts: number[]; total: number; targetPerWeek: number; weeksMeetingTarget: number; cadenceComplianceRate: number | null; meanWeeklyPosts: number; coefficientOfVariation: number | null; status: string; source: string }>
  social: Record<'instagram' | 'linkedin', { weeklyAccountObservations: Array<Record<string, unknown>>; postObservations: Array<Record<string, unknown>> }>
  inquiries: { relevant: number; unreviewed: number; totalRecorded: number; byChannel: Record<string, number>; weekly: Array<{ weekStart: string; relevant: number; recorded: number }>; source: string; sourceRecordIds: string[]; records: Array<Record<string, unknown>> }
  outbound: { emailsSent: number; followUpsCompleted: number; repliesReceived: number; interestedResponses: number; meetings: number; demonstrations: number; approachedCompanies: number; provenance: { historical: number; artifactAssisted: number; nonArtifactAssisted: number }; source: string; sourceRecordIds: string[]; sourceObservations: Array<Record<string, unknown>> }
  productionTime: { count: number; median: number | null; minimum: number | null; maximum: number | null; observations: number[]; status: string; sourceRecordIds: string[]; sourceObservations: Array<{ id: string; contentId: string; minutes: number; occurredAt: string; recordedAt: string; recordedBy: string }> }
}
