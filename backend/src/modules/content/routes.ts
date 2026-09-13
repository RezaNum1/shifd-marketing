import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, preconditionRequired, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { OBJECTIVES, PILLARS } from '../context/constants.js'
import { allowedKeys, enumValue, object, optionalText, requiredText, textList } from '../context/normalize.js'
import { DESIGN_STATUSES, IDEA_CONTEXT_TYPES, IDEA_STATUSES, PLATFORM_CODES, PROGRESS_STAGES, type DesignStatus, type IdeaContextType, type IdeaStatus, type ObjectiveCode, type PlatformCode, type ProgressStage } from './constants.js'
import {
  archiveContent, archiveIdea, createContent, createIdea, duplicateContent, duplicateIdea, listContentEvents,
  listContents, listIdeas, progressContent, readContent, restoreIdea, type BriefInput, type ContentCreateInput,
  type ContentPatchInput, type IdeaInput, type MasterInput, type VariantCopyInput, type VisualDirectionInput, updateContent,
  updateIdea, updateVariantCopy,
} from './service.js'
import { decodeCursor, etag } from '../context/service.js'
import type { AiProvider } from '../ai/provider.js'
import { generateContent } from '../ai/service.js'
import { adaptContent } from '../ai/adapt.js'
import { brandCheckContent } from '../ai/brand.js'

const ideaKeys = ['title', 'contextType', 'productId', 'pillarCode', 'objective', 'targetAudience', 'notes'] as const
const briefKeys = ['contextType', 'productId', 'pillarCode', 'objective', 'targetAudience', 'topic', 'angle', 'additionalInstructions'] as const
const masterKeys = ['title', 'coreMessage', 'hook', 'body', 'cta'] as const
const visualDirectionKeys = ['format', 'concept', 'structure', 'notes'] as const
const variantCopyKeys = ['copy', 'cta', 'hashtags', 'visualRecommendation'] as const

