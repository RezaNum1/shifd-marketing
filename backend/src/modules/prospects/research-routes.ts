import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import type { ProspectResearchProvider } from '../ai/provider.js'
import { listResearchRuns, readResearchRun, researchProspect, reviewResearchClaim } from './research.js'

export async function prospectResearchRoutes(app: FastifyInstance, options: { config: AppConfig; provider: ProspectResearchProvider }) {
  app.post('/prospects/:id/research', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    if (request.body && Object.keys(request.body as object).length) throw validationError('Research does not accept additional input.')
    return reply.status(201).send({ data: await researchProspect(app.prisma, options.config, options.provider, auth.user.companyId, auth.user.id, routeId(request, 'id')) })
  })

  app.get('/prospects/:id/research-runs', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await listResearchRuns(app.prisma, auth.user.companyId, routeId(request, 'id')) })
  })

  app.get('/prospects/:id/research-runs/:runId', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const prospectId = routeId(request, 'id')
    const run = await readResearchRun(app.prisma, auth.user.companyId, routeId(request, 'runId'))
    if (run.prospectId !== prospectId) throw notFound('Research run not found.')
    return reply.send({ data: run })
  })

  app.put('/prospects/:id/research-claims/:claimId/review', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = parseReviewBody(request.body)
    const data = await reviewResearchClaim(app.prisma, auth.user.companyId, routeId(request, 'id'), auth.user.id, routeId(request, 'claimId'), body.status, body.note)
    return reply.send({ data })
  })
}

function routeId(request: FastifyRequest, key: string) {
  const value = (request.params as Record<string, unknown>)[key]
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw notFound()
  return value
}
function parseReviewBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError('A review decision is required.')
  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => !['status', 'note'].includes(key))) throw validationError('Unknown review field.')
  if (body.status !== 'approved' && body.status !== 'rejected') throw validationError('Review status must be approved or rejected.')
  if (body.note !== undefined && body.note !== null && (typeof body.note !== 'string' || body.note.length > 1200)) throw validationError('Review notes must be 1,200 characters or fewer.')
  return { status: body.status, note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null } as { status: 'approved' | 'rejected'; note: string | null }
}
