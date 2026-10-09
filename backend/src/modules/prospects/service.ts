import { createHash, randomBytes } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { conflict, notFound, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { normalizeProspectName, prospectDomain, type ImportField, type ParsedWorkbook, type ProspectFields } from './import.js'

export const prospectStatuses = ['lead', 'qualified', 'customer', 'disqualified'] as const
export type ProspectStatus = typeof prospectStatuses[number]
export type ProspectInput = ProspectFields & { status?: ProspectStatus }

export interface ImportPreviewRow { rowNumber: number; data: ProspectFields | null; errors: string[]; status: 'valid' | 'invalid' | 'duplicate' | 'ambiguous'; duplicateOf: { id?: string; name: string; archived?: boolean; rowNumber?: number }[] }
export interface ImportPreview extends Omit<ParsedWorkbook, 'rows'> { rows: ImportPreviewRow[]; summary: { total: number; valid: number; invalid: number; duplicates: number; ambiguous: number } }

function dataFor(input: ProspectInput): Omit<Prisma.ProspectUncheckedCreateInput, 'id' | 'companyId' | 'createdBy' | 'normalizedName' | 'normalizedDomain' | 'importFingerprint' | 'importBatchId'> {
  return {
    name: input.name.trim(),
    industry: input.industry?.trim() || null, website: input.website?.trim() || null,
    address: input.address?.trim() || null, employeeCount: input.employeeCount ?? null,
    employeeSize: input.employeeSize?.trim() || null, contactName: input.contactName?.trim() || null,
    contactEmail: input.contactEmail?.trim() || null, contactPhone: input.contactPhone?.trim() || null,
    notes: input.notes?.trim() || null, status: input.status ?? 'lead', source: 'manual',
  }
}

export function prospectCompanyLockKeys(companyId: string): readonly [number, number] {
  const compact = companyId.replaceAll('-', '')
  const first = Number.parseInt(compact.slice(0, 8), 16) | 0
  const second = Number.parseInt(compact.slice(8, 16), 16) | 0
  return [first, second]
}

export async function lockCompany(tx: Prisma.TransactionClient, companyId: string) {
  const [first, second] = prospectCompanyLockKeys(companyId)
  // Prisma binds JS numbers as bigint in raw queries. Cast each bounded signed
  // 32-bit UUID chunk so PostgreSQL resolves its (integer, integer) overload.
  await tx.$queryRaw`SELECT 1::integer AS acquired FROM pg_advisory_xact_lock(${first}::integer, ${second}::integer)`
}

function uniqueConflict(error: unknown): never | void {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw conflict('A prospect with this website domain or import identity already exists.')
}

function rowFingerprint(fileDigest: string, rowNumber: number) {
  return createHash('sha256').update(`${fileDigest}:${rowNumber}`).digest('hex')
}

function normalizedRecord(record: { name: string; normalizedName: string; normalizedDomain: string | null; website: string | null }) {
  return { name: record.name, nameKey: record.normalizedName || normalizeProspectName(record.name), domainKey: record.normalizedDomain || prospectDomain(record.website ?? undefined) }
}

function comparePreview(rows: ParsedWorkbook['rows'], current: Array<{ id: string; name: string; normalizedName: string; normalizedDomain: string | null; website: string | null; archivedAt: Date | null; importFingerprint: string | null }>, fileDigest: string): ImportPreviewRow[] {
  const previousRows: { rowNumber: number; data: ProspectFields }[] = []
  return rows.map((row) => {
    if (!row.data || row.errors.length) return { rowNumber: row.rowNumber, data: row.data, errors: row.errors, status: 'invalid', duplicateOf: [] }
    const nameKey = normalizeProspectName(row.data.name)
    const domainKey = prospectDomain(row.data.website)
    const fingerprint = rowFingerprint(fileDigest, row.rowNumber)
    const exact: ImportPreviewRow['duplicateOf'] = []
    const ambiguous: ImportPreviewRow['duplicateOf'] = []
    for (const record of current) {
      const normalized = normalizedRecord(record)
      if (record.importFingerprint === fingerprint || (domainKey && normalized.domainKey === domainKey)) exact.push({ id: record.id, name: record.name, archived: Boolean(record.archivedAt) })
      else if (normalized.nameKey === nameKey) ambiguous.push({ id: record.id, name: record.name, archived: Boolean(record.archivedAt) })
    }
    for (const previous of previousRows) {
      const priorDomain = prospectDomain(previous.data.website)
      if (domainKey && priorDomain === domainKey) exact.push({ name: previous.data.name, rowNumber: previous.rowNumber })
      else if (normalizeProspectName(previous.data.name) === nameKey) ambiguous.push({ name: previous.data.name, rowNumber: previous.rowNumber })
    }
    previousRows.push({ rowNumber: row.rowNumber, data: row.data })
    if (exact.length) return { rowNumber: row.rowNumber, data: row.data, errors: [], status: 'duplicate', duplicateOf: [...exact, ...ambiguous] }
    if (ambiguous.length) return { rowNumber: row.rowNumber, data: row.data, errors: [], status: 'ambiguous', duplicateOf: ambiguous }
    return { rowNumber: row.rowNumber, data: row.data, errors: [], status: 'valid', duplicateOf: [] }
  })
}

export function validateProspectInput(value: unknown): ProspectInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw validationError('A prospect object is required.')
  const input = value as Record<string, unknown>
  const allowed = ['name', 'industry', 'website', 'address', 'employeeCount', 'employeeSize', 'contactName', 'contactEmail', 'contactPhone', 'notes', 'status']
  const extra = Object.keys(input).find((key) => !allowed.includes(key))
  if (extra) throw validationError(`Unknown prospect field: ${extra}.`)
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 240) throw validationError('Company name is required and must be 240 characters or fewer.', { name: 'Required; maximum 240 characters.' })
  for (const key of allowed.filter((field) => !['name', 'employeeCount', 'status'].includes(field))) {
    const value = input[key]
    if (value !== undefined && value !== null && typeof value !== 'string') throw validationError(`${key} must be text.`)
    if (typeof value === 'string' && value.length > (key === 'notes' || key === 'address' ? 5000 : 500)) throw validationError(`${key} is too long.`)
  }
  if (input.employeeCount !== undefined && input.employeeCount !== null && (!Number.isInteger(input.employeeCount) || Number(input.employeeCount) < 0)) throw validationError('Employee count must be a non-negative whole number.')
  if (input.contactEmail && (typeof input.contactEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail))) throw validationError('Contact email is not valid.')
  if (input.website && (typeof input.website !== 'string' || !/^https?:\/\/[^\s./]+(?:\.[^\s./]+)+(?:[/:?#][^\s]*)?$/i.test(input.website))) throw validationError('Website must be a valid web address.')
  if (input.status !== undefined && !prospectStatuses.includes(input.status as ProspectStatus)) throw validationError('Prospect status is not supported.')
  return input as unknown as ProspectInput
}

export async function createProspect(prisma: PrismaClient, companyId: string, userId: string, input: ProspectInput, source: 'manual' | 'excel_import' = 'manual') {
  const data = dataFor(input)
  try {
    return await prisma.$transaction(async (tx) => {
      await lockCompany(tx, companyId)
      return tx.prospect.create({ data: { ...data, companyId, createdBy: userId, source, normalizedName: normalizeProspectName(input.name), normalizedDomain: prospectDomain(input.website) } })
    })
  } catch (error) { uniqueConflict(error); throw error }
}

export async function listProspects(prisma: PrismaClient, companyId: string, options: { page: number; limit: number; search?: string; industry?: string; status?: ProspectStatus; archived?: boolean }) {
  const where: Prisma.ProspectWhereInput = {
    companyId,
    archivedAt: options.archived ? { not: null } : null,
    ...(options.industry ? { industry: { equals: options.industry, mode: 'insensitive' } } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.search ? { OR: [{ name: { contains: options.search, mode: 'insensitive' } }, { industry: { contains: options.search, mode: 'insensitive' } }, { contactName: { contains: options.search, mode: 'insensitive' } }, { contactEmail: { contains: options.search, mode: 'insensitive' } }, { contactPhone: { contains: options.search, mode: 'insensitive' } }, { website: { contains: options.search, mode: 'insensitive' } }, { address: { contains: options.search, mode: 'insensitive' } }] } : {}),
  }
  const [data, total] = await Promise.all([
    prisma.prospect.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (options.page - 1) * options.limit, take: options.limit }),
    prisma.prospect.count({ where }),
  ])
  return { data, page: options.page, limit: options.limit, total, totalPages: Math.ceil(total / options.limit) }
}

export async function readProspect(prisma: PrismaClient, companyId: string, id: string) {
  const record = await prisma.prospect.findFirst({ where: { id, companyId } })
  if (!record) throw notFound('Prospect not found.')
  return record
}

export async function updateProspect(prisma: PrismaClient, companyId: string, id: string, version: number, input: ProspectInput) {
  const { source: _source, ...data } = dataFor(input)
  let updated: { count: number }
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockCompany(tx, companyId)
      return tx.prospect.updateMany({ where: { id, companyId, version, archivedAt: null }, data: { ...data, normalizedName: normalizeProspectName(input.name), normalizedDomain: prospectDomain(input.website), updatedAt: new Date(), version: { increment: 1 } } })
    })
  } catch (error) { uniqueConflict(error); throw error }
  if (!updated.count) {
    const exists = await prisma.prospect.findFirst({ where: { id, companyId } })
    if (!exists) throw notFound('Prospect not found.')
    throw revisionConflict()
  }
  return readProspect(prisma, companyId, id)
}