export async function contentRoutes(app: FastifyInstance, options: { config: AppConfig; aiProvider: AiProvider }) {
  app.get('/content-ideas', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['status', 'search', 'contextType', 'productId', 'pillarCode', 'objective', 'limit', 'cursor'], 'query')
    const limit = parseLimit(query.limit)
    const result = await listIdeas(app.prisma, auth.user.companyId, {
      limit,
      status: query.status === undefined ? undefined : parseIdeaStatus(query.status, 'status'),
      search: query.search === undefined ? undefined : optionalSearch(query.search),
      contextType: query.contextType === undefined ? undefined : parseContextType(query.contextType, 'contextType'),
      productId: query.productId === undefined || query.productId === '' ? undefined : parseResourceId(query.productId),
      pillarCode: query.pillarCode === undefined ? undefined : parsePillarCode(query.pillarCode, 'pillarCode'),
      objective: query.objective === undefined ? undefined : parseObjective(query.objective, 'objective'),
      cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    })
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })

  app.post('/content-ideas', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const key = idempotencyKey(request)
    const result = await createIdea(app.prisma, auth.user.companyId, auth.user.id, parseIdeaInput(request.body), key)
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.put('/content-ideas/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const idea = await updateIdea(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), parseIdeaInput(request.body))
    reply.header('ETag', etag(idea.version))
    return reply.send({ data: idea })
  })

  app.post('/content-ideas/:id/duplicate', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const result = await duplicateIdea(app.prisma, auth.user.companyId, auth.user.id, routeId(request), ifMatch(request), idempotencyKey(request))
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.post('/content-ideas/:id/archive', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const idea = await archiveIdea(app.prisma, auth.user.companyId, routeId(request), ifMatch(request))
    reply.header('ETag', etag(idea.version))
    return reply.send({ data: idea })
  })

  app.post('/content-ideas/:id/restore', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const idea = await restoreIdea(app.prisma, auth.user.companyId, routeId(request), ifMatch(request))
    reply.header('ETag', etag(idea.version))
    return reply.send({ data: idea })
  })

  app.get('/contents', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['search', 'contextType', 'productId', 'platform', 'pillarCode', 'lifecycleStatus', 'limit', 'cursor'], 'query')
    const limit = parseLimit(query.limit)
    const result = await listContents(app.prisma, auth.user.companyId, {
      limit,
      search: query.search === undefined ? undefined : optionalSearch(query.search),
      contextType: query.contextType === undefined ? undefined : parseContextType(query.contextType, 'contextType'),
      productId: query.productId === undefined || query.productId === '' ? undefined : parseResourceId(query.productId),
      platform: query.platform === undefined ? undefined : parsePlatform(query.platform, 'platform'),
      pillarCode: query.pillarCode === undefined ? undefined : parsePillarCode(query.pillarCode, 'pillarCode'),
      lifecycleStatus: query.lifecycleStatus === undefined ? undefined : parseLifecycleStatus(query.lifecycleStatus),
      cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    })
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })

  app.post('/contents', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await createContent(app.prisma, auth.user.companyId, auth.user.id, parseContentCreate(request.body), idempotencyKey(request), request.id, options.config)
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.post('/contents/:id/generate', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const result = await generateContent(
      app.prisma,
      options.config,
      options.aiProvider,
      auth.user.companyId,
      auth.user.id,
      routeId(request),
      ifMatch(request),
      idempotencyKey(request),
      request.id,
    )
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.post('/contents/:id/adapt', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await adaptContent(
      app.prisma,
      options.config,
      options.aiProvider,
      auth.user.companyId,
      auth.user.id,
      routeId(request),
      ifMatch(request),
      parseAdapt(request.body).platform,
      idempotencyKey(request),
      request.id,
    )
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.post('/contents/:id/brand-check', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const result = await brandCheckContent(
      app.prisma,
      options.config,
      options.aiProvider,
      auth.user.companyId,
      auth.user.id,
      routeId(request),
      ifMatch(request),
      parseAdapt(request.body).platform,
      idempotencyKey(request),
      request.id,
    )
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.get('/contents/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const content = await readContent(app.prisma, auth.user.companyId, routeId(request), options.config)
    reply.header('ETag', etag(content.version))
    return reply.send({ data: content })
  })

  app.patch('/contents/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const content = await updateContent(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), parseContentPatch(request.body), auth.user.id, request.id, options.config)
    reply.header('ETag', etag(content.version))
    return reply.send({ data: content })
  })

  app.put('/contents/:id/variants/:platform', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const content = await updateVariantCopy(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), parsePlatform((request.params as { platform?: unknown }).platform, 'platform'), parseVariantCopy(request.body), auth.user.id, request.id, options.config)
    reply.header('ETag', etag(content.version))
    return reply.send({ data: content })
  })

  app.post('/contents/:id/progress', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = object(request.body, 'Progress request')
    allowedKeys(body, ['stage'], 'body')
    const stage = enumValue(body.stage, PROGRESS_STAGES, 'stage') as ProgressStage
    const content = await progressContent(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), stage, auth.user.id, request.id, options.config)
    reply.header('ETag', etag(content.version))
    return reply.send({ data: content })
  })

  app.post('/contents/:id/duplicate', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const result = await duplicateContent(app.prisma, auth.user.companyId, auth.user.id, routeId(request), ifMatch(request), idempotencyKey(request), request.id, options.config)
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.post('/contents/:id/archive', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    const content = await archiveContent(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), auth.user.id, request.id, options.config)
    reply.header('ETag', etag(content.version))
    return reply.send({ data: content })
  })

  app.get('/contents/:id/events', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['limit', 'cursor'], 'query')
    const limit = parseLimit(query.limit)
    const result = await listContentEvents(app.prisma, auth.user.companyId, routeId(request), { limit, cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor) })
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })
}

