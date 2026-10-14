import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { notFound } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import type { AssetStorage } from '../assets/storage.js'
import { createReviewShare, openPublicReviewAsset, readPublicReview, revokeReviewShare, reviewShareStatus, validateShareCreateBody } from './service.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function reviewShareRoutes(app: FastifyInstance, options: { config: AppConfig; storage: AssetStorage }) {
  app.get('/contents/:id/review-share', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await reviewShareStatus(app.prisma, auth.user.companyId, contentId(request)) })
  })

  app.post('/contents/:id/review-share', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    validateShareCreateBody(request.body)
    return reply.status(201).send({ data: await createReviewShare(app.prisma, auth.user.companyId, auth.user.id, contentId(request)) })
  })

  app.delete('/contents/:id/review-share', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    await revokeReviewShare(app.prisma, auth.user.companyId, contentId(request))
    return reply.status(204).send()
  })

  app.get('/public-review/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
    return reply.send({ data: await readPublicReview(app.prisma, tokenParam(request)) })
  })

  app.get('/public-review/:token/assets/:assetId', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const result = await openPublicReviewAsset(app.prisma, options.storage, tokenParam(request), assetId(request))
    reply.header('Cache-Control', 'private, no-store')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
    reply.type(result.asset.mimeType)
    reply.header('Content-Disposition', `inline; filename="${result.asset.fileName.replace(/["\\\r\n]/g, '_')}"`)
    return reply.send(result.stream)
  })
}

function contentId(request: FastifyRequest) {
  const value = routeParam(request, 'id')
  if (!UUID_PATTERN.test(value)) throw notFound()
  return value
}

function assetId(request: FastifyRequest) {
  const value = routeParam(request, 'assetId')
  if (!UUID_PATTERN.test(value)) throw notFound()
  return value
}

function tokenParam(request: FastifyRequest) {
  return routeParam(request, 'token')
}

function routeParam(request: FastifyRequest, key: string) {
  const value = (request.params as Record<string, unknown> | undefined)?.[key]
  if (typeof value !== 'string') throw notFound()
  return value
}