export async function archiveProspect(prisma: PrismaClient, companyId: string, id: string, version: number) {
  const result = await prisma.prospect.updateMany({ where: { id, companyId, version, archivedAt: null }, data: { archivedAt: new Date(), updatedAt: new Date(), version: { increment: 1 } } })
  if (!result.count) {
    const exists = await prisma.prospect.findFirst({ where: { id, companyId } })
    if (!exists) throw notFound('Prospect not found.')
    throw revisionConflict()
  }
  return readProspect(prisma, companyId, id)
}

export async function createProspectImportPreview(prisma: PrismaClient, companyId: string, userId: string, parsed: ParsedWorkbook, fileDigest: string) {
  const now = new Date()
  await prisma.prospectImportBatch.deleteMany({ where: { companyId, confirmedAt: null, expiresAt: { lte: now } } })
  const current = await prisma.prospect.findMany({ where: { companyId }, select: { id: true, name: true, normalizedName: true, normalizedDomain: true, website: true, archivedAt: true, importFingerprint: true } })
  const rows = comparePreview(parsed.rows, current, fileDigest)
  const preview: ImportPreview = {
    headers: parsed.headers,
    mapping: parsed.mapping,
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.status === 'valid').length,
      invalid: rows.filter((row) => row.status === 'invalid').length,
      duplicates: rows.filter((row) => row.status === 'duplicate').length,
      ambiguous: rows.filter((row) => row.status === 'ambiguous').length,
    },
  }
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000)
  await prisma.prospectImportBatch.create({
    data: { companyId, createdBy: userId, tokenHash: createHash('sha256').update(token).digest('hex'), fileDigest, preview: preview as unknown as Prisma.InputJsonValue, expiresAt, createdAt: now },
  })
  return { previewToken: token, expiresAt, ...preview }
}

