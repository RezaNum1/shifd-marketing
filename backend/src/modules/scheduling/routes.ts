import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, preconditionRequired, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { allowedKeys, enumValue, object, optionalText, requiredText } from '../context/normalize.js'
import { PLATFORM_CODES, type PlatformCode } from '../content/constants.js'
import type { Clock } from '../../shared/time/clock.js'
import {
  assertPostUrl,
  cancelSchedule,
  createOrUpdateSchedules,
  publishSchedule,
  readCalendar,
  reschedule,
  type CalendarStatus,
  type ScheduleInput,
} from './service.js'

const scheduleKeys = ['platform', 'scheduledAt', 'timezone'] as const
const scheduleBatchKeys = ['schedules'] as const
const scheduleUpdateKeys = ['scheduledAt', 'timezone'] as const
const publicationKeys = ['publishedAt', 'postUrl'] as const
const calendarKeys = ['start', 'end', 'platform', 'status', 'productId', 'contextType'] as const

export async function schedulingRoutes(app: FastifyInstance, options: { config: AppConfig; clock: Clock }) {
  app.post('/contents/:id/schedules', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const contentId = routeId(request)
    const result = await createOrUpdateSchedules(
      app.prisma,
      auth.user.companyId,
      auth.user.id,
      contentId,
      ifMatch(request),
      parseScheduleBatch(request.body),
      idempotencyKey(request),
      request.id,
      { openaiModel: options.config.openaiModel, clock: options.clock },
    )
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.put('/schedules/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await reschedule(
      app.prisma,
      auth.user.companyId,
      auth.user.id,
      scheduleId(request),
      ifMatch(request),
      parseScheduleUpdate(request.body),
      request.id,
      { openaiModel: options.config.openaiModel, clock: options.clock },
    )
    reply.header('ETag', result.etag)
    return reply.send({ data: result.content })
  })

  app.delete('/schedules/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await cancelSchedule(
      app.prisma,
      auth.user.companyId,
      auth.user.id,
      scheduleId(request),
      ifMatch(request),
      request.id,
      { openaiModel: options.config.openaiModel, clock: options.clock },
    )
    reply.header('ETag', result.etag)
    return reply.send({ data: result.content })
  })

  app.post('/schedules/:id/publish', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await publishSchedule(
      app.prisma,
      auth.user.companyId,
      auth.user.id,
      scheduleId(request),
      ifMatch(request),
      parsePublication(request.body),
      idempotencyKey(request),
      request.id,
      { openaiModel: options.config.openaiModel, clock: options.clock },
    )
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.get('/calendar', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = parseCalendarQuery(request)
    const calendar = await readCalendar(app.prisma, auth.user.companyId, query, options.clock)
    return reply.send({ data: calendar })
  })
}

function parseScheduleBatch(value: unknown): ScheduleInput[] {
  const body = object(value, 'Schedule request')
  allowedKeys(body, scheduleBatchKeys, 'body')
  if (!Array.isArray(body.schedules) || body.schedules.length === 0) throw validationError('At least one schedule is required.', { schedules: 'Choose at least one platform.' })
  const schedules = body.schedules.map((value, index) => parseSchedule(value, `schedules[${index}]`))
  if (new Set(schedules.map((schedule) => schedule.platform)).size !== schedules.length) throw validationError('Platforms must be unique in a schedule request.', { schedules: 'Do not submit a platform more than once.' })
  return schedules
}

function parseSchedule(value: unknown, path: string): ScheduleInput {
  const body = object(value, path)
  allowedKeys(body, scheduleKeys, path)
  return {
    platform: parsePlatform(body.platform, `${path}.platform`),
    scheduledAt: parseTimestamp(body.scheduledAt, `${path}.scheduledAt`),
    timezone: requiredText(body.timezone, `${path}.timezone`),
  }
}

