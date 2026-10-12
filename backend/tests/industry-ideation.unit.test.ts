import { describe, expect, it } from 'vitest'
import { parseIndustryIdeationInput, parseIndustryIdeas } from '../src/modules/ideas/industry-ideation.js'

const idea = (index: number, url = 'https://example.id/company') => ({
  title: `Practical workflow idea ${index}`, angle: 'Explain a practical approval flow.', hook: 'What happens after a request is sent?', targetAudience: 'Operations leaders',
  talkingPoints: ['Map the request', 'Clarify review ownership'], industryRelevance: 'A general process discussion for the selected sector.', capability: 'Shifd Approval workflow', format: 'Carousel', platform: 'LinkedIn', softCta: 'Explore a clearer approval workflow.', evidence: [{ claim: 'A supplied fact', sources: [{ title: 'Company overview', url }] }],
})

describe('industry content ideation input and output', () => {
  it('supports general generation without a prospect or industry', () => {
    expect(parseIndustryIdeationInput({ objective: 'brand_awareness' })).toEqual({ industry: null, prospectId: null, productId: null, audience: null, objective: 'brand_awareness', guidance: null })
  })

  it('accepts custom industry targeting with an optional prospect', () => {
    const input = parseIndustryIdeationInput({ industry: 'Cold-chain logistics', prospectId: '123e4567-e89b-42d3-a456-426614174000', objective: 'industry_education' })
    expect(input).toMatchObject({ industry: 'Cold-chain logistics', prospectId: '123e4567-e89b-42d3-a456-426614174000', objective: 'industry_education' })
  })

  it('rejects unsupported objectives and malformed ideas', () => {
    expect(() => parseIndustryIdeationInput({ objective: 'publish_automatically' })).toThrow()
    expect(() => parseIndustryIdeas('{bad json')).toThrow()
    expect(() => parseIndustryIdeas(JSON.stringify({ ideas: [idea(1)] }))).toThrow()
  })

  it('parses 3–5 ideas and preserves only evidence URLs approved for this prospect', () => {
    const source = 'https://example.id/company'
    const mismatchedClaim = { ...idea(3, source), evidence: [{ claim: 'An invented company claim', sources: [{ title: 'Company overview', url: source }] }] }
    const parsed = parseIndustryIdeas(JSON.stringify({ ideas: [idea(1, source), idea(2, 'https://invented.test/fact'), mismatchedClaim] }), new Map([[source, [{ claim: 'A supplied fact', title: 'Reviewed source title' }]]]))
    expect(parsed).toHaveLength(3)
    expect(parsed[0]?.evidence[0]?.sources).toEqual([{ title: 'Reviewed source title', url: source }])
    expect(parsed[1]?.evidence).toEqual([])
    expect(parsed[2]?.evidence).toEqual([])
  })
})
