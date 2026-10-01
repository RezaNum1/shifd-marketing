export type DiscoveryTimeframe = 'last_7_days' | 'last_30_days'

export interface TopicDiscoverySource {
  url: string
  title: string
  publisher: string | null
  publishedAt: string | null
  observedAt: string
}

export interface TopicCandidate {
  id: string
  position: number
  title: string
  summary: string
  whyCurrent: string
  relevanceToCompany: string
  contentAngle: string
  suggestedObjective: string
  suggestedPlatforms: Array<'instagram' | 'linkedin'>
  sources: TopicDiscoverySource[]
  selectedAt: string | null
  createdIdeaId: string | null
  createdAt: string
}

export interface TopicDiscoveryRun {
  id: string
  companyId: string
  productId: string | null
  market: 'ID'
  timeframe: DiscoveryTimeframe
  focus: string | null
  status: string
  searchedAt: string
  createdAt: string
  candidates: TopicCandidate[]
}
