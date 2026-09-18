import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCsrfToken, setCsrfToken } from './client'
import { login, logout, me } from './auth'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

afterEach(() => {
  vi.restoreAllMocks()
  setCsrfToken(null)
})

describe('auth adapter', () => {
  it('captures rotated CSRF values from login and session bootstrap, then clears them on logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: { user: { id: 'user-1', name: 'Operator', email: 'operator@example.com', role: 'operator' }, csrfToken: 'csrf-login', expiresAt: '2026-09-15T00:00:00Z' } }))
      .mockResolvedValueOnce(response({ data: { user: { id: 'user-1', name: 'Operator', email: 'operator@example.com', role: 'operator' }, csrfToken: 'csrf-me', expiresAt: '2026-09-15T00:00:00Z' } }))
      .mockResolvedValueOnce({ ok: true, status: 204, headers: new Headers(), text: async () => '' } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await login('operator@example.com', 'secret')
    expect(getCsrfToken()).toBe('csrf-login')
    await me()
    expect(getCsrfToken()).toBe('csrf-me')
    await logout()
    expect(getCsrfToken()).toBeNull()

    const loginInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(loginInit.credentials).toBe('include')
    expect(new Headers(loginInit.headers).get('X-CSRF-Token')).toBeNull()
    const meInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(new Headers(meInit.headers).get('X-CSRF-Token')).toBeNull()
    const logoutInit = fetchMock.mock.calls[2]?.[1] as RequestInit
    expect(new Headers(logoutInit.headers).get('X-CSRF-Token')).toBe('csrf-me')
  })
})