function parseScheduleUpdate(value: unknown): Pick<ScheduleInput, 'scheduledAt' | 'timezone'> {
  const body = object(value, 'Schedule update request')
  allowedKeys(body, scheduleUpdateKeys, 'body')
  return {
    scheduledAt: parseTimestamp(body.scheduledAt, 'scheduledAt'),
    timezone: requiredText(body.timezone, 'timezone'),
  }
}

function parsePublication(value: unknown) {
  const body = object(value, 'Publication request')
  allowedKeys(body, publicationKeys, 'body')
  const postUrl = optionalText(body.postUrl, 'postUrl')
  if (postUrl !== null) assertPostUrl(postUrl)
  return {
    publishedAt: parseTimestamp(body.publishedAt, 'publishedAt'),
    postUrl,
  }
}

function parseCalendarQuery(request: FastifyRequest) {
  const query = queryObject(request)
  const allowed = new Set<string>(calendarKeys)
  const unknown = Object.keys(query).find((key) => !allowed.has(key))
  if (unknown) throw validationError('The Calendar query is invalid.', { [unknown]: 'This filter is not supported.' })
  const start = parseTimestamp(query.start, 'start')
  const end = parseTimestamp(query.end, 'end')
  if (start >= end) throw validationError('Calendar start must be before end.', { start: 'Use a time before end.', end: 'Use a time after start.' })
  if (end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1_000) throw validationError('The Calendar range is too large.', { end: 'Use a range of at most 93 days.' })
  const productId = query.productId === undefined || query.productId === '' ? undefined : calendarResourceId(query.productId)
  return {
    start,
    end,
    ...(query.platform === undefined ? {} : { platform: parsePlatform(query.platform, 'platform') }),
    ...(query.status === undefined ? {} : { status: enumValue(query.status, ['scheduled', 'ready_to_publish', 'published'] as const, 'status') as CalendarStatus }),
    ...(productId === undefined ? {} : { productId }),
    ...(query.contextType === undefined ? {} : { contextType: enumValue(query.contextType, ['company', 'product'] as const, 'contextType') as 'company' | 'product' }),
  }
}

function parseTimestamp(value: unknown, path: string): Date {
  const text = requiredText(value, path)
  if (!/T/.test(text) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw validationError('The timestamp is invalid.', { [path]: 'Use an RFC3339 timestamp with an offset.' })
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw validationError('The timestamp is invalid.', { [path]: 'Use a valid RFC3339 timestamp.' })
  return date
}

function parsePlatform(value: unknown, path: string): PlatformCode {
  return enumValue(value, PLATFORM_CODES, path) as PlatformCode
}

function routeId(request: FastifyRequest): string {
  return resourceId((request.params as { id?: unknown }).id)
}

function scheduleId(request: FastifyRequest): string {
  return resourceId((request.params as { id?: unknown }).id)
}

function resourceId(value: unknown): string {
  if (typeof value !== 'string' || !uuid(value)) throw notFound()
  return value
}

function calendarResourceId(value: string): string {
  if (!uuid(value)) throw validationError('The Calendar query is invalid.', { productId: 'Use a UUID.' })
  return value
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function ifMatch(request: FastifyRequest): number {
  const value = header(request, 'if-match')
  if (!value) throw preconditionRequired()
  const match = /^"([1-9]\d*)"$/.exec(value.trim())
  if (!match) throw preconditionRequired('If-Match must contain the resource ETag.')
  const version = Number(match[1])
  if (!Number.isSafeInteger(version)) throw preconditionRequired('If-Match must contain the resource ETag.')
  return version
}

function idempotencyKey(request: FastifyRequest): string {
  const value = header(request, 'idempotency-key')?.trim()
  if (!value) throw badRequest('Idempotency-Key is required.')
  if (value.length > 200) throw validationError('The Idempotency-Key is too long.', { 'Idempotency-Key': 'Use at most 200 characters.' })
  return value
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function queryObject(request: FastifyRequest): Record<string, string | undefined> {
  const query = request.query
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw badRequest('Query parameters are invalid.')
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value !== 'string') throw validationError('The Calendar query is invalid.', { [key]: 'Use one text value.' })
    result[key] = value
  }
  return result
}
