export const AI_MODULE = 'M2' as const
export const AI_OPERATION = 'generate' as const
export const AI_PROVIDER = 'anthropic' as const
export const AI_LANGUAGES = ['English', 'Indonesian'] as const
export type AiLanguage = (typeof AI_LANGUAGES)[number]
export const AI_MODES = ['real', 'demo'] as const
export type AiMode = (typeof AI_MODES)[number]
export const AI_STATUSES = ['pending', 'success', 'failed', 'stale'] as const
export type AiRequestStatus = (typeof AI_STATUSES)[number]
export const PROMPT_STATUSES = ['active', 'retired'] as const
export type PromptStatus = (typeof PROMPT_STATUSES)[number]
export const OUTPUT_SCHEMA_VERSION = 'm2.generate.v1' as const
export const PROMPT_VERSION = 'v1' as const

export const AI_SETTINGS_OPERATION = 'ai-settings.update'
export const AI_GENERATE_OPERATION = 'content.generate'

