import type { ContentStage } from './constants.js'

export type LifecycleStatus = 'Draft' | 'Generated' | 'Adapted' | 'Creative In Progress' | 'Ready for Review' | 'Needs Revision' | 'Approved' | 'Scheduled' | 'Published' | 'Archived'
export type ResumeStep = 'brief' | 'generate' | 'adapt' | 'creative' | 'review' | 'schedule' | null
export type AdaptationState = 'missing' | 'current' | 'needs_adaptation'

export function deriveLifecycleStatus(input: {
  archivedAt: Date | string | null
  editorialStage: string
  allEnabledVariantsPublished?: boolean
  hasActiveUnpublishedSchedule?: boolean
}, approvalValid = false): LifecycleStatus {
  if (input.archivedAt) return 'Archived'
  if (input.allEnabledVariantsPublished) return 'Published'
  if (input.hasActiveUnpublishedSchedule) return 'Scheduled'
  if (approvalValid) return 'Approved'
  const stages: Record<ContentStage, LifecycleStatus> = {
    draft: 'Draft',
    generated: 'Generated',
    adapted: 'Adapted',
    creative_in_progress: 'Creative In Progress',
    ready_for_review: 'Ready for Review',
    needs_revision: 'Needs Revision',
  }
  return stages[input.editorialStage as ContentStage] ?? 'Draft'
}

export function deriveResumeStep(input: {
  archivedAt: Date | string | null
  editorialStage: string
  allEnabledVariantsPublished?: boolean
  hasActiveUnpublishedSchedule?: boolean
}, approvalValid = false): ResumeStep {
  if (input.archivedAt) return null
  if (input.allEnabledVariantsPublished) return null
  if (input.hasActiveUnpublishedSchedule) return 'schedule'
  if (approvalValid) return 'schedule'
  const steps: Record<ContentStage, Exclude<ResumeStep, null>> = {
    draft: 'brief',
    generated: 'generate',
    adapted: 'adapt',
    creative_in_progress: 'creative',
    ready_for_review: 'review',
    needs_revision: 'review',
  }
  return steps[input.editorialStage as ContentStage] ?? 'brief'
}

export function hasCompleteVariantCopy(input: { copy: string | null; cta: string | null; hashtags: string | null; visualRecommendation: string | null }): boolean {
  return [input.copy, input.cta, input.hashtags, input.visualRecommendation].every((value) => Boolean(value?.trim()))
}

export function deriveAdaptationState(input: {
  copy: string | null
  cta: string | null
  hashtags: string | null
  visualRecommendation: string | null
  adaptedFromMasterRevision: number | null
  masterRevision: number
  hasMaster: boolean
}): AdaptationState {
  if (!hasCompleteVariantCopy(input) || !input.hasMaster) return 'missing'
  return input.adaptedFromMasterRevision === input.masterRevision ? 'current' : 'needs_adaptation'
}