function candidateReferences(candidates: ImportPreviewRow['duplicateOf']) {
  return candidates.map((candidate) => candidate.id ? `id:${candidate.id}` : `row:${candidate.rowNumber}`).sort()
}

export async function confirmProspectImport(prisma: PrismaClient, companyId: string, userId: string, token: string, selectedRows: number[]) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw validationError('The import preview token is invalid.')
  if (!selectedRows.length || selectedRows.length > 5000 || selectedRows.some((row) => !Number.isInteger(row) || row < 2) || new Set(selectedRows).size !== selectedRows.length) throw validationError('Select one or more unique, valid spreadsheet rows to import.')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return prisma.$transaction(async (tx) => {
    await lockCompany(tx, companyId)
    const batch = await tx.prospectImportBatch.findFirst({ where: { companyId, tokenHash } })
    if (!batch) throw notFound('Import preview not found.')
    if (batch.expiresAt <= new Date()) throw conflict('The import preview expired. Upload the workbook again.')
    if (batch.confirmedAt || !batch.preview || !Array.isArray((batch.preview as Prisma.JsonObject).rows)) throw conflict('This import preview has already been confirmed.')
    const preview = batch.preview as unknown as ImportPreview
    const rowsByNumber = new Map(preview.rows.map((row) => [row.rowNumber, row]))
    const selected = selectedRows.map((rowNumber) => {
      const row = rowsByNumber.get(rowNumber)
      if (!row || !row.data || !['valid', 'ambiguous'].includes(row.status)) throw validationError(`Spreadsheet row ${rowNumber} is not eligible for import.`)
      return { row, input: validateProspectInput(row.data) }
    }).sort((a, b) => a.row.rowNumber - b.row.rowNumber)

    type Existing = { id: string; name: string; normalizedName: string; normalizedDomain: string | null; website: string | null; archivedAt: Date | null; importFingerprint: string | null; rowNumber?: number }
    const current: Existing[] = await tx.prospect.findMany({ where: { companyId }, select: { id: true, name: true, normalizedName: true, normalizedDomain: true, website: true, archivedAt: true, importFingerprint: true } })
    const created: Awaited<ReturnType<typeof tx.prospect.create>>[] = []
    const skipped: { rowNumber: number; reason: string }[] = []
    for (const { row, input } of selected) {
      const nameKey = normalizeProspectName(input.name)
      const domainKey = prospectDomain(input.website)
      const fingerprint = rowFingerprint(batch.fileDigest, row.rowNumber)
      const exact = current.filter((record) => record.importFingerprint === fingerprint || Boolean(domainKey && normalizedRecord(record).domainKey === domainKey))
      if (exact.length) {
        skipped.push({ rowNumber: row.rowNumber, reason: 'The same import row or website domain has already been added.' })
        continue
      }
      const ambiguous = current.filter((record) => normalizedRecord(record).nameKey === nameKey)
      const expectedRefs = candidateReferences(row.duplicateOf.filter((candidate) => candidate.id))
      const currentRefs = candidateReferences(ambiguous.filter((record) => record.rowNumber === undefined).map((record) => ({ id: record.id, name: record.name, archived: Boolean(record.archivedAt) })))
      if (row.status === 'valid' && ambiguous.length) throw revisionConflict('A possible duplicate appeared after preview. Review a fresh import preview.')
      if (row.status === 'ambiguous' && expectedRefs.join('|') !== currentRefs.join('|')) throw revisionConflict('Possible duplicate matches changed after preview. Review a fresh import preview.')

      const data = dataFor(input)
      const record = await tx.prospect.create({
        data: {
          ...data, companyId, createdBy: userId, source: 'excel_import', normalizedName: nameKey, normalizedDomain: domainKey,
          importFingerprint: fingerprint, importBatchId: batch.id,
        },
      })
      created.push(record)
      current.push({ id: record.id, name: record.name, normalizedName: nameKey, normalizedDomain: domainKey, website: record.website, archivedAt: null, importFingerprint: fingerprint, rowNumber: row.rowNumber })
    }
    await tx.prospectImportBatch.update({ where: { id: batch.id }, data: { confirmedAt: new Date(), preview: {} } })
    return { created, skipped, summary: { selected: selected.length, imported: created.length, duplicates: skipped.length, invalid: preview.summary.invalid, ambiguous: preview.summary.ambiguous } }
  })
}
