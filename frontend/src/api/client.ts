export interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string>
    requestId?: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>
  readonly requestId: string | null

  constructor(status: number, error: ApiErrorEnvelope['error'], fallbackMessage?: string) {
    const code = error?.code ?? fallbackCode(status)
    super(messageFor(code, error?.message ?? fallbackMessage ?? 'The request could not be completed.'))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = error?.fields ?? {}
    this.requestId = error?.requestId ?? null
  }
}

export interface ApiResult<T> {
  data: T
  etag: string | null
  response: Response
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  headers?: HeadersInit
  json?: unknown
  idempotencyKey?: string
  ifMatch?: string | number
  skipCsrf?: boolean
}

let csrfToken: string | null = null

export function setCsrfToken(value: string | null) {
  csrfToken = value
}

export function getCsrfToken() {
  return csrfToken
}

export function createRequestKey(scope: string) {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${scope}:${id}`
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  headers.set('X-Request-ID', createRequestKey('frontend'))

  const method = (options.method ?? 'GET').toUpperCase()
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const jsonBody = Object.hasOwn(options, 'json')
  const isFormData = typeof FormData !== 'undefined' && options.json instanceof FormData
  if (jsonBody && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }
  if (isMutation && !options.skipCsrf && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
  if (options.ifMatch !== undefined) headers.set('If-Match', formatEtag(options.ifMatch))

  const body = jsonBody
    ? isFormData
      ? options.json as FormData
      : JSON.stringify(options.json)
    : undefined
  const { json: _json, idempotencyKey: _idempotency, ifMatch: _ifMatch, skipCsrf: _skipCsrf, headers: _headers, ...init } = options
  const response = await fetch(resolveUrl(path), {
    ...init,
    method,
    headers,
    credentials: 'include',
    body,
  })

  const raw = await readResponseBody(response)
  if (!response.ok) {
    const envelope = isErrorEnvelope(raw) ? raw : undefined
    const requestId = envelope?.error?.requestId ?? response.headers.get('X-Request-ID') ?? undefined
    const error = envelope?.error
      ? { ...envelope.error, requestId }
      : requestId
        ? { requestId }
        : undefined
    throw new ApiError(response.status, error)
  }

  const data = isDataEnvelope<T>(raw) ? raw.data : undefined as T
  return { data, etag: response.headers.get('ETag'), response }
}

function resolveUrl(path: string) {
  const configured = String(import.meta.env.VITE_API_BASE_URL ?? '/api').trim() || '/api'
  if (/^https?:\/\//i.test(path)) return path
  if (/^https?:\/\//i.test(configured)) return `${configured.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  const base = configured.startsWith('/') ? configured : `/${configured}`
  if (path.startsWith(`${base}/`) || path === base) return path
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try { return await response.json() as unknown } catch { return undefined }
  }
  try { return await response.text() } catch { return undefined }
}

function isDataEnvelope<T>(value: unknown): value is { data: T } {
  return Boolean(value && typeof value === 'object' && 'data' in value)
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return Boolean(value && typeof value === 'object' && 'error' in value)
}

function formatEtag(value: string | number) {
  const text = String(value)
  return text.startsWith('"') ? text : `"${text}"`
}

function fallbackCode(status: number) {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'STATE_CONFLICT'
  if (status === 412) return 'REVISION_CONFLICT'
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE'
  if (status === 422) return 'VALIDATION_ERROR'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500) return 'INTERNAL_ERROR'
  return 'REQUEST_FAILED'
}

function messageFor(code: string, backendMessage: string) {
  switch (code) {
    case 'REVISION_CONFLICT': return 'This record changed elsewhere. Refresh the latest version before saving.'
    case 'REVIEW_LOCKED': return 'This approved content is locked. Request Revision before editing it.'
    case 'INPUT_CHANGED': return 'The saved inputs changed while the AI request was running. Regenerate intentionally.'
    case 'INTEGRATION_NOT_CONFIGURED': return 'This integration is not configured in the current environment.'
    case 'INSTAGRAM_ACCOUNT_INVALID': return 'The configured Instagram account could not be validated.'
    case 'INSTAGRAM_PROVIDER_ERROR': return 'Instagram metrics could not be synchronized.'
    case 'INVALID_CREDENTIALS': return 'Incorrect email or password.'
    case 'CSRF_INVALID': return 'Your session security token is out of date. Reload and try again.'
    case 'RATE_LIMITED': return 'Too many requests. Wait a moment before trying again.'
    case 'UNSUPPORTED_MEDIA_TYPE': return 'Only PNG and JPEG creative files are supported.'
    case 'AI_NOT_CONFIGURED': return 'AI generation is not configured for this environment.'
    case 'AI_TIMEOUT': return 'The AI provider timed out. Try this action again intentionally.'
    default: return backendMessage || 'The request could not be completed.'
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function errorMessage(error: unknown, fallback = 'The request could not be completed.') {
  return isApiError(error) ? error.message : fallback
}
