import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { productContextReadiness } from '../src/modules/context/readiness.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = {
  ...loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: process.env.DATABASE_URL, ALLOWED_ORIGIN: origin }),
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const companyEmail = `phase3-${suffix}@example.test`
const otherEmail = `phase3-other-${suffix}@example.test`
let companyId = ''
let otherCompanyId = ''
let productId = ''
let productVersion = 1

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
  const body = response.json<{ data: { csrfToken: string } }>()
  return { cookie: cookieFrom(response), csrf: body.data.csrfToken }
}

function mutationHeaders(auth: { cookie: string; csrf: string }, version?: number) {
  return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

function companyPayload(name = 'Shifd Labs Updated') {
  return {
    profile: {
      name, description: 'A deterministic company context for testing.', industry: 'Software', businessTypes: ['B2B'],
      primaryMarket: 'Indonesia', website: 'shifdlabs.com', mission: 'Make work clearer.', vision: 'A trusted workflow.',
      positioning: 'A practical operating layer.', coreValueProposition: 'Clear approvals.', differentiators: ['Focused'],
      customerSegments: ['Internal teams'], decisionMakers: ['Operations leads'], painPoints: ['Scattered work'],
    },
    brand: {
      brandVoice: 'Direct and thoughtful', toneDescription: 'Clear, calm, and useful.', preferredLanguage: 'English',
      communicationGuidelines: ['Use plain language'], preferredTerms: ['workflow'], thingsToAvoid: ['Hype'],
      ctaStyle: 'Invite the next step', brandKeywords: ['clarity'],
    },
    bmcBlocks: ['key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams']
      .map((type) => ({ type, entries: [`${type} entry`] })),
  }
}

const emptyProfile = {
  targetUsers: [], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: null,
  features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: null, positioning: null,
  keyMessages: [], proofPoints: [], defaultCta: null, inheritCompanyTone: true, toneOverride: null,
}

async function contextReadState(companyId: string, productId: string) {
  const [company, brand, bmcBlocks, product, profile, pillars] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { contextVersion: true, version: true } }),
    prisma.brandProfile.findUnique({ where: { companyId }, select: { version: true } }),
    prisma.bmcBlock.findMany({ where: { companyId }, select: { id: true, type: true, version: true }, orderBy: { type: 'asc' } }),
    prisma.product.findUnique({ where: { id: productId }, select: { version: true } }),
    prisma.productProfile.findUnique({ where: { productId }, select: { version: true } }),
    prisma.contentPillar.findMany({ select: { code: true, label: true, sortOrder: true, active: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  return { company, brand, bmcBlocks, product, profile, pillars }
}

runIntegration('Phase 3 Company, Product and Context', () => {
  beforeAll(async () => {
    await prisma.$connect()
    const migratedCompanies = await prisma.company.findMany({ include: { brandProfile: true, bmcBlocks: true } })
    for (const company of migratedCompanies) {
      expect(company.brandProfile).not.toBeNull()
      expect(company.bmcBlocks).toHaveLength(9)
    }
    const first = await bootstrapOperator(prisma, { companyName: 'Phase 3 Company', companyDescription: 'Initial company', userName: 'Phase 3 Founder', userEmail: companyEmail, userPassword: 'correct-password' })
    const second = await bootstrapOperator(prisma, { companyName: 'Other Company', companyDescription: 'Other company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!first.created || !second.created) throw new Error('Phase 3 test bootstrap unexpectedly reused a user.')
    companyId = first.company.id
    otherCompanyId = second.company.id
  })

  afterAll(async () => {
    for (const id of [companyId, otherCompanyId]) {
      if (!id) continue
      await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
      await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
      await prisma.socialAccount.deleteMany({ where: { companyId: id } })
      await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
      await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
      await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
      await prisma.productProfile.deleteMany({ where: { product: { companyId: id } } })
      await prisma.product.deleteMany({ where: { companyId: id } })
      await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
      await prisma.brandProfile.deleteMany({ where: { companyId: id } })
      await prisma.aiSettings.deleteMany({ where: { companyId: id } })
      await prisma.user.deleteMany({ where: { companyId: id } })
      await prisma.company.delete({ where: { id } })
    }
    await prisma.$disconnect()
  })

  it('provisions one empty Brand Profile and exactly nine BMC rows during bootstrap, before any Company GET', async () => {
    const repeated = await bootstrapOperator(prisma, { companyName: 'Ignored duplicate', companyDescription: 'Ignored duplicate', userName: 'Ignored duplicate', userEmail: companyEmail, userPassword: 'correct-password' })
    expect(repeated.created).toBe(false)
    expect(await prisma.brandProfile.count({ where: { companyId } })).toBe(1)
    const blocks = await prisma.bmcBlock.findMany({ where: { companyId }, select: { type: true } })
    expect(blocks).toHaveLength(9)
    expect(new Set(blocks.map((block) => block.type)).size).toBe(9)
  })

  it('C01/C02/C25/C26: authenticates Company reads and protects only mutations', async () => {
    const app = await buildApp({ config, logger: false })
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/company' })
    expect(unauthenticated.statusCode).toBe(401)
    const auth = await session(app, companyEmail)
    const read = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    expect(read.statusCode).toBe(200)
    expect(read.headers.etag).toBe('"1"')
    expect(read.json().data.bmcBlocks).toHaveLength(9)
    const noCsrf = await app.inject({ method: 'PUT', url: '/api/company', headers: { origin, cookie: auth.cookie, 'if-match': '"1"' }, payload: companyPayload() })
    expect(noCsrf.statusCode).toBe(403)
    const badOrigin = await app.inject({ method: 'PUT', url: '/api/company', headers: { origin: 'https://invalid.example', cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'if-match': '"1"' }, payload: companyPayload() })
    expect(badOrigin.statusCode).toBe(403)
    await app.close()
  })

  it('C03-C07/C28: saves Company + Brand + all nine BMC blocks atomically with one revision', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app, companyEmail)
    const before = await prisma.company.findUnique({ where: { id: companyId }, include: { brandProfile: true, bmcBlocks: true } })
    const missing = companyPayload()
    missing.bmcBlocks.pop()
    const rejected = await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, 1), payload: missing })
    expect(rejected.statusCode).toBe(422)
    expect(before?.contextVersion).toBe(1)
    const afterMissing = await prisma.company.findUnique({ where: { id: companyId }, include: { brandProfile: true, bmcBlocks: true } })
    expect(afterMissing).toMatchObject({ name: before?.name, contextVersion: before?.contextVersion, version: before?.version })
    expect(afterMissing?.brandProfile?.version).toBe(before?.brandProfile?.version)
    expect(afterMissing?.bmcBlocks.map((block) => block.version).sort()).toEqual(before?.bmcBlocks.map((block) => block.version).sort())
    const duplicate = companyPayload()
    duplicate.bmcBlocks[8] = { ...duplicate.bmcBlocks[8]!, type: 'key-partners' }
    expect((await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, 1), payload: duplicate })).statusCode).toBe(422)
    const unknown = companyPayload()
    ;(unknown.profile as Record<string, unknown>).unexpected = true
    expect((await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, 1), payload: unknown })).statusCode).toBe(400)
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, 1), payload: companyPayload() })
    expect(saved.statusCode).toBe(200)
    expect(saved.headers.etag).toBe('"2"')
    expect(saved.json().data.contextVersion).toBe(2)
    const after = await prisma.company.findUnique({ where: { id: companyId }, include: { brandProfile: true, bmcBlocks: true } })
    expect(after?.contextVersion).toBe(2)
    expect(after?.name).toBe('Shifd Labs Updated')
    expect(after?.brandProfile?.brandVoice).toBe('Direct and thoughtful')
    expect(after?.bmcBlocks).toHaveLength(9)
    expect(after?.version).toBe((before?.version ?? 0) + 1)
    expect(after?.brandProfile?.version).toBe((before?.brandProfile?.version ?? 0) + 1)
    expect(after?.bmcBlocks.map((block) => block.version).sort()).toEqual(before?.bmcBlocks.map((block) => block.version + 1).sort())
    await expect(prisma.bmcBlock.create({ data: { companyId, type: 'key-partners', entries: [] } })).rejects.toMatchObject({ code: 'P2002' })
    expect((await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, 1), payload: companyPayload() })).statusCode).toBe(412)
    await app.close()
  })

  it('C08-C10/C14/C17: resolves current Company brand dynamically for Company and Product context', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app, companyEmail)
    const create = await app.inject({ method: 'POST', url: '/api/products', headers: { ...mutationHeaders(auth), 'idempotency-key': 'phase3-product-1' }, payload: { name: 'Shifd Approval', description: 'Approval workflow', category: 'Workflow', status: 'active', url: null } })
    expect(create.statusCode).toBe(201)
    expect(create.json().data.profile).toEqual(emptyProfile)
    expect(create.json().data.profile).not.toHaveProperty('brandVoice')
    expect(create.json().data.profile).not.toHaveProperty('bmcBlocks')
    productId = create.json().data.id
    productVersion = create.json().data.version
    expect((await app.inject({ method: 'GET', url: `/api/context/resolved?productId=${productId}`, headers: { cookie: auth.cookie } })).json().data.resolvedBrand.brandVoice).toBe('Direct and thoughtful')
    const company = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const update = companyPayload('Shifd Labs Live')
    update.brand.brandVoice = 'Warm and precise'
    const changed = await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, company.json().data.contextVersion), payload: update })
    expect(changed.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/context/resolved', headers: { cookie: auth.cookie } })).json().data.resolvedBrand.brandVoice).toBe('Warm and precise')
    expect((await app.inject({ method: 'GET', url: `/api/context/resolved?productId=${productId}`, headers: { cookie: auth.cookie } })).json().data.versions.product).toBe(productVersion)
    await app.close()
  })

  it('C12/C13/C15/C16/C18/C19/C23/C24/C28: updates Product + Profile atomically and supports safe override fallback', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app, companyEmail)
    const profile = { ...emptyProfile, inheritCompanyTone: false, toneOverride: 'Product-specific and concise' }
    const staleVersion = productVersion
    const updated = await app.inject({ method: 'PUT', url: `/api/products/${productId}`, headers: mutationHeaders(auth, productVersion), payload: { product: { name: 'Shifd Approval Updated', description: 'Updated workflow', category: 'Workflow', status: 'inactive', url: 'approval.example.com' }, profile } })
    expect(updated.statusCode).toBe(200)
    productVersion = updated.json().data.version
    expect(updated.headers.etag).toBe(`"${productVersion}"`)
    expect((await app.inject({ method: 'PUT', url: `/api/products/${productId}`, headers: mutationHeaders(auth, staleVersion), payload: { product: { name: 'Stale update', description: 'Must not save', category: null, status: 'active', url: null }, profile: emptyProfile } })).statusCode).toBe(412)
    const resolvedOverride = await app.inject({ method: 'GET', url: `/api/context/resolved?productId=${productId}`, headers: { cookie: auth.cookie } })
    expect(resolvedOverride.json().data.resolvedBrand).toMatchObject({ brandVoice: 'Product-specific and concise', ctaStyle: 'Invite the next step', preferredLanguage: 'English' })
    expect(resolvedOverride.json().data.toneSource).toBe('product_override')
    const disabled = await app.inject({ method: 'PUT', url: `/api/products/${productId}`, headers: mutationHeaders(auth, productVersion), payload: { product: { name: 'Shifd Approval Updated', description: 'Updated workflow', category: 'Workflow', status: 'inactive', url: 'https://approval.example.com' }, profile: { ...emptyProfile, inheritCompanyTone: false, toneOverride: '   ' } } })
    expect(disabled.statusCode).toBe(200)
    productVersion = disabled.json().data.version
    expect((await app.inject({ method: 'GET', url: `/api/context/resolved?productId=${productId}`, headers: { cookie: auth.cookie } })).json().data.resolvedBrand.brandVoice).toBe('Warm and precise')
    expect((await app.inject({ method: 'GET', url: `/api/products/${productId}`, headers: { cookie: auth.cookie } })).json().data.status).toBe('inactive')
    expect((await app.inject({ method: 'PUT', url: `/api/products/${productId}`, headers: mutationHeaders(auth, productVersion), payload: { product: { name: 'x', description: 'x', category: null, status: 'inactive', url: null }, profile: { ...emptyProfile, inheritCompanyTone: true }, unknown: true } })).statusCode).toBe(400)
    expect(productContextReadiness(emptyProfile)).toEqual({ ready: false, missing: ['profile.targetUsers', 'profile.problemsAddressed', 'profile.valueProposition', 'profile.features', 'profile.benefits', 'profile.proofPoints'] })
    await app.close()
  })

  it('C11/C20-C22/C27/C29/C30: scopes products, taxonomy and idempotent creation correctly', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app, companyEmail)
    const productsBeforeReplay = await prisma.product.count({ where: { companyId } })
    const replay = await app.inject({ method: 'POST', url: '/api/products', headers: { ...mutationHeaders(auth), 'idempotency-key': 'phase3-product-1' }, payload: { name: 'Shifd Approval', description: 'Approval workflow', category: 'Workflow', status: 'active', url: null } })
    expect(replay.statusCode).toBe(201)
    expect(replay.json().data.id).toBe(productId)
    expect(await prisma.product.count({ where: { companyId } })).toBe(productsBeforeReplay)
    const conflict = await app.inject({ method: 'POST', url: '/api/products', headers: { ...mutationHeaders(auth), 'idempotency-key': 'phase3-product-1' }, payload: { name: 'Different', description: 'Different', category: null, status: 'draft', url: null } })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT')
    const other = await session(app, otherEmail)
    const otherList = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie: other.cookie } })
    expect(otherList.json().data).toHaveLength(0)
    const otherCreate = await app.inject({ method: 'POST', url: '/api/products', headers: { ...mutationHeaders(other), 'idempotency-key': 'phase3-product-1' }, payload: { name: 'Other Product', description: 'Other company product', category: null, status: 'draft', url: null } })
    expect(otherCreate.statusCode).toBe(201)
    expect(otherCreate.json().data.id).not.toBe(productId)
    expect(await prisma.product.count({ where: { companyId: otherCompanyId } })).toBe(1)
    expect((await app.inject({ method: 'GET', url: `/api/products/${productId}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    const taxonomy = await app.inject({ method: 'GET', url: '/api/content-taxonomy', headers: { cookie: auth.cookie } })
    expect(taxonomy.statusCode).toBe(200)
    expect(taxonomy.json().data.pillars.map((x: { code: string }) => x.code)).toEqual(['educational', 'problem', 'product', 'use-case', 'industry', 'thought-leadership', 'company'])
    expect(taxonomy.json().data.objectives.map((x: { code: string }) => x.code)).toEqual(['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'])
    expect(taxonomy.json().data.platforms.map((x: { code: string }) => x.code)).toEqual(['instagram', 'linkedin'])
    await app.close()
  })

  it('keeps all Phase 3 GET endpoints side-effect free in Company, Product, Profile, BMC, and taxonomy tables', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app, companyEmail)
    const before = await contextReadState(companyId, productId)
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: '/api/context/resolved', headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: `/api/context/resolved?productId=${productId}`, headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: '/api/products', headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: `/api/products/${productId}`, headers: { cookie: auth.cookie } }),
      app.inject({ method: 'GET', url: '/api/content-taxonomy', headers: { cookie: auth.cookie } }),
    ])
    expect(responses.every((response) => response.statusCode === 200)).toBe(true)
    expect(await contextReadState(companyId, productId)).toEqual(before)
    await app.close()
  })
})
