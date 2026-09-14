import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, preconditionRequired, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { allowedKeys, enumValue, object, optionalText, requiredText } from '../context/normalize.js'
import { decodeCursor, etag, encodeCursor } from '../context/service.js'
import { updateInstagramIntegration, listIntegrations } from './integrations.js'
import {
  assertOptionalSafeCount,
  assertSafeCount,
  createInquiry,
  createLinkedInMetric,
  listInquiries,
  listLinkedInMetrics,
  parseDateOnly,
  updateInquiry,
  updateLinkedInMetric,
  type InquiryInput,
  type MetricListOptions,
  type WeeklyMetricInput,
} from './metrics.js'
import { buildOverviewReport, buildPerformanceReport, listRecentPublications, loadReportingSnapshot, type ReportPlatform } from './reporting.js'
import type { Clock } from '../../shared/time/clock.js'

const metricKeys = ['weekStart', 'weekEnd', 'followers', 'reach', 'impressions', 'likes', 'comments', 'saves', 'publishedPosts', 'evidenceAssetId', 'notes'] as const
const inquiryKeys = ['weekStart', 'weekEnd', 'count'] as const
const reportPlatforms = ['combined', 'instagram', 'linkedin'] as const
const metricPlatforms = ['instagram', 'linkedin'] as const

export async function performanceRoutes(app: FastifyInstance, options: { config: AppConfig; clock: Clock }) {
  app.get('/metrics/linkedin', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = parseMetricQuery(request, 'LinkedIn metric query')
    const result = await listLinkedInMetrics(app.prisma, auth.user.companyId, resultOptions(query))
    return reply.send({ data: result.data, page: { limit: query.limit, nextCursor: result.nextCursor } })
  })

  app.post('/metrics/linkedin', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await createLinkedInMetric(app.prisma, auth.user.companyId, auth.user.id, parseWeeklyMetric(request.body))
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.put('/metrics/linkedin/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await updateLinkedInMetric(app.prisma, auth.user.companyId, auth.user.id, routeId(request), ifMatch(request), parseWeeklyMetric(request.body))
    reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.get('/metrics/inquiries', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = parseMetricQuery(request, 'Inquiry query')
    const result = await listInquiries(app.prisma, auth.user.companyId, resultOptions(query))
    return reply.send({ data: result.data, page: { limit: query.limit, nextCursor: result.nextCursor } })
  })

  app.post('/metrics/inquiries', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await createInquiry(app.prisma, auth.user.companyId, auth.user.id, parseInquiry(request.body))
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.put('/metrics/inquiries/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await updateInquiry(app.prisma, auth.user.companyId, auth.user.id, routeId(request), ifMatch(request), parseInquiry(request.body))
    reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.get('/publications', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = parsePublicationQuery(request)
    const result = await listRecentPublications(app.prisma, auth.user.companyId, query)
    return reply.send({ data: result.data, page: { limit: query.limit, nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null } })
  })

  app.get('/performance', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = parsePerformanceQuery(request)
    const asOf = options.clock.now()
    const snapshot = await loadReportingSnapshot(app.prisma, auth.user.companyId, { anthropicModel: options.config.anthropicModel, asOf })
    return reply.send({ data: buildPerformanceReport(snapshot, query.weeks, query.platform, asOf) })
  })

  app.get('/overview', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const asOf = options.clock.now()
    const snapshot = await loadReportingSnapshot(app.prisma, auth.user.companyId, { anthropicModel: options.config.anthropicModel, asOf })
    return reply.send({ data: buildOverviewReport(snapshot, asOf) })
  })

  app.get('/integrations', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await listIntegrations(app.prisma, auth.user.companyId) })
  })

  for (const action of ['connect', 'disconnect', 'sync'] as const) {
    app.post(`/integrations/instagram/${action}`, async (request, reply) => {
      validateOrigin(request, options.config)
      const auth = await requireAuth(request, reply)
      await requireCsrf(request)
      requireEmptyBody(request.body)
      const result = await updateInstagramIntegration(app.prisma, auth.user.companyId, ifMatch(request), action, options.clock)
      reply.header('ETag', result.etag)
      if (action === 'sync') {
        return reply.send({ data: { integration: result.integration, mode: result.mode, metricsChanged: result.metricsChanged } })
      }
      return reply.send({ data: result.integration })
    })
  }
}

function parseWeeklyMetric(value: unknown): WeeklyMetricInput {
  const body = object(value, 'Weekly metric request')
  allowedKeys(body, metricKeys, 'body')
  const weekStart = parseDateOnly(body.weekStart, 'weekStart')
  const weekEnd = parseDateOnly(body.weekEnd, 'weekEnd')
  return {
    weekStart,
    weekEnd,
    followers: assertSafeCount(body.followers, 'followers'),
    reach: assertOptionalSafeCount(body.reach, 'reach'),
    impressions: assertSafeCount(body.impressions, 'impressions'),
    likes: body.likes === undefined ? 0 : assertSafeCount(body.likes, 'likes'),
    comments: body.comments === undefined ? 0 : assertSafeCount(body.comments, 'comments'),
    saves: body.saves === undefined ? 0 : assertSafeCount(body.saves, 'saves'),
    publishedPosts: assertSafeCount(body.publishedPosts, 'publishedPosts', 2_147_483_647),
    evidenceAssetId: parseNullableUuid(body.evidenceAssetId, 'evidenceAssetId'),
    notes: optionalText(body.notes, 'notes'),
  }
}