function parseIdeaInput(value: unknown): IdeaInput {
  const input = object(value, 'Idea request')
  allowedKeys(input, ideaKeys, 'body')
  const contextType = parseContextType(input.contextType, 'contextType')
  return {
    title: requiredText(input.title, 'title'),
    contextType,
    productId: parseInputProductId(input.productId, contextType),
    pillarCode: parsePillarCode(input.pillarCode, 'pillarCode'),
    objective: parseObjective(input.objective, 'objective'),
    targetAudience: optionalText(input.targetAudience, 'targetAudience'),
    notes: optionalText(input.notes, 'notes'),
  }
}

function parseBrief(value: unknown): BriefInput {
  const input = object(value, 'brief')
  allowedKeys(input, briefKeys, 'brief')
  const contextType = parseContextType(input.contextType, 'brief.contextType')
  return {
    contextType,
    productId: parseInputProductId(input.productId, contextType, 'brief.productId'),
    pillarCode: parsePillarCode(input.pillarCode, 'brief.pillarCode'),
    objective: parseObjective(input.objective, 'brief.objective'),
    targetAudience: requiredText(input.targetAudience, 'brief.targetAudience'),
    topic: requiredText(input.topic, 'brief.topic'),
    angle: optionalText(input.angle, 'brief.angle'),
    additionalInstructions: optionalText(input.additionalInstructions, 'brief.additionalInstructions'),
  }
}

function parseContentCreate(value: unknown): ContentCreateInput {
  const input = object(value, 'Content creation request')
  allowedKeys(input, ['sourceIdeaId', 'brief', 'enabledPlatforms'], 'body')
  return {
    sourceIdeaId: optionalResourceId(input.sourceIdeaId, 'sourceIdeaId'),
    brief: parseBrief(input.brief),
    enabledPlatforms: parseEnabledPlatforms(input.enabledPlatforms, 'enabledPlatforms'),
  }
}

function parseAdapt(value: unknown): { platform: PlatformCode } {
  const input = object(value, 'Adapt request')
  allowedKeys(input, ['platform'], 'body')
  return { platform: parsePlatform(input.platform, 'platform') }
}

function parseContentPatch(value: unknown): ContentPatchInput {
  const input = object(value, 'Content update request')
  allowedKeys(input, ['brief', 'master', 'visualDirection', 'enabledPlatforms', 'designStatus'], 'body')
  if (Object.keys(input).length === 0) throw validationError('Supply at least one editorial section.', { body: 'Provide a Brief, Master, Visual Direction, enabled Platforms, or design status.' })
  const result: ContentPatchInput = {}
  if (Object.hasOwn(input, 'brief')) result.brief = parseBrief(input.brief)
  if (Object.hasOwn(input, 'master')) result.master = input.master === null ? null : parseMaster(input.master)
  if (Object.hasOwn(input, 'visualDirection')) result.visualDirection = input.visualDirection === null ? null : parseVisualDirection(input.visualDirection)
  if (Object.hasOwn(input, 'enabledPlatforms')) result.enabledPlatforms = parseEnabledPlatforms(input.enabledPlatforms, 'enabledPlatforms')
  if (Object.hasOwn(input, 'designStatus')) result.designStatus = enumValue(input.designStatus, DESIGN_STATUSES, 'designStatus') as DesignStatus
  return result
}

function parseMaster(value: unknown): MasterInput {
  const input = object(value, 'master')
  allowedKeys(input, masterKeys, 'master')
  return {
    title: requiredText(input.title, 'master.title'),
    coreMessage: requiredText(input.coreMessage, 'master.coreMessage'),
    hook: requiredText(input.hook, 'master.hook'),
    body: requiredText(input.body, 'master.body'),
    cta: requiredText(input.cta, 'master.cta'),
  }
}

function parseVisualDirection(value: unknown): VisualDirectionInput {
  const input = object(value, 'visualDirection')
  allowedKeys(input, visualDirectionKeys, 'visualDirection')
  return {
    format: requiredText(input.format, 'visualDirection.format'),
    concept: requiredText(input.concept, 'visualDirection.concept'),
    structure: textList(input.structure, 'visualDirection.structure'),
    notes: requiredText(input.notes, 'visualDirection.notes'),
  }
}

