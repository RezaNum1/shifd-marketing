import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../../config/env.js'
import { badRequest, payloadTooLarge, preconditionRequired, unsupportedMedia, validationError } from '../../shared/errors/AppError.js'
import { requireAuth, requireCsrf, validateOrigin } from '../auth/protection.js'
import { createHash } from 'node:crypto'
import { archiveProspect, confirmProspectImport, createProspect, createProspectImportPreview, listProspects, readProspect, updateProspect, validateProspectInput, type ProspectStatus } from './service.js'
import { parseProspectWorkbook } from './import.js'

const statuses = ['lead', 'qualified', 'customer', 'disqualified'] as const

function id(request: FastifyRequest) {
  const value = (request.params as { id?: unknown }).id
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw badRequest('A valid prospect ID is required.')
  return value
}

function expectedVersion(request: FastifyRequest) {
  const raw = request.headers['if-match']
  if (raw === undefined) throw preconditionRequired()
  const match = typeof raw === 'string' ? /^"?(\d+)"?$/.exec(raw) : null
  if (!match) throw validationError('A current If-Match version is required.')
  return Number(match[1])
}

function sendVersion(reply: { header: (name: string, value: string) => unknown }, version: number) {
  reply.header('ETag', `"${version}"`)
}

function queryString(value: unknown, key: string, max = 240) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max) throw validationError(`${key} is invalid.`)
  return value.trim() || undefined
}

function queryInteger(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw validationError('Pagination values are invalid.')
  return parsed
}

export async function prospectRoutes(app: FastifyInstance, options: { config: AppConfig }) {
  app.get('/prospects', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const query = request.query as Record<string, unknown>
    const unknown = Object.keys(query).find((key) => !['page', 'limit', 'search', 'industry', 'status', 'archived'].includes(key))
    if (unknown) throw validationError(`Unknown prospect list filter: ${unknown}.`)
    const status = query.status === undefined || query.status === '' ? undefined : query.status
    if (status !== undefined && !statuses.includes(status as ProspectStatus)) throw validationError('Prospect status is not supported.')
    const archived = query.archived === 'true'
    if (query.archived !== undefined && query.archived !== 'true' && query.archived !== 'false') throw validationError('Archived filter is invalid.')
    const search = queryString(query.search, 'search', 200)
    const industry = queryString(query.industry, 'industry')
    const result = await listProspects(app.prisma, auth.user.companyId, {
      page: queryInteger(query.page, 1, 100000), limit: queryInteger(query.limit, 25, 100),
      ...(search ? { search } : {}), ...(industry ? { industry } : {}),
      ...(status ? { status: status as ProspectStatus } : {}), archived,
    })
    return reply.send({ data: result.data, page: { number: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } })
  })

  app.post('/prospects', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const record = await createProspect(app.prisma, auth.user.companyId, auth.user.id, validateProspectInput(request.body))
    sendVersion(reply, record.version)
    return reply.status(201).send({ data: record })
  })

  app.post('/prospects/import/preview', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    let filename = ''
    let buffer: Buffer | undefined
    let customMapping: Record<string, unknown> | undefined
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (buffer) throw badRequest('Upload only one workbook.')
        filename = part.filename
        buffer = await part.toBuffer()
        if (part.file.truncated) throw payloadTooLarge('The workbook exceeds the upload size limit.')
      } else if (part.fieldname === 'headerMap') {
        if (typeof part.value !== 'string' || part.value.length > 3000) throw badRequest('The column mapping is invalid.')
        try {
          const parsed = JSON.parse(part.value) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected mapping object.')
          customMapping = parsed as Record<string, unknown>
        } catch { throw badRequest('The column mapping must be valid JSON.') }
      } else throw badRequest('Unsupported import upload field.')
    }
    if (!buffer) throw badRequest('Choose an .xlsx workbook to preview.')
    if (!filename.toLowerCase().endsWith('.xlsx')) throw unsupportedMedia('Only .xlsx workbooks are supported.')
    const parsed = await parseProspectWorkbook(buffer, customMapping)
    const fileDigest = createHash('sha256').update(buffer).digest('hex')
    const preview = await createProspectImportPreview(app.prisma, auth.user.companyId, auth.user.id, parsed, fileDigest)
    return reply.send({ data: preview })
  })

  app.post('/prospects/import/confirm', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const body = request.body as { previewToken?: unknown; selectedRowNumbers?: unknown; confirmed?: unknown } | null
    if (!body || body.confirmed !== true || typeof body.previewToken !== 'string' || !Array.isArray(body.selectedRowNumbers)) throw badRequest('Explicit import confirmation, preview token, and selected rows are required.')
    if (Object.keys(body).some((key) => !['previewToken', 'selectedRowNumbers', 'confirmed'].includes(key))) throw validationError('The import confirmation contains unsupported fields.')
    const result = await confirmProspectImport(app.prisma, auth.user.companyId, auth.user.id, body.previewToken, body.selectedRowNumbers as number[])
    return reply.status(201).send({ data: { ...result.summary, skipped: result.skipped, prospects: result.created } })
  })

  app.get('/prospects/:id', async (request, reply) => {
    const auth = await requireAuth(request, reply)
    const record = await readProspect(app.prisma, auth.user.companyId, id(request))
    sendVersion(reply, record.version)
    return reply.send({ data: record })
  })

  app.put('/prospects/:id', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const record = await updateProspect(app.prisma, auth.user.companyId, id(request), expectedVersion(request), validateProspectInput(request.body))
    sendVersion(reply, record.version)
    return reply.send({ data: record })
  })

  app.post('/prospects/:id/archive', async (request, reply) => {
    validateOrigin(request, options.config)
    const auth = await requireAuth(request, reply)
    await requireCsrf(request)
    const record = await archiveProspect(app.prisma, auth.user.companyId, id(request), expectedVersion(request))
    sendVersion(reply, record.version)
    return reply.send({ data: record })
  })
}