function parseInquiry(value: unknown): InquiryInput {
  const body = object(value, 'Inquiry request')
  allowedKeys(body, inquiryKeys, 'body')
  return {
    weekStart: parseDateOnly(body.weekStart, 'weekStart'),
    weekEnd: parseDateOnly(body.weekEnd, 'weekEnd'),
    count: assertSafeCount(body.count, 'count', 2_147_483_647),
  }
}

function parseMetricQuery(request: FastifyRequest, label: string) {
  const query = queryObject(request)
  allowedKeys(query, ['start', 'end', 'limit', 'cursor'], 'query')
  const start = query.start === undefined || query.start === '' ? undefined : parseDateOnly(query.start, 'start')
  const end = query.end === undefined || query.end === '' ? undefined : parseDateOnly(query.end, 'end')
  if (start && end && start > end) throw validationError(`The ${label} is invalid.`, { start: 'Use a date on or before end.', end: 'Use a date on or after start.' })
  return { start, end, limit: parseLimit(query.limit), cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor) }
}

function resultOptions(query: ReturnType<typeof parseMetricQuery>): MetricListOptions {
  return { limit: query.limit, ...(query.start ? { start: query.start } : {}), ...(query.end ? { end: query.end } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) }
}

function parsePerformanceQuery(request: FastifyRequest) {
  const query = queryObject(request)
  allowedKeys(query, ['weeks', 'platform'], 'query')
  const weeksValue = query.weeks === undefined ? '8' : query.weeks
  const weeks = Number(weeksValue)
  if (![4, 8, 12].includes(weeks)) throw validationError('The Performance query is invalid.', { weeks: 'Use 4, 8, or 12.' })
  const platform = enumValue(query.platform ?? 'combined', reportPlatforms, 'platform') as ReportPlatform
  return { weeks: weeks as 4 | 8 | 12, platform }
}

function parsePublicationQuery(request: FastifyRequest) {
  const query = queryObject(request)
  allowedKeys(query, ['platform', 'start', 'end', 'contentId', 'limit', 'cursor'], 'query')
  const start = query.start === undefined || query.start === '' ? undefined : parseTimestamp(query.start, 'start')
  const end = query.end === undefined || query.end === '' ? undefined : parseTimestamp(query.end, 'end')
  if (start && end && start >= end) throw validationError('The Publication query is invalid.', { start: 'Use a timestamp before end.', end: 'Use a timestamp after start.' })
  const contentId = query.contentId === undefined || query.contentId === '' ? undefined : routeUuid(query.contentId, 'contentId')
  const platform = query.platform === undefined ? undefined : enumValue(query.platform, metricPlatforms, 'platform') as typeof metricPlatforms[number]
  return { ...(platform ? { platform } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}), ...(contentId ? { contentId } : {}), limit: parseLimit(query.limit), ...(query.cursor === undefined ? {} : { cursor: decodeCursor(query.cursor) }) }
}

function queryObject(request: FastifyRequest): Record<string, string | undefined> {
  const query = request.query
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw badRequest('Query parameters are invalid.')
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value !== 'string') throw validationError('Query parameters are invalid.', { [key]: 'Use one text value.' })
    result[key] = value
  }
  return result
}

function parseLimit(value: string | undefined) {
  if (value === undefined) return 50
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw validationError('The pagination limit is invalid.', { limit: 'Use an integer between 1 and 100.' })
  return limit
}

function parseTimestamp(value: string, path: string) {
  if (!/T/.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw validationError('The timestamp is invalid.', { [path]: 'Use an RFC3339 timestamp with an offset.' })
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw validationError('The timestamp is invalid.', { [path]: 'Use a valid RFC3339 timestamp.' })
  return date
}

function parseNullableUuid(value: unknown, path: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !uuid(value)) throw validationError('The UUID is invalid.', { [path]: 'Use a UUID or null.' })
  return value
}

function routeId(request: FastifyRequest) {
  const value = (request.params as { id?: unknown }).id
  if (typeof value !== 'string' || !uuid(value)) throw notFound()
  return value
}

function routeUuid(value: string, path: string) {
  if (!uuid(value)) throw validationError('The UUID is invalid.', { [path]: 'Use a UUID.' })
  return value
}

function ifMatch(request: FastifyRequest) {
  const value = header(request, 'if-match')?.trim()
  if (!value) throw preconditionRequired()
  const match = /^"([1-9]\d*)"$/.exec(value)
  if (!match) throw preconditionRequired('If-Match must contain the resource ETag.')
  const version = Number(match[1])
  if (!Number.isSafeInteger(version)) throw preconditionRequired('If-Match must contain the resource ETag.')
  return version
}

function requireEmptyBody(value: unknown) {
  if (value !== undefined && value !== null && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).length > 0)) throw badRequest('This endpoint does not accept a request body.')
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
