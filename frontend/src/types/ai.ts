export type AiModule = 'M2' | 'M3' | 'M4'
export type AiOperation = 'Content Generation' | 'Platform Adaptation' | 'Brand Consistency Check'
export type AiRequestStatus = 'Success' | 'Failed'
export type PromptVersionStatus = 'Active' | 'Retired'

export interface AiSettings {
  provider: string
  model: string
  generationLanguage: 'English' | 'Indonesian'
  mode?: 'real' | 'demo'
  status?: string
  systemStatus?: {
    contextEngine: string
    promptConfiguration: string
    aiConfiguration: string
  }
  version?: number
}

export interface PromptVersion {
  id: string
  module: AiModule
  operation: AiOperation
  version: string
  status: PromptVersionStatus
  updatedAt: string
}

export interface AiRequestLog {
  id: string
  module: AiModule
  operation: AiOperation
  contentId?: string
  provider: string
  model: string
  promptVersion: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  latencyMs?: number
  status: AiRequestStatus
  createdAt: string
}
