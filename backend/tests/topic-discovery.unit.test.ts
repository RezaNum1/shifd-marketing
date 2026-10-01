import { describe, expect, it } from 'vitest'
import { parseAndValidateTopics, parseAndValidateTopicsWithDiagnostics } from '../src/modules/ideas/discovery.js'
import { companyTopicDiscoveryReadiness, productContextReadiness, productTopicDiscoveryReadiness } from '../src/modules/context/readiness.js'

const source = { url: 'https://example.com/current', title: 'Current source', publisher: 'Example', publishedAt: '2026-09-19' }
const topic = (suggestedPlatforms: string[] = ['linkedin'], url = source.url) => JSON.stringify({ topics: [{ title: 'A current topic', summary: 'A concise summary.', whyCurrent: 'Published in the requested window.', relevanceToCompany: 'Fits the company problem.', contentAngle: 'Explain the operational implication.', suggestedObjective: 'education', suggestedPlatforms, sources: [{ url, title: 'Model title', publisher: null, publishedAt: null }] }] })
const topicValue = (index: number, url = source.url, publishedAt: string | null = null) => ({ title: `A current topic ${index}`, summary: 'A concise summary.', whyCurrent: 'Published in the requested window.', relevanceToCompany: 'Fits the company problem.', contentAngle: 'Explain the operational implication.', suggestedObjective: 'education', suggestedPlatforms: ['linkedin'], sources: [{ url, title: 'Model title', publisher: null, publishedAt }] })

describe('current topic discovery output validation', () => {
  it('keeps only candidates that cite provider-returned sources', () => {
    expect(parseAndValidateTopics(topic(), [source], new Date('2026-09-20T10:00:00.000Z'))).toMatchObject([{ title: 'A current topic', sources: [{ url: source.url, observedAt: '2026-09-20T10:00:00.000Z' }] }])
    expect(parseAndValidateTopics(topic(['linkedin'], 'https://not-returned.example/topic'), [source], new Date())).toEqual([])
  })

  it('supports fewer than six candidates and a truthful empty result', () => {
    expect(parseAndValidateTopics(JSON.stringify({ topics: [] }), [source], new Date())).toEqual([])
    expect(parseAndValidateTopics(topic(), [source], new Date())).toHaveLength(1)
  })

  it.each([[['instagram']], [['linkedin']], [['instagram', 'linkedin']]])('accepts valid suggested platforms: %s', (suggestedPlatforms) => {
    expect(parseAndValidateTopics(topic(suggestedPlatforms), [source], new Date())).toHaveLength(1)
  })

  it('rejects duplicate or unsupported suggested platforms', () => {
    expect(parseAndValidateTopics(topic(['linkedin', 'linkedin']), [source], new Date())).toEqual([])
    expect(parseAndValidateTopics(topic(['linkedin', 'threads']), [source], new Date())).toEqual([])
  })

  it('rejects malformed structured output', () => {
    expect(() => parseAndValidateTopics('{bad-json', [source], new Date())).toThrow()
    expect(() => parseAndValidateTopics(JSON.stringify({}), [source], new Date())).toThrow()
  })

  it('observes an empty provider result without treating it as invalid output', () => {
    const result = parseAndValidateTopicsWithDiagnostics(JSON.stringify({ topics: [] }), [source], new Date('2026-09-20T10:00:00.000Z'))
    expect(result.topics).toEqual([])
    expect(result.diagnostics).toEqual({
      webSearchCallCount: 0,
      actionSourceCount: 0,
      citationAnnotationCount: 0,
      deduplicatedProviderSourceCount: 0,
      providerStructuredTopicCount: 0,
      providerSourceCount: 1,
      validatedTopicCount: 0,
      rejected: {
        invalidCandidateShape: 0,
        missingRequiredText: 0,
        invalidObjective: 0,
        invalidPlatform: 0,
        duplicatePlatform: 0,
        invalidSourceUrl: 0,
        noValidatedSource: 0,
      },
    })
  })

  it('observes four validated candidates when all provider sources match', () => {
    const providerSources = Array.from({ length: 4 }, (_, index) => ({ ...source, url: `https://example.com/current-${index}` }))
    const result = parseAndValidateTopicsWithDiagnostics(JSON.stringify({ topics: providerSources.map((item, index) => topicValue(index, item.url)) }), providerSources, new Date('2026-09-20T10:00:00.000Z'))
    expect(result.topics).toHaveLength(4)
    expect(result.diagnostics.providerStructuredTopicCount).toBe(4)
    expect(result.diagnostics.providerSourceCount).toBe(4)
    expect(result.diagnostics.validatedTopicCount).toBe(4)
    expect(Object.values(result.diagnostics.rejected).every((count) => count === 0)).toBe(true)
  })

  it('reports candidates rejected because their sources are absent from provider sources', () => {
    const result = parseAndValidateTopicsWithDiagnostics(topic(['linkedin'], 'https://not-returned.example/topic'), [source], new Date())
    expect(result.topics).toEqual([])
    expect(result.diagnostics.rejected.noValidatedSource).toBe(1)
    expect(result.diagnostics.validatedTopicCount).toBe(0)
  })

  it('rejects all source-dependent candidates when the provider source set is empty', () => {
    const result = parseAndValidateTopicsWithDiagnostics(JSON.stringify({ topics: Array.from({ length: 6 }, (_, index) => topicValue(index)) }), [], new Date())
    expect(result.topics).toEqual([])
    expect(result.diagnostics.providerStructuredTopicCount).toBe(6)
    expect(result.diagnostics.providerSourceCount).toBe(0)
    expect(result.diagnostics.rejected.noValidatedSource).toBe(6)
  })

  it('keeps valid candidates when another candidate has no validated source', () => {
    const result = parseAndValidateTopicsWithDiagnostics(JSON.stringify({ topics: [topicValue(1, 'https://not-returned.example/topic'), topicValue(2)] }), [source], new Date())
    expect(result.topics).toHaveLength(1)
    expect(result.topics[0]?.title).toBe('A current topic 2')
    expect(result.diagnostics.rejected.noValidatedSource).toBe(1)
    expect(result.diagnostics.validatedTopicCount).toBe(1)
  })

  it('matches harmless URL normalization but keeps source identity constrained', () => {
    const normalized = parseAndValidateTopicsWithDiagnostics(topic(['linkedin'], 'https://EXAMPLE.com/current/#section'), [{ ...source, url: 'https://example.com/current/' }], new Date())
    expect(normalized.topics).toHaveLength(1)
    expect(normalized.topics[0]?.sources[0]?.url).toBe('https://example.com/current/')

    const differentPath = parseAndValidateTopicsWithDiagnostics(topic(['linkedin'], 'https://example.com/other'), [source], new Date())
    expect(differentPath.topics).toEqual([])
  })

  it('accepts a matching provider source when publication date is unavailable', () => {
    const result = parseAndValidateTopicsWithDiagnostics(JSON.stringify({ topics: [topicValue(1, source.url, null)] }), [{ ...source, publishedAt: null }], new Date())
    expect(result.topics).toHaveLength(1)
    expect(result.topics[0]?.sources[0]?.publishedAt).toBeNull()
  })
})

