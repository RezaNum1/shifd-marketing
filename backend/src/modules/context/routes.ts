import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, preconditionRequired, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { BMC_TYPES, type BmcType } from './constants.js'
import {
  allowedKeys, normalizeWebsite, object, optionalText, parseBusinessTypes, parseLanguage,
  parseObjective, parseStatus, requiredText, textList,
} from './normalize.js'
import {
  createProduct, etag, listProducts, readCompanyContext, readProduct, readResolvedContext, readTaxonomy,
  updateCompanyContext, updateProduct, decodeCursor, type BmcInput, type BrandInput, type CompanyProfileInput, type ProductAggregateInput,
  type ProductInput, type ProductProfileInput,
} from './service.js'

const profileKeys = ['name', 'description', 'industry', 'businessTypes', 'primaryMarket', 'website', 'mission', 'vision', 'positioning', 'coreValueProposition', 'differentiators', 'customerSegments', 'decisionMakers', 'painPoints'] as const
const brandKeys = ['brandVoice', 'toneDescription', 'preferredLanguage', 'communicationGuidelines', 'preferredTerms', 'thingsToAvoid', 'ctaStyle', 'brandKeywords'] as const
const bmcKeys = ['type', 'entries'] as const
const productKeys = ['name', 'description', 'category', 'status', 'url'] as const
const productProfileKeys = ['targetUsers', 'targetOrganizations', 'decisionMakers', 'problemsAddressed', 'valueProposition', 'features', 'benefits', 'differentiators', 'useCases', 'campaignObjective', 'positioning', 'keyMessages', 'proofPoints', 'defaultCta', 'inheritCompanyTone', 'toneOverride'] as const

export async function contextRoutes(app: FastifyInstance, options: { config: AppConfig }) {
  app.get('/company', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const company = await readCompanyContext(app.prisma, auth.user.companyId)
    reply.header('ETag', etag(company.contextVersion))
    return reply.send({ data: company })
  })

  app.put('/company', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const expectedVersion = ifMatch(request)
    const body = object(request.body, 'Company request')
    allowedKeys(body, ['profile', 'brand', 'bmcBlocks'], 'body')
    const profile = parseCompanyProfile(body.profile)
    const brand = parseBrand(body.brand)
    const bmcBlocks = parseBmcBlocks(body.bmcBlocks)
    const company = await updateCompanyContext(app.prisma, auth.user.companyId, expectedVersion, profile, brand, bmcBlocks)
    reply.header('ETag', etag(company.contextVersion))
    return reply.send({ data: company })
  })

  app.get('/context/resolved', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['productId'], 'query')
    const productId = query.productId === undefined || query.productId === '' ? undefined : parseResourceId(query.productId)
    const resolved = await readResolvedContext(app.prisma, auth.user.companyId, productId)
    reply.header('ETag', etag(productId ? `${resolved.versions.company}-${resolved.versions.product}` : resolved.versions.company))
    return reply.send({ data: resolved })
  })

  app.get('/products', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    allowedKeys(query, ['status', 'search', 'limit', 'cursor'], 'query')
    const status = query.status === undefined ? undefined : parseStatus(query.status, 'status')
    const search = query.search === undefined ? undefined : optionalSearch(query.search)
    const limit = parseLimit(query.limit)
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    const listOptions: { limit: number; status?: ProductInput['status']; search?: string; cursor?: NonNullable<ReturnType<typeof decodeCursor>> } = { limit }
    if (status !== undefined) listOptions.status = status
    if (search !== undefined) listOptions.search = search
    if (cursor !== undefined) listOptions.cursor = cursor
    const result = await listProducts(app.prisma, auth.user.companyId, listOptions)
    return reply.send({ data: result.data, page: { limit, nextCursor: result.nextCursor } })
  })

  app.post('/products', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const idempotencyKey = headerValue(request, 'idempotency-key')
    if (!idempotencyKey?.trim()) throw badRequest('Idempotency-Key is required.')
    const input = parseProductInput(request.body)
    const result = await createProduct(app.prisma, auth.user.companyId, input, idempotencyKey.trim(), { product: input })
    if (result.etag) reply.header('ETag', result.etag)
    return reply.status(result.status).send(result.body)
  })

  app.get('/products/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const id = parseResourceId((request.params as { id?: unknown }).id)
    const product = await readProduct(app.prisma, auth.user.companyId, id)
    reply.header('ETag', etag(product.version))
    return reply.send({ data: product })
  })

  app.put('/products/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const id = parseResourceId((request.params as { id?: unknown }).id)
    const expectedVersion = ifMatch(request)
    const body = object(request.body, 'Product request')
    allowedKeys(body, ['product', 'profile'], 'body')
    const aggregate: ProductAggregateInput = { product: parseProductInput(body.product), profile: parseProductProfile(body.profile) }
    const product = await updateProduct(app.prisma, auth.user.companyId, id, expectedVersion, aggregate)
    reply.header('ETag', etag(product.version))
    return reply.send({ data: product })
  })

  app.get('/content-taxonomy', async (request, reply) => {
    await requireAuth(request, reply)
    const taxonomy = await readTaxonomy(app.prisma)
    return reply.send({ data: taxonomy })
  })
}

