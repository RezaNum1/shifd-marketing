import { Prisma, type PrismaClient } from '@prisma/client'
import { conflict, idempotencyConflict, notFound, revisionConflict, validationError } from '../../shared/errors/AppError.js'
import { BMC_TITLES, BMC_TYPES, type BmcType } from './constants.js'
import { requestHash } from './normalize.js'
import { AI_MODEL_DISPLAY_NAME, AI_MODEL_ID, AI_PROVIDER } from '../ai/constants.js'

export type ContextDb = PrismaClient | Prisma.TransactionClient
type Db = ContextDb
type ProductWithProfile = Prisma.ProductGetPayload<{ include: { profile: true } }> & {
  profile: NonNullable<Prisma.ProductGetPayload<{ include: { profile: true } }>['profile']>
}

export interface CompanyProfileInput {
  name: string
  description: string
  industry: string | null
  businessTypes: string[]
  primaryMarket: string | null
  website: string | null
  mission: string | null
  vision: string | null
  positioning: string | null
  coreValueProposition: string | null
  differentiators: string[]
  customerSegments: string[]
  decisionMakers: string[]
  painPoints: string[]
}

export interface BrandInput {
  brandVoice: string | null
  toneDescription: string | null
  preferredLanguage: string
  communicationGuidelines: string[]
  preferredTerms: string[]
  thingsToAvoid: string[]
  ctaStyle: string | null
  brandKeywords: string[]
}

export interface BmcInput { type: BmcType; entries: string[] }

export interface ProductInput {
  name: string
  description: string
  category: string | null
  status: 'active' | 'inactive' | 'draft'
  url: string | null
}

export interface ProductProfileInput {
  targetUsers: string[]
  targetOrganizations: string[]
  decisionMakers: string[]
  problemsAddressed: string[]
  valueProposition: string | null
  features: string[]
  benefits: string[]
  differentiators: string[]
  useCases: string[]
  campaignObjective: 'awareness' | 'education' | 'engagement' | 'credibility' | 'consideration' | 'discovery' | null
  positioning: string | null
  keyMessages: string[]
  proofPoints: string[]
  defaultCta: string | null
  inheritCompanyTone: boolean
  toneOverride: string | null
}

export interface ProductAggregateInput { product: ProductInput; profile: ProductProfileInput }

/**
 * Explicit setup-only provisioning. It is called by the operator bootstrap,
 * while the Phase 3 migration provisions companies that predate this module.
 * Read selectors deliberately never call this function.
 */
export async function provisionCompanyContext(db: Db, companyId: string) {
  await db.brandProfile.upsert({
    where: { companyId },
    create: { companyId, preferredLanguage: 'English' },
    update: {},
  })
  await db.bmcBlock.createMany({
    data: BMC_TYPES.map((type) => ({ companyId, type })),
    skipDuplicates: true,
  })
  await db.aiSettings.upsert({
    where: { companyId },
    create: { companyId, provider: AI_PROVIDER, modelId: AI_MODEL_ID, modelDisplayName: AI_MODEL_DISPLAY_NAME, generationLanguage: 'English', mode: 'real' },
    update: {},
  })
}

export async function readCompanyContext(db: Db, companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    include: { brandProfile: true, bmcBlocks: true },
  })
  if (!company) throw notFound()
  assertCompanyContextProvisioned(company)
  return mapCompanyContext(company as CompanyWithContext)
}

