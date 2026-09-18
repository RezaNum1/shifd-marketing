import { request, setCsrfToken, type ApiResult } from './client'
import type { AuthPayload } from '../types/backend'

export async function login(email: string, password: string): Promise<ApiResult<AuthPayload>> {
  const result = await request<AuthPayload>('/auth/login', {
    method: 'POST',
    json: { email, password },
    skipCsrf: true,
  })
  setCsrfToken(result.data.csrfToken)
  return result
}

export async function me(): Promise<ApiResult<AuthPayload>> {
  const result = await request<AuthPayload>('/auth/me')
  setCsrfToken(result.data.csrfToken)
  return result
}

export async function logout() {
  try {
    await request<undefined>('/auth/logout', { method: 'POST' })
  } finally {
    setCsrfToken(null)
  }
}
