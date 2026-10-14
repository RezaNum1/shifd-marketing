import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { allowedKeys, enumValue, object, optionalText } from '../context/normalize.js'
import type { AiImageProvider, AiProvider } from '../ai/provider.js'
import type { AssetStorage } from '../assets/storage.js'
import { createCreativeReferenceBatch, CREATIVE_REFERENCE_ASPECT_RATIOS, CREATIVE_REFERENCE_FORMATS, CREATIVE_REFERENCE_GENERATION_MODES, CREATIVE_REFERENCE_MOODS, CREATIVE_REFERENCE_PLATFORMS, CREATIVE_REFERENCE_SLIDE_COUNT_RANGE, CREATIVE_REFERENCE_STYLES, isCanvaReadyAvailableForImageModel, listCreativeReferenceBatches, openCreativeReference, selectCreativeReference, type CreativeReferenceInput } from './service.js'

export async function creativeReferenceRoutes(app: FastifyInstance, options: { config: AppConfig; aiProvider: AiProvider; imageProvider: AiImageProvider; storage: AssetStorage }) {
  app.post('/contents/:id/creative-references', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = parseInput(request.body)
    const cancellation = new AbortController()
    const abortOnRequest = () => cancellation.abort()
    const abortOnResponseClose = () => {
      if (!reply.raw.writableEnded) cancellation.abort()
    }
    request.raw.once('aborted', abortOnRequest)
    reply.raw.once('close', abortOnResponseClose)
    let result
    try {
      result = await createCreativeReferenceBatch(app.prisma, options.config, options.aiProvider, options.imageProvider, options.storage, auth.user.companyId, auth.user.id, routeId(request), body, idempotencyKey(request), (details) => request.log.warn(details, 'Creative reference slide generation failed'), cancellation.signal)
    } catch (error) {
      if (cancellation.signal.aborted) return
      throw error
    } finally {
      request.raw.removeListener('aborted', abortOnRequest)
      reply.raw.removeListener('close', abortOnResponseClose)
    }
    if (cancellation.signal.aborted || reply.raw.destroyed) return
    return reply.status(result.status).send(result.body)
  })

  app.get('/contents/:id/creative-references', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: {
      batches: await listCreativeReferenceBatches(app.prisma, auth.user.companyId, routeId(request)),
      canvaReadyAvailable: isCanvaReadyAvailableForImageModel(options.config.openaiImageModel ?? 'gpt-image-2.5-sunburst'),
    } })
  })

  app.post('/contents/:id/creative-references/:referenceId/select', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    return reply.send({ data: await selectCreativeReference(app.prisma, auth.user.companyId, routeId(request), referenceId(request)) })
  })

  app.get('/contents/:id/creative-references/:referenceId/image', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    try {
      const result = await openCreativeReference(app.prisma, options.storage, auth.user.companyId, routeId(request), referenceId(request))
      reply.header('Cache-Control', 'private, no-store')
      reply.type(result.row.mimeType)
      return reply.send(result.stream)
    } catch (error) {
      request.log.error({ contentId: routeId(request), referenceId: referenceId(request) }, 'Creative reference image is unavailable')
      throw error
    }
  })
}

function parseInput(value: unknown): CreativeReferenceInput {
  const body = object(value, 'Creative reference request')
  allowedKeys(body, ['platform', 'format', 'slideCount', 'style', 'mood', 'aspectRatio', 'additionalInstruction', 'generationMode'], 'body')
  const additionalInstruction = optionalText(body.additionalInstruction, 'additionalInstruction')
  if (additionalInstruction && additionalInstruction.length > 500) throw validationError('The additional instruction is too long.', { additionalInstruction: 'Use at most 500 characters.' })
  const format = body.format === undefined ? 'single_image' : enumValue(body.format, CREATIVE_REFERENCE_FORMATS, 'format')!
  const slideCount = body.slideCount === undefined ? 5 : body.slideCount
  if (!Number.isInteger(slideCount) || (slideCount as number) < CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.min || (slideCount as number) > CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.max) throw validationError('The carousel slide count is invalid.', { slideCount: `Choose ${CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.min}–${CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.max} slides.` })
  return { generationMode: body.generationMode === undefined ? 'original_design' : enumValue(body.generationMode, CREATIVE_REFERENCE_GENERATION_MODES, 'generationMode')!, platform: enumValue(body.platform, CREATIVE_REFERENCE_PLATFORMS, 'platform')!, format, slideCount: slideCount as number, style: enumValue(body.style, CREATIVE_REFERENCE_STYLES, 'style')!, mood: enumValue(body.mood, CREATIVE_REFERENCE_MOODS, 'mood')!, aspectRatio: enumValue(body.aspectRatio, CREATIVE_REFERENCE_ASPECT_RATIOS, 'aspectRatio')!, additionalInstruction }
}

function requireEmptyBody(value: unknown) { if (value !== undefined && value !== null && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).length)) throw badRequest('This endpoint does not accept a request body.') }
function idempotencyKey(request: FastifyRequest) { const value = header(request, 'idempotency-key')?.trim(); if (!value) throw badRequest('Idempotency-Key is required.'); if (value.length > 200) throw validationError('The Idempotency-Key is too long.'); return value }
function routeId(request: FastifyRequest) { const value = (request.params as { id?: unknown }).id; if (typeof value !== 'string' || !uuid(value)) throw notFound(); return value }
function referenceId(request: FastifyRequest) { const value = (request.params as { referenceId?: unknown }).referenceId; if (typeof value !== 'string' || !uuid(value)) throw notFound(); return value }
function header(request: FastifyRequest, name: string) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