export async function updateCompanyContext(prisma: PrismaClient, companyId: string, expectedVersion: number, profile: CompanyProfileInput, brand: BrandInput, bmcBlocks: BmcInput[]) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ contextVersion: number }>>`SELECT "context_version" AS "contextVersion" FROM "companies" WHERE "id" = CAST(${companyId} AS UUID) FOR UPDATE`
    if (locked.length === 0) throw notFound()
    if (locked[0]!.contextVersion !== expectedVersion) throw revisionConflict()
    const existing = await tx.company.findUnique({
      where: { id: companyId },
      include: { brandProfile: true, bmcBlocks: true },
    })
    if (!existing) throw notFound()
    assertCompanyContextProvisioned(existing)

    await tx.company.update({
      where: { id: companyId },
      data: {
        name: profile.name,
        description: profile.description,
        industry: profile.industry,
        businessTypes: profile.businessTypes,
        primaryMarket: profile.primaryMarket,
        website: profile.website,
        mission: profile.mission,
        vision: profile.vision,
        positioning: profile.positioning,
        coreValueProposition: profile.coreValueProposition,
        differentiators: profile.differentiators,
        customerSegments: profile.customerSegments,
        decisionMakers: profile.decisionMakers,
        painPoints: profile.painPoints,
        contextVersion: { increment: 1 },
        version: { increment: 1 },
      },
    })
    await tx.brandProfile.update({
      where: { companyId },
      data: {
        brandVoice: brand.brandVoice,
        toneDescription: brand.toneDescription,
        preferredLanguage: brand.preferredLanguage,
        communicationGuidelines: brand.communicationGuidelines,
        preferredTerms: brand.preferredTerms,
        thingsToAvoid: brand.thingsToAvoid,
        ctaStyle: brand.ctaStyle,
        brandKeywords: brand.brandKeywords,
        version: { increment: 1 },
      },
    })
    for (const block of bmcBlocks) {
      await tx.bmcBlock.update({
        where: { companyId_type: { companyId, type: block.type } },
        data: { entries: block.entries, version: { increment: 1 } },
      })
    }
    return readCompanyContext(tx, companyId)
  })
}

export async function readProduct(prisma: ContextDb, companyId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, companyId }, include: { profile: true } })
  if (!product || !product.profile) throw notFound()
  return mapProduct(product)
}