function parseVariantCopy(value: unknown): VariantCopyInput {
  const input = object(value, 'Variant copy request')
  allowedKeys(input, variantCopyKeys, 'body')
  return {
    copy: requiredText(input.copy, 'copy'),
    cta: requiredText(input.cta, 'cta'),
    hashtags: requiredText(input.hashtags, 'hashtags'),
    visualRecommendation: requiredText(input.visualRecommendation, 'visualRecommendation'),
  }
}

function parseEnabledPlatforms(value: unknown, path: string): PlatformCode[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((platform) => typeof platform !== 'string')) {
    throw validationError('At least one enabled platform is required.', { [path]: 'Select one or more supported platforms.' })
  }
  const platforms = value.map((platform, index) => parsePlatform(platform, `${path}[${index}]`))
  if (new Set(platforms).size !== platforms.length) throw validationError('Enabled platforms must be unique.', { [path]: 'Do not repeat a platform.' })
  return [...platforms].sort((a, b) => PLATFORM_CODES.indexOf(a) - PLATFORM_CODES.indexOf(b))
}

function parseInputProductId(value: unknown, contextType: IdeaContextType, path = 'productId'): string | null {
  const productId = optionalResourceId(value, path)
  if (contextType === 'company' && productId !== null) throw validationError('Company context cannot select a Product.', { [path]: 'Remove the Product for Company context.' })
  if (contextType === 'product' && productId === null) throw validationError('Product context requires a Product.', { [path]: 'Choose an active Product.' })
  return productId
}

function parseObjective(value: unknown, path: string): ObjectiveCode {
  return enumValue(value, OBJECTIVES, path) as ObjectiveCode
}

function parseContextType(value: unknown, path: string): IdeaContextType {
  return enumValue(value, IDEA_CONTEXT_TYPES, path) as IdeaContextType
}

function parseIdeaStatus(value: unknown, path: string): IdeaStatus {
  return enumValue(value, IDEA_STATUSES, path) as IdeaStatus
}

function parsePlatform(value: unknown, path: string): PlatformCode {
  return enumValue(value, PLATFORM_CODES, path) as PlatformCode
}

function parsePillarCode(value: unknown, path: string): string {
  const code = requiredText(value, path)
  if (!PILLARS.some((pillar) => pillar.code === code)) throw validationError('The selected content pillar is invalid.', { [path]: 'Choose an approved content pillar.' })
  return code
}

function parseLifecycleStatus(value: string): string {
  const valid = ['Draft', 'Generated', 'Adapted', 'Creative In Progress', 'Ready for Review', 'Needs Revision', 'Archived']
  if (!valid.includes(value)) throw validationError('The lifecycle filter is invalid.', { lifecycleStatus: 'Choose an approved lifecycle status.' })
  return value
}

function optionalResourceId(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !uuid(value)) throw validationError('The resource identifier is invalid.', { [path]: 'Use a UUID.' })
  return value
}

function routeId(request: FastifyRequest): string {
  return parseResourceId((request.params as { id?: unknown }).id)
}

function parseResourceId(value: unknown): string {
  if (typeof value !== 'string' || !uuid(value)) throw notFound()
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

function requireEmptyBody(value: unknown) {
  const body = object(value ?? {}, 'Request body')
  allowedKeys(body, [], 'body')
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

function parseLimit(value: string | undefined): number {
  if (value === undefined || value === '') return 20
  if (!/^\d+$/.test(value)) throw validationError('The pagination limit is invalid.', { limit: 'Use an integer from 1 to 100.' })
  const limit = Number(value)
  if (limit < 1 || limit > 100) throw validationError('The pagination limit is invalid.', { limit: 'Use an integer from 1 to 100.' })
  return limit
}

function optionalSearch(value: string): string | undefined {
  const search = value.trim()
  if (search.length > 100) throw validationError('The search term is too long.', { search: 'Use at most 100 characters.' })
  return search || undefined
}
