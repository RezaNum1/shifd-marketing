import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getCsrfToken, request, setCsrfToken } from './client'

function fakeResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => body,
    text: async () => payload,
  } as unknown as Response
}

afterEach(() => {
  vi.restoreAllMocks()
  setCsrfToken(null)
})

describe('shared API client', () => {
  it('extracts ETags and sends runtime CSRF, If-Match, and idempotency headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { id: 'content-1' } }, 200, { ETag: '"4"' }))
    vi.stubGlobal('fetch', fetchMock)
    setCsrfToken('csrf-runtime')

    const result = await request<{ id: string }>('/contents/content-1', { method: 'PATCH', json: { title: 'Updated' }, ifMatch: 3, idempotencyKey: 'command-1' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)

    expect(result.etag).toBe('"4"')
    expect(headers.get('X-CSRF-Token')).toBe('csrf-runtime')
    expect(headers.get('If-Match')).toBe('"3"')
    expect(headers.get('Idempotency-Key')).toBe('command-1')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.credentials).toBe('include')
    expect(getCsrfToken()).toBe('csrf-runtime')
  })

  it('reuses an explicitly supplied idempotency key for the same logical retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    setCsrfToken('csrf-runtime')
    await request('/contents/content-1/generate', { method: 'POST', json: {}, idempotencyKey: 'generate-retry-1' })
    await request('/contents/content-1/generate', { method: 'POST', json: {}, idempotencyKey: 'generate-retry-1' })
    expect(fetchMock.mock.calls.map((call) => new Headers((call[1] as RequestInit).headers).get('Idempotency-Key'))).toEqual(['generate-retry-1', 'generate-retry-1'])
  })

  it('maps the backend error envelope without exposing raw failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ error: { code: 'REVIEW_LOCKED', message: 'internal detail', requestId: 'req-412' } }, 409))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/contents/content-1', { method: 'PATCH', json: {} })).rejects.toMatchObject({ status: 409, code: 'REVIEW_LOCKED', requestId: 'req-412', message: 'This approved content is locked. Request Revision before editing it.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves safe stale-resource semantics for 412 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ error: { code: 'REVISION_CONFLICT', message: 'stale' } }, 412)))
    try {
      await request('/contents/content-1', { method: 'PATCH', json: {} })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(412)
      expect((error as ApiError).message).toContain('changed elsewhere')
    }
  })
})
