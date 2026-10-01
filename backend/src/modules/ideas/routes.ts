import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { allowedKeys, enumValue, object, optionalText } from '../context/normalize.js'
import { discoverTopics, readDiscoveryRun, readLatestDiscoveryRun, useDiscoveryCandidate, type DiscoveryMarket, type DiscoveryTimeframe, type TopicDiscoveryInput, type TopicDiscoveryValidationDiagnostics } from './discovery.js'
import type { TopicDiscoveryProvider } from '../ai/provider.js'

export async function topicDiscoveryRoutes(app: FastifyInstance, options: { config: AppConfig; provider: TopicDiscoveryProvider }) {
  app.post('/ideas/discover', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const input = parseDiscoveryInput(request.body)
    const key = idempotencyKey(request)
    const diagnosticsLogger = options.config.nodeEnv === 'development' ? (diagnostics: TopicDiscoveryValidationDiagnostics) => request.log.info(diagnostics, 'Current Topic Discovery validation summary') : undefined
    const result = await discoverTopics(app.prisma, options.config, options.provider, auth.user.companyId, auth.user.id, input, key, diagnosticsLogger)
    return reply.status(result.status).send(result.body)
  })

  app.get('/ideas/discovery-runs/latest', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await readLatestDiscoveryRun(app.prisma, auth.user.companyId) })
  })

  app.get('/ideas/discovery-runs/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const run = await readDiscoveryRun(app.prisma, auth.user.companyId, routeId(request))
    return reply.send({ data: run })
  })

  app.post('/ideas/discovery-candidates/:id/use', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const result = await useDiscoveryCandidate(app.prisma, auth.user.companyId, auth.user.id, routeId(request), idempotencyKey(request))
    return reply.status(result.status).send(result.body)
  })
}

function parseDiscoveryInput(value: unknown): TopicDiscoveryInput {
  const input = object(value, 'Topic discovery request')
  allowedKeys(input, ['productId', 'market', 'timeframe', 'focus'], 'body')
  const productId = input.productId === undefined || input.productId === null || input.productId === '' ? null : parseResourceId(input.productId, 'productId')
  const focus = optionalText(input.focus, 'focus')
  if (focus && focus.length > 240) throw validationError('The discovery focus is too long.', { focus: 'Use at most 240 characters.' })
  return {
    productId,
    market: enumValue(input.market, ['ID'] as const, 'market') as DiscoveryMarket,
    timeframe: enumValue(input.timeframe, ['last_7_days', 'last_30_days'] as const, 'timeframe') as DiscoveryTimeframe,
    focus,
  }
}

function idempotencyKey(request: FastifyRequest) {
  const value = header(request, 'idempotency-key')?.trim()
  if (!value) throw badRequest('Idempotency-Key is required.')
  if (value.length > 200) throw validationError('The Idempotency-Key is too long.', { 'Idempotency-Key': 'Use at most 200 characters.' })
  return value
}

function requireEmptyBody(value: unknown) {
  const body = object(value ?? {}, 'Request body')
  allowedKeys(body, [], 'body')
}

function routeId(request: FastifyRequest) { return parseResourceId((request.params as { id?: unknown }).id, 'id') }

function parseResourceId(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw notFound()
  return value
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}
