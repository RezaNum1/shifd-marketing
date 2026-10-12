import { request } from './client'

export interface IndustryIdea {
  title: string; angle: string; hook: string; targetAudience: string; talkingPoints: string[]
  industryRelevance: string; capability: string; format: string; platform: string | null; softCta: string
  evidence: Array<{ claim: string; sources: Array<{ title: string; url: string }> }>
}
export interface IndustryIdeationInput { industry: string | null; prospectId: string | null; productId: string | null; audience: string | null; objective: string; guidance: string | null }
export function generateIndustryIdeas(input: IndustryIdeationInput) { return request<{ ideas: IndustryIdea[]; context: { industry: string | null; prospect: { id: string; name: string } | null; product: { id: string; name: string } | null; objective: string }; usage: { inputTokens: number | null; outputTokens: number | null } }>('/ideas/industry-ideation', { method: 'POST', json: input }) }
