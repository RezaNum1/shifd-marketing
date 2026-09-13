import type { ContentStage } from './constants.js'

export type LifecycleStatus = 'Draft' | 'Generated' | 'Adapted' | 'Creative In Progress' | 'Ready for Review' | 'Needs Revision' | 'Archived'
export type ResumeStep = 'brief' | 'generate' | 'adapt' | 'creative' | 'review' | null
export type AdaptationState = 'missing' | 'current' | 'needs_adaptation'

export function deriveLifecycleStatus(input: { archivedAt: Date | string | null; editorialStage: string }): LifecycleStatus {
  if (input.archivedAt) return 'Archived'
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

export function deriveResumeStep(input: { archivedAt: Date | string | null; editorialStage: string }): ResumeStep {
  if (input.archivedAt) return null
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
