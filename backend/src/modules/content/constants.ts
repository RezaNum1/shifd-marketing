import { OBJECTIVES, PLATFORMS } from '../context/constants.js'

export const IDEA_CONTEXT_TYPES = ['company', 'product'] as const
export const IDEA_STATUSES = ['ready', 'used', 'archived'] as const
export const CONTENT_STAGES = ['draft', 'generated', 'adapted', 'creative_in_progress', 'ready_for_review', 'needs_revision'] as const
export const PROGRESS_STAGES = ['adapted', 'creative_in_progress', 'ready_for_review'] as const
export const DESIGN_STATUSES = ['not_started', 'in_progress', 'ready'] as const
export const PLATFORM_CODES = PLATFORMS.map((platform) => platform.code) as ['instagram', 'linkedin']
export const OBJECTIVE_CODES = OBJECTIVES

export type IdeaContextType = typeof IDEA_CONTEXT_TYPES[number]
export type IdeaStatus = typeof IDEA_STATUSES[number]
export type ContentStage = typeof CONTENT_STAGES[number]
export type ProgressStage = typeof PROGRESS_STAGES[number]
export type DesignStatus = typeof DESIGN_STATUSES[number]
export type PlatformCode = typeof PLATFORM_CODES[number]
export type ObjectiveCode = typeof OBJECTIVE_CODES[number]
