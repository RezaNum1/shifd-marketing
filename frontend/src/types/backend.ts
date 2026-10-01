export type BackendContextType = 'company' | 'product'
export type BackendPlatform = 'instagram' | 'linkedin'
export type BackendIdeaStatus = 'ready' | 'used' | 'archived'
export type BackendProductStatus = 'active' | 'inactive' | 'draft'
export type BackendContentStage = 'draft' | 'generated' | 'adapted' | 'creative_in_progress' | 'ready_for_review' | 'needs_revision'
export type BackendContentLifecycle = 'Draft' | 'Generated' | 'Adapted' | 'Creative In Progress' | 'Ready for Review' | 'Needs Revision' | 'Approved' | 'Scheduled' | 'Published' | 'Archived'
export type BackendAssessmentStatus = 'aligned' | 'needs_attention'
export type BackendAssessmentFreshness = 'current' | 'stale'
export type BackendDesignStatus = 'not_started' | 'in_progress' | 'ready'

export interface ApiPage {
  limit: number
  nextCursor: string | null
}

export interface ApiEnvelope<T> {
  data: T
}

export interface BackendUser {
  id: string
  name: string
  email: string
  role: string
}

export interface AuthPayload {
  user: BackendUser
  csrfToken: string
  expiresAt: string
}

export interface BackendCompanyProfile {
  name: string
  description: string
  industry: string | null
  businessTypes: string[]
  primaryMarket: string | null
  website: string | null
  mission: string | null
  vision: string | null
  positioning: string | null
  coreValueProposition: string | null
  differentiators: string[]
  customerSegments: string[]
  decisionMakers: string[]
  painPoints: string[]
}

export interface BackendBrandProfile {
  brandVoice: string | null
  toneDescription: string | null
  preferredLanguage: string
  communicationGuidelines: string[]
  preferredTerms: string[]
  thingsToAvoid: string[]
  ctaStyle: string | null
  brandKeywords: string[]
}

export interface BackendBmcBlock {
  id: string
  type: string
  title: string
  entries: string[]
  createdAt: string
  updatedAt: string
  version: number
}

export interface BackendCompanyContext {
  id: string
  profile: BackendCompanyProfile
  brand: BackendBrandProfile
  bmcBlocks: BackendBmcBlock[]
  reportingTimezone: string
  contextVersion: number
  createdAt: string
  updatedAt: string
}

export interface BackendProductProfile {
  targetUsers: string[]
  targetOrganizations: string[]
  decisionMakers: string[]
  problemsAddressed: string[]
  valueProposition: string | null
  features: string[]
  benefits: string[]
  differentiators: string[]
  useCases: string[]
  campaignObjective: string | null
  positioning: string | null
  keyMessages: string[]
  proofPoints: string[]
  defaultCta: string | null
  inheritCompanyTone: boolean
  toneOverride: string | null
}

export interface BackendProduct {
  id: string
  companyId: string
  name: string
  slug: string
  description: string
  category: string | null
  status: BackendProductStatus
  url: string | null
  profile: BackendProductProfile
  version: number
  createdAt: string
  updatedAt: string
}

export interface BackendResolvedContext {
  company: BackendCompanyContext
  product: BackendProduct | null
  resolvedBrand: {
    brandVoice: string | null
    ctaStyle: string | null
    preferredLanguage: string
  }
  toneSource: 'company' | 'product_override'
  versions: { company: number; product: number | null }
}

export interface BackendTaxonomy {
  pillars: Array<{ code: string; label: string }>
  objectives: Array<{ code: string; label: string }>
  platforms: Array<{ code: BackendPlatform; label: string }>
}

