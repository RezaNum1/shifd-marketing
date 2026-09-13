import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, preconditionRequired, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { decodeCursor, etag } from '../context/service.js'
import { allowedKeys, enumValue, object } from '../context/normalize.js'
import { AI_LANGUAGES, AI_MODES, AI_STATUSES } from './constants.js'
import { listAiRequests, listPromptVersions, readAiRequest, readAiSettings, readAiUsage, readPromptVersion, updateAiSettings } from './service.js'

const MODULES = ['M2', 'M3', 'M4'] as const
const PROMPT_STATUSES = ['active', 'retired'] as const

export async function aiRoutes(app: FastifyInstance, options: { config: AppConfig }) {
  app.get('/settings/ai', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const settings = await readAiSettings(app.prisma, options.config, auth.user.companyId)
    reply.header('ETag', etag(settings.version))
    return reply.send({ data: settings })
  })

  app.put('/settings/ai', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const expectedVersion = ifMatch(request)
    const body = object(request.body, 'AI settings request')
    allowedKeys(body, ['generationLanguage'], 'body')
    const generationLanguage = enumValue(body.generationLanguage, AI_LANGUAGES, 'generationLanguage') as string
    const settings = await updateAiSettings(app.prisma, options.config, auth.user.companyId, expectedVersion, generationLanguage)
    reply.header('ETag', etag(settings.version))
    return reply.send({ data: settings })
  })

  app.get('/prompt-versions', async (request, reply) => {
    await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['module', 'status', 'limit', 'cursor'], 'query')
    const limit = parseLimit(query.limit)
    const options: { module?: string; status?: string; limit: number; cursor?: { createdAt: Date; id: string } } = { limit }
    if (query.module !== undefined) options.module = enumValue(query.module, MODULES, 'module') as string
    if (query.status !== undefined) options.status = enumValue(query.status, PROMPT_STATUSES, 'status') as string
    if (query.cursor !== undefined) options.cursor = decodeCursor(query.cursor)
    const result = await listPromptVersions(app.prisma, options)
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })

  app.get('/prompt-versions/:id', async (request, reply) => {
    await requireAuth(request, reply)
    const version = await readPromptVersion(app.prisma, routeId(request))
    return reply.send({ data: version })
  })

  app.get('/ai-requests', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['contentId', 'module', 'status', 'mode', 'limit', 'cursor'], 'query')
    const limit = parseLimit(query.limit)
    const options: { contentId?: string; module?: string; status?: 'pending' | 'success' | 'failed' | 'stale'; mode?: 'real' | 'demo'; limit: number; cursor?: { createdAt: Date; id: string } } = { limit }
    if (query.contentId !== undefined && query.contentId !== '') options.contentId = routeResourceId(query.contentId)
    if (query.module !== undefined) options.module = enumValue(query.module, MODULES, 'module') as string
    if (query.status !== undefined) options.status = enumValue(query.status, AI_STATUSES, 'status') as 'pending' | 'success' | 'failed' | 'stale'
    if (query.mode !== undefined) options.mode = enumValue(query.mode, AI_MODES, 'mode') as 'real' | 'demo'
    if (query.cursor !== undefined) options.cursor = decodeCursor(query.cursor)
    const result = await listAiRequests(app.prisma, auth.user.companyId, options)
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })

  app.get('/ai-requests/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const result = await readAiRequest(app.prisma, auth.user.companyId, routeId(request))
    return reply.send({ data: result })
  })

  app.get('/ai-usage', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['start', 'end', 'mode'], 'query')
    const mode = query.mode === undefined || query.mode === '' ? 'real' : enumValue(query.mode, AI_MODES, 'mode') as 'real' | 'demo'
    const start = parseTimestamp(query.start, 'start', new Date(0))
    const end = parseTimestamp(query.end, 'end', new Date())
    if (start >= end) throw validationError('The usage period is invalid.', { period: 'The start must be before the exclusive end.' })
    const usage = await readAiUsage(app.prisma, auth.user.companyId, mode, start, end)
    return reply.send({ data: usage })
  })
}

function queryObject(request: FastifyRequest): Record<string, string | undefined> {
  const query = request.query
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw badRequest('Query parameters are invalid.')
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value !== 'string') throw badRequest(`Query parameter '${key}' is invalid.`)
    result[key] = value
  }
  return result
}

function parseLimit(value: string | undefined) {
  if (value === undefined || value === '') return 20
  if (!/^\d+$/.test(value)) throw validationError('The pagination limit is invalid.', { limit: 'Use an integer from 1 to 100.' })
  const limit = Number(value)
  if (limit < 1 || limit > 100) throw validationError('The pagination limit is invalid.', { limit: 'Use an integer from 1 to 100.' })
  return limit
}

function parseTimestamp(value: string | undefined, field: string, fallback: Date) {
  if (value === undefined || value === '') return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw validationError('The usage timestamp is invalid.', { [field]: 'Use an ISO-8601 timestamp.' })
  return parsed
}

function routeId(request: FastifyRequest) {
  return routeResourceId((request.params as { id?: unknown }).id)
}

function routeResourceId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw validationError('The resource identifier is invalid.', { id: 'Use a UUID.' })
  return value
}

function ifMatch(request: FastifyRequest) {
  const value = request.headers['if-match']
  const header = Array.isArray(value) ? value[0] : value
  if (!header) throw preconditionRequired()
  const match = /^"([1-9]\d*)"$/.exec(header.trim())
  if (!match) throw preconditionRequired('If-Match must contain the resource ETag.')
  const version = Number(match[1])
  if (!Number.isSafeInteger(version)) throw preconditionRequired('If-Match must contain the resource ETag.')
  return version
}