describe('current topic discovery context readiness', () => {
  it('accepts valid company-only M1 context without downstream Content readiness fields', () => {
    const result = companyTopicDiscoveryReadiness({ description: 'Workflow software for business teams.', customerSegments: ['Operations teams'], decisionMakers: [], painPoints: ['Manual approvals'] })
    expect(result).toEqual({ ready: true, missing: [] })
  })

  it('accepts valid Product Context without requiring Content-generation fields', () => {
    const result = productTopicDiscoveryReadiness({ name: 'Shifd Approval', description: 'Digital approval workflow.', targetUsers: ['Administrators'], targetOrganizations: [], problemsAddressed: ['Scattered approvals'], valueProposition: null })
    expect(result).toEqual({ ready: true, missing: [] })
  })

  it('returns discovery-specific missing context fields and preserves the normal generation gate', () => {
    expect(companyTopicDiscoveryReadiness({ description: '', customerSegments: [], decisionMakers: [], painPoints: [] })).toEqual({ ready: false, missing: ['company.description', 'company.audience', 'company.painPoints'] })
    expect(productTopicDiscoveryReadiness({ name: 'Shifd Approval', description: 'Digital approval workflow.', targetUsers: [], targetOrganizations: [], problemsAddressed: [], valueProposition: null })).toEqual({ ready: false, missing: ['profile.audience', 'profile.relevance'] })
    expect(productContextReadiness({ targetUsers: [], problemsAddressed: [], valueProposition: null, features: [], benefits: [], proofPoints: [] }).missing).toEqual(['profile.targetUsers', 'profile.problemsAddressed', 'profile.valueProposition', 'profile.features', 'profile.benefits', 'profile.proofPoints'])
  })
})
