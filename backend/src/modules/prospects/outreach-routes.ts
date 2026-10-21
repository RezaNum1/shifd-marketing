import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import type { AiProvider } from '../ai/provider.js'
import { archiveProspectEmailDraft, createOrReadEmailDraftShare, createProspectEmailDraft, createPublicEmailDraftFeedback, eligibleResearchFacts, generateProspectEmailDraft, listProspectEmailDraftFeedback, listProspectEmailDrafts, readProspectEmailDraft, readPublicEmailDraft, updateProspectEmailDraft, type DraftInput, type GenerateInput } from './outreach.js'

export async function prospectOutreachRoutes(app: FastifyInstance, options: { config: AppConfig; provider: AiProvider }) {
  app.get('/prospects/:id/outreach-facts', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await eligibleResearchFacts(app.prisma, auth.user.companyId, routeId(request, 'id')) })
  })

  app.get('/prospects/:id/outreach-drafts', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await listProspectEmailDrafts(app.prisma, auth.user.companyId, routeId(request, 'id')) })
  })

  app.post('/prospects/:id/outreach-drafts/generate', { config: { rateLimit: { max: 6, timeWindow: '15 minutes' } } }, async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    const input = parseGenerate(request.body)
    return reply.send({ data: await generateProspectEmailDraft(app.prisma, options.config, options.provider, auth.user.companyId, auth.user.id, routeId(request, 'id'), input) })
  })

  app.post('/prospects/:id/outreach-drafts', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    return reply.status(201).send({ data: await createProspectEmailDraft(app.prisma, auth.user.companyId, auth.user.id, routeId(request, 'id'), parseCreate(request.body)) })
  })

  app.get('/prospects/:id/outreach-drafts/:draftId', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await readProspectEmailDraft(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'draftId')) })
  })

  app.get('/prospects/:id/outreach-drafts/:draftId/feedback', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await listProspectEmailDraftFeedback(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'draftId')) })
  })

  app.post('/prospects/:id/outreach-drafts/:draftId/share', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    if (request.body && Object.keys(request.body as object).length) throw validationError('Share link request does not accept additional input.')
    return reply.send({ data: await createOrReadEmailDraftShare(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'draftId')) })
  })

  app.put('/prospects/:id/outreach-drafts/:draftId', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    return reply.send({ data: await updateProspectEmailDraft(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'draftId'), auth.user.id, parseUpdate(request.body)) })
  })

  app.post('/prospects/:id/outreach-drafts/:draftId/archive', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply); await requireCsrf(request)
    if (request.body && Object.keys(request.body as object).length) throw validationError('Archive does not accept additional input.')
    return reply.send({ data: await archiveProspectEmailDraft(app.prisma, auth.user.companyId, routeId(request, 'id'), routeId(request, 'draftId')) })
  })

  app.get('/public-email-drafts/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
    return reply.send({ data: await readPublicEmailDraft(app.prisma, routeToken(request)) })
  })

  app.post('/public-email-drafts/:token/feedback', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
    const input = parseFeedback(request.body)
    return reply.status(201).send({ data: await createPublicEmailDraftFeedback(app.prisma, routeToken(request), input.message) })
  })
}

function routeId(request: FastifyRequest, key: string) {
  const value = (request.params as Record<string, unknown>)[key]
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw notFound()
  return value
}
function routeToken(request: FastifyRequest) {
  const value = (request.params as Record<string, unknown>).token
  if (typeof value !== 'string') throw notFound()
  return value
}
function parseGenerate(value: unknown): GenerateInput {
  const body = objectBody(value)
  const keys = ['objective', 'offering', 'tone', 'language', 'customInstructions', 'claimIds']
  if (Object.keys(body).some((key) => !keys.includes(key)) || !Array.isArray(body.claimIds)) throw validationError('Email generation input is invalid.')
  return body as unknown as GenerateInput
}
function parseCreate(value: unknown): DraftInput {
  const body = objectBody(value)
  const keys = ['subject', 'body', 'recipientName', 'recipientEmail', 'language', 'tone', 'objective', 'offering', 'origin', 'generationId', 'claimIds']
  if (Object.keys(body).some((key) => !keys.includes(key))) throw validationError('Unknown draft field.')
  return body as unknown as DraftInput
}
function parseUpdate(value: unknown) {
  const body = objectBody(value)
  const keys = ['subject', 'body', 'recipientName', 'recipientEmail']
  if (Object.keys(body).some((key) => !keys.includes(key))) throw validationError('Only subject, body and recipient can be edited.')
  return body as unknown as { subject: string; body: string; recipientName?: string | null; recipientEmail?: string | null }
}
function parseFeedback(value: unknown) {
  const body = objectBody(value)
  if (Object.keys(body).some((key) => key !== 'message') || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 5000) throw validationError('Feedback must contain between 1 and 5000 characters.')
  return { message: body.message }
}
function objectBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError('A JSON object is required.')
  return value as Record<string, unknown>
}
