export type WorkflowStep =
  | 'brief'
  | 'generate'
  | 'adapt'
  | 'creative'
  | 'review'
  | 'schedule'

export type ContentLifecycleStatus =
  | 'Draft'
  | 'Generated'
  | 'Adapted'
  | 'Creative In Progress'
  | 'Ready for Review'
  | 'Needs Revision'
  | 'Approved'
  | 'Scheduled'
  | 'Published'
  | 'Archived'

export type ContentPlatform = 'instagram' | 'linkedin'
export type ContentCalendarStatus = 'Scheduled' | 'Ready to Publish' | 'Published'

export interface ContentCalendarEntry {
  id: string
  contentId: string
  title: string
  platform: ContentPlatform
  contextName: string
  pillar: string
  scheduledDate: string
  scheduledTime: string
  scheduledAt: Date
  status: ContentCalendarStatus
}

export interface ContentAssetRecord {
  id: string
  name: string
  type: 'PNG' | 'JPG' | 'JPEG'
  order: number
  url?: string
  previewLabel?: string
}

export interface ContentHistoryEvent {
  id: string
  event: string
  platform?: ContentPlatform
  actor: string
  timestamp: string
  metadata?: string
}

export interface ContentPlatformSchedule {
  date: string
  time: string
  status: 'Scheduled'
}

export interface ContentPublication {
  publishedAt: string
  postUrl?: string
  status: 'Published'
}

/** One stable, platform-specific record of a manually confirmed publication. */
export interface PublicationRecord {
  id: string
  contentId: string
  platformVariantId: string
  platform: ContentPlatform
  scheduledAt?: string
  publishedAt: string
  postUrl?: string
  markedBy: string
}

export interface PublicationInput {
  publishedAt: string
  postUrl?: string
}

export interface ContentRecordDetails {
  angle: string
  objective: string
  audience: string
  instructions?: string
  createdBy: string
  createdAt: string
  masterContent?: MasterContent
  visualDirection?: VisualDirection
  instagram?: InstagramVariant
  linkedin?: LinkedInVariant
  creative: {
    instagram: ContentAssetRecord[]
    linkedin: ContentAssetRecord[]
    linkedinReusesInstagram: boolean
  }
  brandAssessments: Partial<Record<ContentPlatform, BrandAssessment>>
  approval?: {
    approvedBy: string
    approvedAt: string
    overrides: Partial<Record<ContentPlatform, string>>
  }
  schedules: Partial<Record<ContentPlatform, ContentPlatformSchedule>>
  publications: Partial<Record<ContentPlatform, ContentPublication>>
  history: ContentHistoryEvent[]
}

/**
 * Canonical lifecycle state for a saved campaign. The legacy top-level
 * lifecycle fields on ContentLibraryRecord are derived compatibility values
 * for existing table/seed consumers.
 */
export interface ContentLifecycleState {
  status: ContentLifecycleStatus
  workflowStep: WorkflowStep | null
  schedules: Partial<Record<ContentPlatform, ContentPlatformSchedule>>
  publications: Partial<Record<ContentPlatform, ContentPublication>>
}

export interface ContentLibraryRecord {
  ideaId?: string
  companyId: string
  productId?: string
  id: string
  title: string
  topic: string
  context: 'company' | 'product'
  pillar: string
  platforms: ContentPlatform[]
  lifecycle?: ContentLifecycleState
  /** @deprecated Use lifecycle.status or contentStatus(record). */
  status: ContentLifecycleStatus
  /** @deprecated Use lifecycle.schedules or contentSchedules(record). */
  scheduleDate?: string
  scheduleTime?: string
  /** @deprecated Use lifecycle.publications or contentPublications(record). */
  publishedAt?: string
  updatedAt: string
  /** Backend optimistic-concurrency version for this canonical record. */
  version?: number
  /** Response ETag for this canonical record. */
  etag?: string
  /** @deprecated Use lifecycle.workflowStep or workflowStepForStatus(). */
  workflowStep: WorkflowStep | null
  details: ContentRecordDetails
}

export interface ContentBrief {
  context: 'company' | 'product'
  product: string
  pillar: string
  objective: string
  audience: string
  topic: string
  thesis: string
  constraints: string
}

export interface MasterContent {
  id: string
  label: string
  title: string
  coreMessage: string
  hook: string
  body: string
  cta: string
}

export interface VisualDirection {
  format: string
  concept: string
  structure: string[]
  notes: string
}

export interface PlatformVariantBase {
  cta: string
  hashtags: string
  visualRecommendation: string
}

export interface InstagramVariant extends PlatformVariantBase {
  caption: string
  postCopy?: never
}

export interface LinkedInVariant extends PlatformVariantBase {
  postCopy: string
  caption?: never
}

export type PlatformVariant = InstagramVariant | LinkedInVariant

export interface BrandAssessmentCheck {
  label: string
  status: 'pass' | 'warning'
}

export interface BrandAssessment {
  score: number
  status: 'Aligned' | 'Needs Attention'
  recommendation: string
  checks: BrandAssessmentCheck[]
  state: 'assessed' | 'needs-recheck'
}

export interface ApprovalState {
  approved: boolean
  approvedAt: string | null
  reviewer: string | null
  checklist: {
    copyReviewed: boolean
    creativeReviewed: boolean
    visualCopyConsistent: boolean
    noErrors: boolean
    readyForPublication: boolean
  }
  overrides: {
    instagram: string
    linkedin: string
  }
}

export interface ContentSchedule {
  date: string
  time: string
  status: 'Scheduled'
}

export interface ContentWorkflowState {
  step: WorkflowStep
  brief: ContentBrief
  masterContent: MasterContent
  visualDirection: VisualDirection
  instagram: InstagramVariant
  linkedin: LinkedInVariant
  enabledPlatforms: {
    instagram: boolean
    linkedin: boolean
  }
  designStatus: 'not-started' | 'in-progress' | 'ready'
  reuseInstagramCreative: boolean
  instagramAssets: CreativeAsset[]
  linkedinAssets: CreativeAsset[]
  assessments: {
    instagram: BrandAssessment
    linkedin: BrandAssessment
  }
  approval: ApprovalState
  schedules: {
    instagram: ContentSchedule
    linkedin: ContentSchedule
  }
  scheduled: boolean
}

export interface CreativeAsset {
  id: string
  file?: File
  name: string
  url: string
}
