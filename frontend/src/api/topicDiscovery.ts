import { createRequestKey, request } from './client'
import type { TopicDiscoveryRun } from '../types/topicDiscovery'

export interface TopicDiscoveryInput {
  productId: string | null
  market: 'ID'
  timeframe: 'last_7_days' | 'last_30_days'
  focus: string | null
}

export function discoverTopics(input: TopicDiscoveryInput, idempotencyKey = createRequestKey('idea.discovery.web_search')) {
  return request<TopicDiscoveryRun>('/ideas/discover', { method: 'POST', json: input, idempotencyKey })
}

export function latestDiscovery() { return request<TopicDiscoveryRun | null>('/ideas/discovery-runs/latest') }
export function useTopicCandidate(id: string, idempotencyKey = createRequestKey(`topic-discovery-candidate.use:${id}`)) {
  return request<import('../types/backend').BackendIdea>(`/ideas/discovery-candidates/${id}/use`, { method: 'POST', json: {}, idempotencyKey })
}