function parseCompanyProfile(value: unknown): CompanyProfileInput {
  const input = object(value, 'profile')
  allowedKeys(input, profileKeys, 'profile')
  return {
    name: requiredText(input.name, 'profile.name'),
    description: requiredText(input.description, 'profile.description'),
    industry: optionalText(input.industry, 'profile.industry'),
    businessTypes: parseBusinessTypes(input.businessTypes, 'profile.businessTypes'),
    primaryMarket: optionalText(input.primaryMarket, 'profile.primaryMarket'),
    website: normalizeWebsite(input.website, 'profile.website'),
    mission: optionalText(input.mission, 'profile.mission'),
    vision: optionalText(input.vision, 'profile.vision'),
    positioning: optionalText(input.positioning, 'profile.positioning'),
    coreValueProposition: optionalText(input.coreValueProposition, 'profile.coreValueProposition'),
    differentiators: textList(input.differentiators, 'profile.differentiators'),
    customerSegments: textList(input.customerSegments, 'profile.customerSegments'),
    decisionMakers: textList(input.decisionMakers, 'profile.decisionMakers'),
    painPoints: textList(input.painPoints, 'profile.painPoints'),
  }
}

function parseBrand(value: unknown): BrandInput {
  const input = object(value, 'brand')
  allowedKeys(input, brandKeys, 'brand')
  return {
    brandVoice: optionalText(input.brandVoice, 'brand.brandVoice'),
    toneDescription: optionalText(input.toneDescription, 'brand.toneDescription'),
    preferredLanguage: parseLanguage(input.preferredLanguage, 'brand.preferredLanguage'),
    communicationGuidelines: textList(input.communicationGuidelines, 'brand.communicationGuidelines'),
    preferredTerms: textList(input.preferredTerms, 'brand.preferredTerms'),
    thingsToAvoid: textList(input.thingsToAvoid, 'brand.thingsToAvoid'),
    ctaStyle: optionalText(input.ctaStyle, 'brand.ctaStyle'),
    brandKeywords: textList(input.brandKeywords, 'brand.brandKeywords'),
  }
}

function parseBmcBlocks(value: unknown): BmcInput[] {
  if (!Array.isArray(value) || value.length !== BMC_TYPES.length) throw validationError('Company context must contain exactly nine BMC blocks.', { bmcBlocks: 'Provide exactly one block for each approved type.' })
  const seen = new Set<string>()
  return value.map((entry, index) => {
    const input = object(entry, `bmcBlocks[${index}]`)
    allowedKeys(input, bmcKeys, `bmcBlocks[${index}]`)
    if (typeof input.type !== 'string' || !BMC_TYPES.includes(input.type as BmcType)) throw validationError('The BMC type is not approved.', { [`bmcBlocks[${index}].type`]: 'Choose one of the nine approved block types.' })
    if (seen.has(input.type)) throw validationError('BMC block types must be unique.', { [`bmcBlocks[${index}].type`]: 'This BMC type is duplicated.' })
    seen.add(input.type)
    return { type: input.type as BmcType, entries: textList(input.entries, `bmcBlocks[${index}].entries`) }
  })
}

function parseProductInput(value: unknown): ProductInput {
  const input = object(value, 'product')
  allowedKeys(input, productKeys, 'product')
  return {
    name: requiredText(input.name, 'product.name'),
    description: requiredText(input.description, 'product.description'),
    category: optionalText(input.category, 'product.category'),
    status: parseStatus(input.status, 'product.status'),
    url: normalizeWebsite(input.url, 'product.url'),
  }
}

function parseProductProfile(value: unknown): ProductProfileInput {
  const input = object(value, 'profile')
  allowedKeys(input, productProfileKeys, 'profile')
  if (typeof input.inheritCompanyTone !== 'boolean') throw validationError('The product profile inheritance setting is required.', { 'profile.inheritCompanyTone': 'Use true or false.' })
  return {
    targetUsers: textList(input.targetUsers, 'profile.targetUsers'),
    targetOrganizations: textList(input.targetOrganizations, 'profile.targetOrganizations'),
    decisionMakers: textList(input.decisionMakers, 'profile.decisionMakers'),
    problemsAddressed: textList(input.problemsAddressed, 'profile.problemsAddressed'),
    valueProposition: optionalText(input.valueProposition, 'profile.valueProposition'),
    features: textList(input.features, 'profile.features'),
    benefits: textList(input.benefits, 'profile.benefits'),
    differentiators: textList(input.differentiators, 'profile.differentiators'),
    useCases: textList(input.useCases, 'profile.useCases'),
    campaignObjective: parseObjective(input.campaignObjective, 'profile.campaignObjective'),
    positioning: optionalText(input.positioning, 'profile.positioning'),
    keyMessages: textList(input.keyMessages, 'profile.keyMessages'),
    proofPoints: textList(input.proofPoints, 'profile.proofPoints'),
    defaultCta: optionalText(input.defaultCta, 'profile.defaultCta'),
    inheritCompanyTone: input.inheritCompanyTone,
    toneOverride: optionalText(input.toneOverride, 'profile.toneOverride'),
  }
}

function ifMatch(request: FastifyRequest): number {
  const value = headerValue(request, 'if-match')
  if (!value) throw preconditionRequired()
  const match = /^"([1-9]\d*)"$/.exec(value.trim())
  if (!match) throw preconditionRequired('If-Match must contain the resource ETag.')
  const version = Number(match[1])
  if (!Number.isSafeInteger(version)) throw preconditionRequired('If-Match must contain the resource ETag.')
  return version
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers[name]
  return Array.isArray(header) ? header[0] : header
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

function parseResourceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw notFound()
  return value
}
