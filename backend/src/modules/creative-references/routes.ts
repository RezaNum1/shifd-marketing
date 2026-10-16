import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { allowedKeys, enumValue, object, optionalText } from '../context/normalize.js'
import type { AiImageProvider, AiProvider } from '../ai/provider.js'
import type { AssetStorage } from '../assets/storage.js'
import { createCreativeReferenceBatch, discoverCreativeReferenceFacts, CREATIVE_REFERENCE_ASPECT_RATIOS, CREATIVE_REFERENCE_FORMATS, CREATIVE_REFERENCE_GENERATION_MODES, CREATIVE_REFERENCE_MOODS, CREATIVE_REFERENCE_PLATFORMS, CREATIVE_REFERENCE_SLIDE_COUNT_RANGE, CREATIVE_REFERENCE_STYLES, isCanvaReadyAvailableForImageModel, listCreativeReferenceBatches, openCreativeReference, recoverInterruptedCreativeReferenceBatches, selectCreativeReference, type CreativeReferenceInput, type CreativeReferenceFact } from './service.js'
import type { TopicDiscoveryProvider } from '../ai/provider.js'
import { normalizeAiText } from '../ai/output.js'

export async function creativeReferenceRoutes(app: FastifyInstance, options: { config: AppConfig; aiProvider: AiProvider; factsProvider: TopicDiscoveryProvider; imageProvider: AiImageProvider; storage: AssetStorage }) {
  app.addHook('onReady', async () => {
    await recoverInterruptedCreativeReferenceBatches(app.prisma)
  })

  app.post('/contents/:id/creative-references', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = parseInput(request.body)
    const result = await createCreativeReferenceBatch(
      app.prisma,
      options.config,
      options.aiProvider,
      options.imageProvider,
      options.storage,
      auth.user.companyId,
      auth.user.id,
      routeId(request),
      body,
      idempotencyKey(request),
      (details) => request.log.warn(details, 'Creative reference slide generation failed'),
      (details) => request.log.error(details, 'Creative reference batch processing failed'),
    )
    return reply.status(result.status).send(result.body)
  })

  app.post('/contents/:id/creative-reference-facts', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = parseFactResearchInput(request.body)
    return reply.send({ data: await discoverCreativeReferenceFacts(app.prisma, options.config, options.factsProvider, auth.user.companyId, routeId(request), body.concern) })
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
  allowedKeys(body, ['platform', 'format', 'slideCount', 'style', 'mood', 'aspectRatio', 'additionalInstruction', 'generationMode', 'selectedFacts'], 'body')
  const additionalInstruction = optionalText(body.additionalInstruction, 'additionalInstruction')
  if (additionalInstruction && additionalInstruction.length > 1500) throw validationError('The additional instruction is too long.', { additionalInstruction: 'Use at most 1,500 characters.' })
  const format = body.format === undefined ? 'single_image' : enumValue(body.format, CREATIVE_REFERENCE_FORMATS, 'format')!
  const slideCount = body.slideCount === undefined ? 5 : body.slideCount
  if (!Number.isInteger(slideCount) || (slideCount as number) < CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.min || (slideCount as number) > CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.max) throw validationError('The carousel slide count is invalid.', { slideCount: `Choose ${CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.min}–${CREATIVE_REFERENCE_SLIDE_COUNT_RANGE.max} slides.` })
  return { generationMode: body.generationMode === undefined ? 'original_design' : enumValue(body.generationMode, CREATIVE_REFERENCE_GENERATION_MODES, 'generationMode')!, platform: enumValue(body.platform, CREATIVE_REFERENCE_PLATFORMS, 'platform')!, format, slideCount: slideCount as number, style: enumValue(body.style, CREATIVE_REFERENCE_STYLES, 'style')!, mood: enumValue(body.mood, CREATIVE_REFERENCE_MOODS, 'mood')!, aspectRatio: enumValue(body.aspectRatio, CREATIVE_REFERENCE_ASPECT_RATIOS, 'aspectRatio')!, additionalInstruction, selectedFacts: parseSelectedFacts(body.selectedFacts) }
}

function parseFactResearchInput(value: unknown): { concern: string | null } {
  const body = object(value, 'Fact research request')
  allowedKeys(body, ['concern'], 'body')
  const concern = optionalText(body.concern, 'concern')
  if (concern && concern.length > 1500) throw validationError('The research concern is too long.', { concern: 'Use at most 1,500 characters.' })
  return { concern }
}

function parseSelectedFacts(value: unknown): CreativeReferenceFact[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 6) throw validationError('The selected facts are invalid.', { selectedFacts: 'Choose up to six researched facts.' })
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw validationError('The selected facts are invalid.', { [`selectedFacts.${index}`]: 'Choose a researched fact.' })
    const fact = entry as Record<string, unknown>
    if (typeof fact.id !== 'string' || typeof fact.title !== 'string' || typeof fact.fact !== 'string' || !Array.isArray(fact.sources) || fact.sources.length < 1 || fact.sources.length > 3) throw validationError('The selected facts are invalid.', { [`selectedFacts.${index}`]: 'Each fact needs text and one to three sources.' })
    if (!fact.id.trim() || fact.id.length > 40 || !fact.title.trim() || fact.title.length > 160 || !fact.fact.trim() || fact.fact.length > 800) throw validationError('The selected facts are invalid.', { [`selectedFacts.${index}`]: 'The fact text is too long or incomplete.' })
    const sources = fact.sources.map((source, sourceIndex) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw validationError('The selected fact sources are invalid.', { [`selectedFacts.${index}.sources.${sourceIndex}`]: 'Enter a source title and URL.' })
      const item = source as Record<string, unknown>
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 || typeof item.url !== 'string' || item.url.length > 2048) throw validationError('The selected fact sources are invalid.', { [`selectedFacts.${index}.sources.${sourceIndex}`]: 'Enter a valid source title and URL.' })
      let url: URL
      try { url = new URL(item.url) } catch { throw validationError('The selected fact sources are invalid.', { [`selectedFacts.${index}.sources.${sourceIndex}`]: 'Enter a valid HTTP(S) URL.' }) }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw validationError('The selected fact sources are invalid.', { [`selectedFacts.${index}.sources.${sourceIndex}`]: 'Enter a valid HTTP(S) URL.' })
      return { title: normalizeAiText(item.title), url: url.toString() }
    })
    return { id: fact.id, title: normalizeAiText(fact.title), fact: normalizeAiText(fact.fact), sources }
  })
}

function requireEmptyBody(value: unknown) { if (value !== undefined && value !== null && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).length)) throw badRequest('This endpoint does not accept a request body.') }
function idempotencyKey(request: FastifyRequest) { const value = header(request, 'idempotency-key')?.trim(); if (!value) throw badRequest('Idempotency-Key is required.'); if (value.length > 200) throw validationError('The Idempotency-Key is too long.'); return value }
function routeId(request: FastifyRequest) { const value = (request.params as { id?: unknown }).id; if (typeof value !== 'string' || !uuid(value)) throw notFound(); return value }
function referenceId(request: FastifyRequest) { const value = (request.params as { referenceId?: unknown }).referenceId; if (typeof value !== 'string' || !uuid(value)) throw notFound(); return value }
function header(request: FastifyRequest, name: string) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
