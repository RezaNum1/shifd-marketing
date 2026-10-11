import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { archiveOutboundActivity, changeActivityState, createOutboundActivity, getOutboundSummary, listOutboundActivities, parseActivityTimestamp, readOutboundActivity, updateOutboundActivity, validateActivityInput } from './activities.js'

export async function prospectActivityRoutes(app: FastifyInstance, options: { config: AppConfig }) {
  app.post('/prospects/:id/outbound-activities', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    return reply.status(201).send({ data: await createOutboundActivity(app.prisma, auth.user.companyId, routeId(request, 'id'), auth.user.id, validateActivityInput(request.body)) })
  })

  app.get('/prospects/:id/outbound-activities', async (request, reply) => {
    const auth = await requireAuth(request, reply); const query = request.query as Record<string, unknown>
    if (Object.keys(query).some((key) => !['page', 'limit'].includes(key))) throw validationError('Unknown activity list filter.')
    return reply.send(await listOutboundActivities(app.prisma, auth.user.companyId, routeId(request, 'id'), positiveInt(query.page, 1), positiveInt(query.limit, 100)))
  })

  app.get('/prospects/:id/outbound-activities/summary', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await getOutboundSummary(app.prisma, auth.user.companyId, routeId(request, 'id')) })
  })

  app.get('/prospects/:id/outbound-activities/:activityId', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await readOutboundActivity(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'activityId')) })
  })

  app.put('/prospects/:id/outbound-activities/:activityId', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    return reply.send({ data: await updateOutboundActivity(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'activityId'), auth.user.id, request.body) })
  })

  app.post('/prospects/:id/outbound-activities/:activityId/complete', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    const completedAt = parseCompletion(request.body)
    return reply.send({ data: await changeActivityState(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'activityId'), auth.user.id, 'complete', completedAt) })
  })

  app.post('/prospects/:id/outbound-activities/:activityId/cancel', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    parseEmpty(request.body)
    return reply.send({ data: await changeActivityState(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'activityId'), auth.user.id, 'cancel') })
  })

  app.post('/prospects/:id/outbound-activities/:activityId/archive', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request); parseEmpty(request.body)
    return reply.send({ data: await archiveOutboundActivity(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'activityId'), auth.user.id) })
  })
}

function routeId(request: FastifyRequest, key: string) {
  const value = (request.params as Record<string, unknown>)[key]
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw notFound()
  return value
}
function positiveInt(value: unknown, fallback: number) {
  if (value === undefined) return fallback
  const result = Number(value)
  if (!Number.isInteger(result) || result < 1 || result > 100000) throw validationError('Pagination values are invalid.')
  return result
}
function parseCompletion(value: unknown) {
  if (value === undefined || value === null) return new Date()
  if (typeof value !== 'object' || Array.isArray(value)) throw validationError('Completion input is invalid.')
  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => key !== 'completedAt')) throw validationError('Unknown completion field.')
  return body.completedAt === undefined ? new Date() : parseActivityTimestamp(body.completedAt)
}
function parseEmpty(value: unknown) {
  if (value === undefined || value === null) return
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw validationError('This action does not accept input.')
}
