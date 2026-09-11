import type { ContentBrief } from './content'

export type ContentIdeaStatus = 'Ready' | 'Used' | 'Archived'

export interface ContentIdeaInput {
  title: string
  contextType: ContentBrief['context']
  productId?: string
  pillar: ContentBrief['pillar']
  objective: ContentBrief['objective']
  targetAudience?: string
  notes?: string
}

export interface ContentIdea extends ContentIdeaInput {
  id: string
  status: ContentIdeaStatus
  relatedContentId?: string
  createdAt: string
  updatedAt: string
}
