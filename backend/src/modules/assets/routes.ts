import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, notFound, payloadTooLarge, preconditionRequired, unsupportedMedia, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { PLATFORM_CODES, type PlatformCode } from '../content/constants.js'
import { createAsset, deleteAsset, openAssetContent, readAsset, replaceVariantAssets, sanitizeFileName, setCreativeReuse, validateImageForAsset } from './service.js'
import { AssetImageInvalidError, AssetImageUnsupportedError, AssetTooLargeError, type AssetStorage, type InspectedImage, type StoredTempFile } from './storage.js'

export async function assetRoutes(app: FastifyInstance, options: { config: AppConfig; storage: AssetStorage }) {
  app.post('/assets', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const key = idempotencyKey(request)
    if (!request.isMultipart()) throw badRequest('Asset uploads must use multipart form data.')

    let temp: StoredTempFile | null = null
    let handedOff = false
    let fileName = ''
    let image: InspectedImage | null = null
    let purpose: string | undefined
    try {
      for await (const part of request.parts({ limits: { files: 1, fields: 1, parts: 2, fileSize: options.config.assetMaxBytes } })) {
        if (part.type === 'field') {
          if (part.fieldname !== 'purpose' || purpose !== undefined || typeof part.value !== 'string') throw badRequest('Asset upload contains an unsupported form field.')
          purpose = part.value
          continue
        }
        if (part.fieldname !== 'file' || temp) throw badRequest('Asset upload must contain exactly one file field.')
        fileName = sanitizeFileName(part.filename)
        try {
          temp = await options.storage.writeTemp(part.file, options.config.assetMaxBytes)
        } catch (error) {
          if (error instanceof AssetTooLargeError) throw payloadTooLarge()
          throw error
        }
        if ((part.file as typeof part.file & { truncated?: boolean }).truncated) throw payloadTooLarge()
        try {
          image = await options.storage.inspectImage(temp.key)
        } catch (error) {
          if (error instanceof AssetImageUnsupportedError) throw unsupportedMedia('Only PNG and JPEG images are supported.')
          if (error instanceof AssetImageInvalidError) throw validationError('The uploaded image is invalid or corrupt.', { file: 'Upload a valid PNG or JPEG image.' })
          throw error
        }
      }
      if (!temp || !image) throw validationError('An image file is required.', { file: 'Provide one PNG or JPEG file.' })
      if (purpose !== 'creative' && purpose !== 'metric_evidence') throw validationError('The Asset purpose is invalid.', { purpose: 'Use creative or metric_evidence.' })
      validateImageForAsset(image, options.config.assetMaxWidth, options.config.assetMaxHeight)
      const result = await createAsset(app.prisma, options.storage, auth.user.companyId, auth.user.id, { purpose, fileName, temp, image }, key)
      handedOff = true
      return reply.status(result.status).send(result.body)
    } finally {
      if (!handedOff && temp) await options.storage.discardTemp(temp.key).catch(() => undefined)
    }
  })

  app.get('/assets/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    return reply.send({ data: await readAsset(app.prisma, options.storage, auth.user.companyId, routeId(request)) })
  })

  app.get('/assets/:id/content', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = queryObject(request)
    const download = parseDownload(query.download)
    try {
      const result = await openAssetContent(app.prisma, options.storage, auth.user.companyId, routeId(request))
      reply.header('Cache-Control', 'private, no-store')
      reply.type(result.asset.mimeType)
      reply.header('Content-Disposition', `${download ? 'attachment' : 'inline'}; ${contentDisposition(result.asset.fileName)}`)
      return reply.send(result.stream)
    } catch (error) {
      request.log.error({ assetId: routeId(request) }, 'Asset content is unavailable')
      throw error
    }
  })

  app.put('/contents/:id/variants/:platform/assets', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = object(request.body, 'Asset attachment request')
    allowedKeys(body, ['assetIds'], 'body')
    const assetIds = parseAssetIds(body.assetIds)
    const result = await replaceVariantAssets(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), parsePlatform(param(request, 'platform'), 'platform'), assetIds, auth.user.id, request.id)
    reply.header('ETag', result.etag)
    return reply.send({ data: result.content })
  })

  app.put('/contents/:id/variants/linkedin/creative-reuse', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = object(request.body, 'Creative reuse request')
    allowedKeys(body, ['reuseInstagramCreative'], 'body')
    if (typeof body.reuseInstagramCreative !== 'boolean') throw validationError('The reuse setting is invalid.', { reuseInstagramCreative: 'Use true or false.' })
    const result = await setCreativeReuse(app.prisma, auth.user.companyId, routeId(request), ifMatch(request), body.reuseInstagramCreative, auth.user.id, request.id)
    reply.header('ETag', result.etag)
    return reply.send({ data: result.content })
  })

  app.delete('/assets/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    requireEmptyBody(request.body)
    await deleteAsset(app.prisma, options.storage, auth.user.companyId, routeId(request))
    return reply.status(204).send()
  })
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function requireEmptyBody(value: unknown) {
  if (value !== undefined && value !== null && (!isRecord(value) || Object.keys(value).length > 0)) throw badRequest('This endpoint does not accept a request body.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function allowedKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw badRequest(`Unknown property '${label}.${unknown}'.`)
}

function parseAssetIds(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !uuid(item))) throw validationError('Asset IDs are invalid.', { assetIds: 'Use a list of UUIDs.' })
  if (new Set(value).size !== value.length) throw validationError('Asset IDs must be unique.', { assetIds: 'Do not repeat an Asset.' })
  return value as string[]
}

function idempotencyKey(request: FastifyRequest) {
  const value = header(request, 'idempotency-key')?.trim()
  if (!value) throw badRequest('Idempotency-Key is required.')
  if (value.length > 200) throw validationError('The Idempotency-Key is too long.', { 'Idempotency-Key': 'Use at most 200 characters.' })
  return value
}

function ifMatch(request: FastifyRequest) {
  const value = header(request, 'if-match')?.trim()
  if (!value) throw preconditionRequired()
  const match = /^"([1-9]\d*)"$/.exec(value)
  if (!match) throw preconditionRequired()
  const version = Number(match[1])
  if (!Number.isSafeInteger(version)) throw preconditionRequired()
  return version
}

function routeId(request: FastifyRequest) {
  const value = param(request, 'id')
  if (!uuid(value)) throw notFound()
  return value
}

function param(request: FastifyRequest, key: string) {
  const value = (request.params as Record<string, unknown>)[key]
  if (typeof value !== 'string') throw badRequest('The route parameters are invalid.')
  return value
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function queryObject(request: FastifyRequest) {
  const query = request.query
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw badRequest('Query parameters are invalid.')
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (typeof value !== 'string') throw badRequest(`Query parameter '${key}' is invalid.`)
    result[key] = value
  }
  allowedKeys(result, ['download'], 'query')
  return result
}

function parseDownload(value: string | undefined) {
  if (value === undefined) return false
  if (value === 'true') return true
  if (value === 'false') return false
  throw validationError('The download flag is invalid.', { download: 'Use true or false.' })
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download'
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

function parsePlatform(value: string, path: string): PlatformCode {
  if (!PLATFORM_CODES.includes(value as PlatformCode)) throw validationError('The platform is invalid.', { [path]: 'Choose Instagram or LinkedIn.' })
  return value as PlatformCode
}
