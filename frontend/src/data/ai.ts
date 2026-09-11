import type { AiRequestLog, PromptVersion } from '../types/ai'

export const mockPromptVersions: PromptVersion[] = [
  { id: 'prompt-m2-v1', module: 'M2', operation: 'Content Generation', version: 'v1.0', status: 'Active', updatedAt: 'Sep 9, 2026' },
  { id: 'prompt-m3-v1', module: 'M3', operation: 'Platform Adaptation', version: 'v1.0', status: 'Active', updatedAt: 'Sep 9, 2026' },
  { id: 'prompt-m4-v1', module: 'M4', operation: 'Brand Consistency Check', version: 'v1.0', status: 'Active', updatedAt: 'Sep 9, 2026' },
]

export const mockAiRequestLogs: AiRequestLog[] = [
  { id: 'request-1', module: 'M2', operation: 'Content Generation', contentId: 'content-digital-approval', provider: 'Claude', model: 'Claude Sonnet', promptVersion: 'v1.0', inputTokens: 1820, outputTokens: 980, estimatedCostUsd: 0.02, latencyMs: 840, status: 'Success', createdAt: 'Sep 9, 2026 · 21:55' },
  { id: 'request-2', module: 'M3', operation: 'Platform Adaptation', contentId: 'content-digital-approval', provider: 'Claude', model: 'Claude Sonnet', promptVersion: 'v1.0', inputTokens: 1240, outputTokens: 620, estimatedCostUsd: 0.01, latencyMs: 620, status: 'Success', createdAt: 'Sep 9, 2026 · 22:02' },
  { id: 'request-3', module: 'M4', operation: 'Brand Consistency Check', contentId: 'content-digital-approval', provider: 'Claude', model: 'Claude Sonnet', promptVersion: 'v1.0', inputTokens: 960, outputTokens: 240, estimatedCostUsd: 0.01, latencyMs: 410, status: 'Success', createdAt: 'Sep 9, 2026 · 22:18' },
]