export async function listProducts(prisma: PrismaClient, companyId: string, options: { status?: ProductInput['status']; search?: string; limit: number; cursor?: { createdAt: Date; id: string } }) {
  const filters: Prisma.ProductWhereInput[] = [{ companyId }]
  if (options.status) filters.push({ status: options.status })
  if (options.search) {
    filters.push({ OR: [
      { name: { contains: options.search, mode: 'insensitive' } },
      { description: { contains: options.search, mode: 'insensitive' } },
      { slug: { contains: options.search, mode: 'insensitive' } },
    ] })
  }
  if (options.cursor) filters.push({ OR: [
    { createdAt: { lt: options.cursor.createdAt } },
    { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
  ] })
  const rows = await prisma.product.findMany({
    where: { AND: filters },
    include: { profile: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })
  const hasNext = rows.length > options.limit
  const pageRows = hasNext ? rows.slice(0, options.limit) : rows
  const last = pageRows.at(-1)
  return {
    data: pageRows.filter((row): row is typeof row & { profile: NonNullable<typeof row.profile> } => Boolean(row.profile)).map(mapProduct),
    nextCursor: hasNext && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  }
}

export async function createProduct(prisma: PrismaClient, companyId: string, input: ProductInput, idempotencyKey: string, normalizedBody: unknown) {
  const hash = requestHash(normalizedBody)
  const existing = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation: 'product.create', key: idempotencyKey } } })
  if (existing) return replayOrConflict(existing, hash)

  try {
    return await prisma.$transaction(async (tx) => {
    await tx.requestIdempotency.create({
      data: { companyId, operation: 'product.create', key: idempotencyKey, requestHash: hash, responseStatus: 201, responseBody: {}, resourceId: '00000000-0000-0000-0000-000000000000' },
    })
    const baseSlug = slugForProduct(input.name)
    let created: ProductWithProfile | undefined
    for (let suffix = 0; suffix < 10000; suffix += 1) {
      const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`
      try {
        created = await tx.product.create({
          data: {
            companyId, name: input.name, slug, description: input.description, category: input.category, status: input.status, url: input.url,
            profile: { create: emptyProductProfileCreate() },
          },
          include: { profile: true },
        }) as ProductWithProfile
        break
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error
      }
    }
    if (!created) throw validationError('A unique product slug could not be generated.')
    const body = { data: mapProduct(created) }
    const jsonBody = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue
    await tx.requestIdempotency.update({
      where: { companyId_operation_key: { companyId, operation: 'product.create', key: idempotencyKey } },
      data: { resourceId: created.id, responseBody: jsonBody, responseEtag: etag(created.version) },
    })
    return { replay: false as const, status: 201, body, etag: etag(created.version) }
    })
  } catch (error) {
    // A concurrent request can win the idempotency unique key after the
    // initial lookup. Re-read the committed record and replay or reject it.
    if (isUniqueConstraint(error)) {
      const raced = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation: 'product.create', key: idempotencyKey } } })
      if (raced) return replayOrConflict(raced, hash)
    }
    throw error
  }
}

export async function updateProduct(prisma: PrismaClient, companyId: string, productId: string, expectedVersion: number, aggregate: ProductAggregateInput) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; version: number }>>`SELECT "id", "version" FROM "products" WHERE "id" = CAST(${productId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID) FOR UPDATE`
    if (locked.length === 0) throw notFound()
    if (locked[0]!.version !== expectedVersion) throw revisionConflict()
    await tx.product.update({
      where: { id: productId },
      data: { ...aggregate.product, version: { increment: 1 } },
    })
    await tx.productProfile.upsert({
      where: { productId },
      create: { productId, ...aggregate.profile },
      update: { ...aggregate.profile, version: { increment: 1 } },
    })
    const saved = await tx.product.findUnique({ where: { id: productId }, include: { profile: true } })
    if (!saved?.profile) throw notFound()
    return mapProduct(saved)
  })
}

export async function readResolvedContext(prisma: PrismaClient, companyId: string, productId?: string) {
  return prisma.$transaction((tx) => readResolvedContextFromDb(tx, companyId, productId))
}

export async function readResolvedContextFromDb(db: ContextDb, companyId: string, productId?: string) {
  const company = await readCompanyContext(db, companyId)
  let product: ReturnType<typeof mapProduct> | null = null
  if (productId) product = await readProduct(db, companyId, productId)
  const override = product && !product.profile.inheritCompanyTone && Boolean(product.profile.toneOverride?.trim())
  return {
    company,
    product,
    resolvedBrand: {
      brandVoice: override ? product!.profile.toneOverride : company.brand.brandVoice,
      ctaStyle: company.brand.ctaStyle,
      preferredLanguage: company.brand.preferredLanguage,
    },
    toneSource: override ? 'product_override' as const : 'company' as const,
    versions: { company: company.contextVersion, product: product?.version ?? null },
  }
}

export async function readTaxonomy(prisma: PrismaClient) {
  const pillars = await prisma.contentPillar.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { code: true, label: true } })
  return {
    pillars,
    objectives: [
      'awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery',
    ].map((code) => ({ code, label: code[0]!.toUpperCase() + code.slice(1) })),
    platforms: [{ code: 'instagram', label: 'Instagram' }, { code: 'linkedin', label: 'LinkedIn' }],
  }
}

export const etag = (version: number | string) => `"${version}"`

export function encodeCursor(cursor: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url')
}

export function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') throw new Error('invalid')
    const date = new Date(decoded.createdAt)
    if (Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(decoded.id)) throw new Error('invalid')
    return { createdAt: date, id: decoded.id }
  } catch { throw validationError('The pagination cursor is invalid.', { cursor: 'Use a cursor returned by the products endpoint.' }) }
}

type CompanyWithContext = Prisma.CompanyGetPayload<{ include: { brandProfile: true; bmcBlocks: true } }> & {
  brandProfile: NonNullable<Prisma.CompanyGetPayload<{ include: { brandProfile: true } }>['brandProfile']>
}

function assertCompanyContextProvisioned(company: Prisma.CompanyGetPayload<{ include: { brandProfile: true; bmcBlocks: true } }>) {
  const types = new Set(company.bmcBlocks.map((block) => block.type))
  const hasAllApprovedTypes = BMC_TYPES.every((type) => types.has(type))
  if (!company.brandProfile || company.bmcBlocks.length !== BMC_TYPES.length || types.size !== BMC_TYPES.length || !hasAllApprovedTypes) {
    throw conflict('Company context provisioning is incomplete. Run the approved setup path before reading or saving context.')
  }
}

function mapCompanyContext(company: CompanyWithContext) {
  const blocks = [...company.bmcBlocks].sort((a: { type: string }, b: { type: string }) => BMC_TYPES.indexOf(a.type as BmcType) - BMC_TYPES.indexOf(b.type as BmcType))
  return {
    id: company.id,
    profile: {
      name: company.name, description: company.description, industry: company.industry, businessTypes: company.businessTypes,
      primaryMarket: company.primaryMarket, website: company.website, mission: company.mission, vision: company.vision,
      positioning: company.positioning, coreValueProposition: company.coreValueProposition, differentiators: company.differentiators,
      customerSegments: company.customerSegments, decisionMakers: company.decisionMakers, painPoints: company.painPoints,
    },
    brand: {
      brandVoice: company.brandProfile.brandVoice, toneDescription: company.brandProfile.toneDescription,
      preferredLanguage: company.brandProfile.preferredLanguage, communicationGuidelines: company.brandProfile.communicationGuidelines,
      preferredTerms: company.brandProfile.preferredTerms, thingsToAvoid: company.brandProfile.thingsToAvoid,
      ctaStyle: company.brandProfile.ctaStyle, brandKeywords: company.brandProfile.brandKeywords,
    },
    bmcBlocks: blocks.map((block: { id: string; type: string; entries: string[]; createdAt: Date; updatedAt: Date; version: number }) => ({
      id: block.id, type: block.type, title: BMC_TITLES[block.type as BmcType], entries: block.entries,
      createdAt: block.createdAt.toISOString(), updatedAt: block.updatedAt.toISOString(), version: block.version,
    })),
    reportingTimezone: company.reportingTimezone,
    contextVersion: company.contextVersion,
    createdAt: company.createdAt.toISOString(), updatedAt: company.updatedAt.toISOString(),
  }
}

export function mapProduct(product: { id: string; companyId: string; name: string; slug: string; description: string; category: string | null; status: string; url: string | null; createdAt: Date; updatedAt: Date; version: number; profile: { targetUsers: string[]; targetOrganizations: string[]; decisionMakers: string[]; problemsAddressed: string[]; valueProposition: string | null; features: string[]; benefits: string[]; differentiators: string[]; useCases: string[]; campaignObjective: string | null; positioning: string | null; keyMessages: string[]; proofPoints: string[]; defaultCta: string | null; inheritCompanyTone: boolean; toneOverride: string | null } | null }) {
  if (!product.profile) throw notFound()
  return {
    id: product.id, companyId: product.companyId, name: product.name, slug: product.slug, description: product.description,
    category: product.category, status: product.status, url: product.url,
    profile: {
      targetUsers: product.profile.targetUsers, targetOrganizations: product.profile.targetOrganizations,
      decisionMakers: product.profile.decisionMakers, problemsAddressed: product.profile.problemsAddressed,
      valueProposition: product.profile.valueProposition, features: product.profile.features, benefits: product.profile.benefits,
      differentiators: product.profile.differentiators, useCases: product.profile.useCases,
      campaignObjective: product.profile.campaignObjective, positioning: product.profile.positioning,
      keyMessages: product.profile.keyMessages, proofPoints: product.profile.proofPoints,
      defaultCta: product.profile.defaultCta, inheritCompanyTone: product.profile.inheritCompanyTone, toneOverride: product.profile.toneOverride,
    },
    version: product.version, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(),
  }
}

function emptyProductProfileCreate() {
  return {
    targetUsers: [], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: null,
    features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: null, positioning: null,
    keyMessages: [], proofPoints: [], defaultCta: null, inheritCompanyTone: true, toneOverride: null,
  }
}

function slugForProduct(name: string) {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'product'
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function replayOrConflict(existing: { requestHash: string; responseStatus: number; responseBody: Prisma.JsonValue; responseEtag: string | null }, hash: string) {
  if (existing.requestHash !== hash) throw idempotencyConflict()
  return { replay: true as const, status: existing.responseStatus, body: existing.responseBody as { data: ReturnType<typeof mapProduct> }, etag: existing.responseEtag }
}
