import { describe, expect, it } from 'vitest'
import { canonicalPublicUrl, parseResearchResult } from '../src/modules/prospects/research.js'

const official = { url: 'https://acme.example/about', title: 'About Acme', publisher: 'Acme', publishedAt: null }
const response = (values: unknown) => JSON.stringify(values)

describe('prospect research response validation', () => {
  it('keeps only claims associated with actual retrieved provider evidence', () => {
    const result = parseResearchResult(response({ summary: 'Acme overview.', identityStatus: 'matched', identityExplanation: 'Official website and location match.', limitations: [], claims: [
      { text: 'Acme makes logistics software.', category: 'products_services', claimType: 'sourced_fact', sourceUrls: [official.url] },
      { text: 'Acme has approval delays.', category: 'operations', claimType: 'sourced_fact', sourceUrls: ['https://invented.example/story'] },
      { text: 'A company with distributed teams may value document workflows.', category: 'opportunity', claimType: 'hypothesis', sourceUrls: [] },
      { text: 'Unsupported statement.', category: 'industry', claimType: 'unsupported', sourceUrls: [official.url] },
    ] }), [official], 'https://acme.example', new Date('2026-10-11T00:00:00Z'))
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({ domain: 'acme.example', sourceType: 'official', retrievedAt: new Date('2026-10-11T00:00:00Z') })
    expect(result.claims).toEqual([
      { text: 'Acme makes logistics software.', category: 'products_services', claimType: 'sourced_fact', sources: [official.url] },
      { text: 'A company with distributed teams may value document workflows.', category: 'opportunity', claimType: 'hypothesis', sources: [] },
    ])
  })
  it('rejects unsafe and non-web source URLs', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://127.0.0.1/private', 'http://10.1.2.3/', 'http://localhost/admin', 'https://user:pass@example.com']) expect(canonicalPublicUrl(url)).toBe('')
    expect(canonicalPublicUrl('https://reports.example/story#section')).toBe('https://reports.example/story')
  })
  it('preserves identity uncertainty and excludes facts without evidence', () => {
    const ambiguousSource = { url: 'https://unknown.example/about', title: 'Possibly related company', publisher: 'Unknown', publishedAt: null }
    const result = parseResearchResult(response({ summary: 'Several similarly named businesses exist.', identityStatus: 'needs_confirmation', identityExplanation: 'No source clearly matches the supplied location.', limitations: ['Identity is ambiguous.'], claims: [{ text: 'This company was founded in 2001.', category: 'development', claimType: 'sourced_fact', sourceUrls: [ambiguousSource.url] }] }), [ambiguousSource], null)
    expect(result.identityStatus).toBe('needs_confirmation')
    expect(result.claims).toEqual([])
  })
})
