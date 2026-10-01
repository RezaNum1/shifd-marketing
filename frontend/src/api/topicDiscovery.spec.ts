import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverTopics, useTopicCandidate } from './topicDiscovery'
import { errorMessage, setCsrfToken } from './client'

function response(body: unknown) {
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ data: body }), text: async () => JSON.stringify({ data: body }) } as unknown as Response
}

function errorResponse(body: unknown, status = 422) {
  return { ok: false, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
}

afterEach(() => { vi.restoreAllMocks(); setCsrfToken(null) })

describe('current topic discovery API', () => {
  it('sends the explicit Indonesia/timeframe request once with idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'run-1', candidates: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await discoverTopics({ productId: 'product-1', market: 'ID', timeframe: 'last_7_days', focus: 'approval workflow' }, 'discovery-command-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({ productId: 'product-1', market: 'ID', timeframe: 'last_7_days', focus: 'approval workflow' })
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('discovery-command-1')
  })

  it('uses the candidate conversion endpoint as a separate explicit action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'idea-1' }))
    vi.stubGlobal('fetch', fetchMock)
    await useTopicCandidate('candidate-1', 'candidate-command-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/ideas/discovery-candidates/candidate-1/use')
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get('Idempotency-Key')).toBe('candidate-command-1')
  })

  it('preserves discovery-specific context readiness copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ error: { code: 'DISCOVERY_COMPANY_CONTEXT_INCOMPLETE', message: 'Complete the Company Context before discovering topics.' } })))
    const failure = await discoverTopics({ productId: null, market: 'ID', timeframe: 'last_7_days', focus: null }).catch((reason: unknown) => reason)
    expect(errorMessage(failure)).toBe('Complete the Company Context before discovering topics.')
    expect(errorMessage(failure)).not.toContain('Content Context')
  })
})