export interface BackendIdea {
  id: string
  companyId: string
  title: string
  contextType: BackendContextType
  productId: string | null
  pillarCode: string
  objective: string
  targetAudience: string | null
  notes: string | null
  sourceType?: string | null
  sourceReference?: string | null
  sourceSummary?: string | null
  status: BackendIdeaStatus
  relatedContentIds: string[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface BackendBrief {
  contextType: BackendContextType
  productId: string | null
  pillarCode: string
  objective: string
  targetAudience: string
  topic: string
  angle: string | null
  additionalInstructions: string | null
}

export interface BackendMaster {
  title: string
  coreMessage: string
  hook: string
  body: string
  cta: string
}

export interface BackendVisualDirection {
  format: string
  concept: string
  structure: string[]
  notes: string
}

export type CreativeReferencePlatform = 'instagram' | 'linkedin'
export type CreativeReferenceStyle = 'modern_minimal' | 'corporate' | 'editorial' | 'bold_typography' | 'product_ui_focused' | 'abstract_technology'
export type CreativeReferenceMood = 'professional' | 'confident' | 'approachable' | 'innovative' | 'clean'
export type CreativeReferenceAspectRatio = 'portrait_4_5' | 'square_1_1' | 'landscape'

export interface BackendCreativeReference {
  id: string
  conceptIndex: number
  conceptName: string
  rationale: string
  layoutNotes: string
  visualFocus: string
  typographyDirection: string
  imageUrl: string
  mimeType: 'image/png'
  fileSize: number
  width: number | null
  height: number | null
  selected: boolean
  selectedAt: string | null
  createdAt: string
}

export interface BackendCreativeReferenceBatch {
  id: string
  contentId: string
  platform: CreativeReferencePlatform
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  requestedAspectRatio: CreativeReferenceAspectRatio
  actualGeneratedSize: string
  additionalInstruction: string | null
  status: 'pending' | 'completed' | 'partial' | 'failed'
  createdAt: string
  completedAt: string | null
  references: BackendCreativeReference[]
}

export interface BackendAsset {
  id: string
  fileName: string
  mimeType: 'image/png' | 'image/jpeg'
  sizeBytes: number
  width: number | null
  height: number | null
  purpose: 'creative' | 'metric_evidence'
  contentUrl: string
  createdAt: string
}

export interface BackendAssetLink {
  asset: BackendAsset
  sortOrder: number
}

export interface BackendAssessmentCheck {
  label: string
  status: 'pass' | 'warning'
}

export interface BackendAssessment {
  id: string
  variantId: string
  variantRevision: number
  score: number
  status: BackendAssessmentStatus
  recommendation: string
  checks: BackendAssessmentCheck[]
  createdAt: string
  freshness: BackendAssessmentFreshness
}

export interface BackendSchedule {
  id: string
  contentId: string
  variantId: string
  platform: BackendPlatform
  scheduledAt: string
  timezone: string
  approvalActionId: string
  cancelledAt: string | null
  cancellationReason: string | null
  status: 'scheduled' | 'ready_to_publish' | 'published' | 'cancelled'
  version: number
}

export interface BackendPublication {
  id: string
  contentId: string
  variantId: string
  platform: BackendPlatform
  scheduleId: string
  scheduledAt: string
  publishedAt: string
  postUrl: string | null
  markedBy: BackendUser
  recordedAt: string
  updatedAt: string
  version: number
}

export interface BackendVariant {
  id: string
  platform: BackendPlatform
  enabled: boolean
  copy: string | null
  cta: string | null
  hashtags: string | null
  visualRecommendation: string | null
  revision: number
  adaptationState: 'missing' | 'current' | 'needs_adaptation'
  reuseCreativeFromVariantId: string | null
  ownAssets: BackendAssetLink[]
  effectiveAssets: BackendAssetLink[]
  assessment: BackendAssessment | null
  schedule: BackendSchedule | null
  publication: BackendPublication | null
}

export interface BackendApprovalAction {
  id: string
  action: 'approve' | 'request_revision' | 'override'
  actor: BackendUser
  editorialRevision: number
  variantId: string | null
  assessmentId: string | null
  justification: string | null
  checklist: {
    copyReviewed: boolean
    creativeReviewed: boolean
    visualCopyConsistent: boolean
    noErrors: boolean
    readyForPublication: boolean
  } | null
  reviewedVariants: unknown
  createdAt: string
}

export interface BackendContent {
  id: string
  companyId: string
  sourceIdeaId: string | null
  title: string
  brief: BackendBrief
  master: BackendMaster | null
  visualDirection: BackendVisualDirection | null
  designStatus: BackendDesignStatus
  variants: BackendVariant[]
  schedules: BackendSchedule[]
  publications: BackendPublication[]
  editorialStage: BackendContentStage
  editorialRevision: number
  lifecycleStatus: BackendContentLifecycle
  resumeStep: 'brief' | 'generate' | 'adapt' | 'creative' | 'review' | 'schedule' | null
  approval: BackendApprovalAction | null
  archivedAt: string | null
  version: number
  createdBy: BackendUser
  createdAt: string
  updatedAt: string
}

export interface BackendContentSummary {
  id: string
  title: string
  brief: Pick<BackendBrief, 'topic' | 'pillarCode' | 'objective'>
  company: { id: string; name: string }
  product: { id: string; name: string } | null
  enabledPlatforms: BackendPlatform[]
  lifecycleStatus: BackendContentLifecycle
  resumeStep: BackendContent['resumeStep']
  scheduleSummary: BackendSchedule[]
  publications: BackendPublication[]
  updatedAt: string
  version: number
}

export interface BackendEvent {
  id: string
  eventType: string
  variantId: string | null
  actor: BackendUser
  actorKind: string
  metadata: Record<string, unknown>
  requestId: string
  createdAt: string
}

export interface BackendAiRequest {
  id: string
  module: string
  operation: string
  contentId: string | null
  variantId: string | null
  promptVersion: BackendPromptVersion
  provider: string
  model: string
  generationLanguage: string
  mode: string
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: string | null
  latencyMs: number | null
  status: 'pending' | 'success' | 'failed' | 'stale'
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface BackendPromptVersion {
  id: string
  module: string
  operation: string
  version: string
  status: 'active' | 'retired'
  templateReference: string
  templateDigest: string
  outputSchemaVersion: string
  createdAt: string
  updatedAt: string
}

export interface BackendAiSettings {
  provider: string
  model: string
  generationLanguage: 'English' | 'Indonesian'
  mode: 'real' | 'demo'
  status: string
  systemStatus: {
    contextEngine: string
    promptConfiguration: string
    aiConfiguration: string
  }
  version: number
  updatedAt?: string
}

export interface BackendAiUsage {
  mode: string
  period: { start: string; end: string }
  requests: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: string | null
  unknownUsageRequests: number
  unknownCostRequests: number
  currency: 'USD'
}

export interface BackendCalendarEntry {
  id: string
  contentId: string
  variantId: string
  platform: BackendPlatform
  title: string
  company: { id: string; name: string }
  product: { id: string; name: string } | null
  pillarCode: string
  scheduledAt: string
  timezone: string
  status: 'scheduled' | 'ready_to_publish' | 'published'
  contentVersion: number
}

export interface BackendCalendarReport {
  start: string
  end: string
  asOf: string
  entries: BackendCalendarEntry[]
}

export interface BackendWeeklyMetric {
  id: string
  platform: BackendPlatform
  weekStart: string
  weekEnd: string
  followers: number
  reach: number | null
  impressions: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  publishedPosts: number
  source: string
  engagements?: number | null
  engagementRate?: number | null
  evidenceAsset?: BackendAsset | null
  evidence?: BackendAsset | null
  notes: string | null
  recordedBy?: BackendUser | null
  version: number
}

export interface BackendInquiryMetric {
  id: string
  weekStart: string
  weekEnd: string
  count: number
  source: string
  recordedBy: BackendUser | null
  version: number
}

export interface BackendPerformanceSummary {
  latestWeeklyReach: number | null
  impressions: number | null
  engagements: number | null
  engagementRate: number | null
  published: { explicitPosts: number; reportedPosts: number; effectivePosts: number; basis: string }
}

export interface BackendPerformanceReport {
  period: {
    basis: string
    requestedWeeks: 4 | 8 | 12
    start: string | null
    end: string | null
    recordedWeekStarts: string[]
    timezone: string
    asOf: string
  }
  platform: 'combined' | BackendPlatform
  summary: BackendPerformanceSummary
  followers: Array<{
    platform: BackendPlatform
    startObservationDate: string | null
    endObservationDate: string | null
    start: number | null
    end: number | null
    change: number | null
    changePercent: number | null
  }>
  weekly: Array<{
    weekStart: string
    weekEnd: string
    platform: 'combined' | BackendPlatform
    followers: number | null
    reach: number | null
    impressions: number | null
    engagements: number | null
    engagementRate: number | null
    source: string | null
    coverage: 'recorded' | 'missing'
  }>
  consistency: Array<{
    platform: BackendPlatform
    published: { explicitPosts: number; reportedPosts: number; effectivePosts: number; basis: string }
    targetPerWeek: number
    weeks: number
    expected: number
    percent: number
    visualPercent: number
  }>
  execution: { periodBasis: string; planned: number; publishedWithinCohort: number; pending: number; onTime: number }
  contentOutput: { basis: string; scope: string; created: number; approved: number; scheduled: number; published: number }
  inquiries: { channel: 'whatsapp'; kind: 'supplementary'; weeks: BackendInquiryMetric[] }
}

export interface BackendOverviewReport {
  asOf: string
  timezone: string
  plannedPlatformSchedules: number
  needsReviewCampaigns: number
  published: BackendPerformanceSummary['published']
  publishedPeriod: { basis: string }
  thisWeek: {
    start: string
    end: string
    consistency: BackendPerformanceReport['consistency']
  }
  performanceSnapshot: Pick<BackendPerformanceReport, 'summary' | 'followers' | 'period'>
  upcoming: BackendCalendarEntry[]
  recentlyPublished: Array<{
    publication: BackendPublication
    content: { id: string; title: string }
    platformMetricsForPublicationWeek: {
      weekStart: string
      weekEnd: string
      reach: number | null
      impressions: number | null
      engagements: number | null
      source: string
      scope: 'platform_account_week'
    } | null
    postMetrics: BackendPublicationMetrics | null
  }>
  readyToPublish: number
  ideas: { readyCount: number; latest: BackendIdea[] }
  context: { companyConfigured: boolean; brandConfigured: boolean; activeProducts: number }
}

export interface BackendPublicationFeedItem {
  publication: BackendPublication
  content: { id: string; title: string }
  platformMetricsForPublicationWeek: BackendOverviewReport['recentlyPublished'][number]['platformMetricsForPublicationWeek']
  postMetrics: BackendPublicationMetrics | null
}

export interface BackendPublicationMetrics {
  scope: 'publication'
  source: 'instagram_api'
  externalMediaId: string
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  totalInteractions: number | null
  observedAt: string
  version: number
}

export interface BackendIntegration {
  id: string
  platform: BackendPlatform | 'whatsapp'
  accountName: string | null
  status: 'connected' | 'disconnected' | 'manual'
  mode: 'demo' | 'manual' | 'api'
  currentSource: 'mock' | 'linkedin_manual' | 'instagram_api' | 'manual'
  futureSource: 'instagram_api' | null
  lastSync: string | null
  reportingTimezone: string
  version: number
}

export type BackendIntegrations = Partial<Record<'instagram' | 'linkedin' | 'whatsapp', BackendIntegration>>

export interface BackendTelegramIntegration {
  status: 'connected' | 'disconnected'
  telegramUsername: string | null
  activeProduct: { id: string; name: string } | null
  linkedAt: string | null
}
