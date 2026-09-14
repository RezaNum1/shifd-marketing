import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { deriveAdaptationState, deriveLifecycleStatus, deriveResumeStep } from '../src/modules/content/lifecycle.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = {
  ...loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: process.env.DATABASE_URL, ALLOWED_ORIGIN: origin }),
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `phase4-${suffix}@example.test`
const otherEmail = `phase4-other-${suffix}@example.test`
let companyId = ''
let otherCompanyId = ''
let activeProductId = ''
let inactiveProductId = ''
let contentId = ''
let sourceIdeaId = ''

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(app: Awaited<ReturnType<typeof buildApp>>, loginEmail = email) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: loginEmail, password: 'correct-password' } })
  const body = response.json<{ data: { csrfToken: string } }>()
  return { cookie: cookieFrom(response), csrf: body.data.csrfToken }
}

function mutationHeaders(auth: { cookie: string; csrf: string }, version?: number) {
  return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

function companyIdea(title = 'Make approval work visible') {
  return { title, contextType: 'company', productId: null, pillarCode: 'educational', objective: 'awareness', targetAudience: 'Operations teams', notes: 'Use a practical example.' }
}

function productIdea(title = 'Make product onboarding clear') {
  return { title, contextType: 'product', productId: activeProductId, pillarCode: 'product', objective: 'consideration', targetAudience: 'Operations leaders', notes: null }
}

function companyBrief(topic = 'How teams make approval work visible') {
  return { contextType: 'company', productId: null, pillarCode: 'educational', objective: 'awareness', targetAudience: 'Operations teams', topic, angle: null, additionalInstructions: 'Keep it concrete.' }
}

function productBrief(productId = activeProductId) {
  return { contextType: 'product', productId, pillarCode: 'product', objective: 'consideration', targetAudience: 'Operations leaders', topic: 'A clearer approval workflow', angle: 'Start with one handoff.', additionalInstructions: null }
}

function master(title = 'A clear approval workflow starts with one visible handoff') {
  return { title, coreMessage: 'Clear ownership reduces approval delays.', hook: 'Where does the request go next?', body: 'Map the handoff, owner, and decision in one shared workflow.', cta: 'Review your next approval handoff.' }
}

function direction() {
  return { format: 'Carousel', concept: 'Show one visible handoff at a time.', structure: ['Problem', 'Handoff', 'Next step'], notes: 'Keep labels concise.' }
}

function variantCopy(platform: 'instagram' | 'linkedin') {
  return {
    copy: `${platform} copy about visible approval handoffs.`,
    cta: 'Review your next handoff.',
    hashtags: '#workflow #operations',
    visualRecommendation: 'Use a simple handoff diagram.',
  }
}

async function readState() {
  const [ideas, contents, briefs, variants, events, idempotency] = await Promise.all([
    prisma.contentIdea.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    prisma.content.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    prisma.contentBrief.findMany({ where: { content: { companyId } }, orderBy: { contentId: 'asc' } }),
    prisma.platformVariant.findMany({ where: { content: { companyId } }, orderBy: { id: 'asc' } }),
    prisma.contentEvent.findMany({ where: { content: { companyId } }, orderBy: { id: 'asc' } }),
    prisma.requestIdempotency.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
  ])
  return { ideas, contents, briefs, variants, events, idempotency }
}

async function removeCompany(company: string) {
  if (!company) return
  await prisma.contentEvent.deleteMany({ where: { content: { companyId: company } } })
  await prisma.platformVariant.deleteMany({ where: { content: { companyId: company } } })
  await prisma.contentBrief.deleteMany({ where: { content: { companyId: company } } })
  await prisma.content.deleteMany({ where: { companyId: company } })
  await prisma.contentIdea.deleteMany({ where: { companyId: company } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: company } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: company } })
  await prisma.productProfile.deleteMany({ where: { product: { companyId: company } } })
  await prisma.product.deleteMany({ where: { companyId: company } })
  await prisma.authSession.deleteMany({ where: { user: { companyId: company } } })
  await prisma.bmcBlock.deleteMany({ where: { companyId: company } })
  await prisma.brandProfile.deleteMany({ where: { companyId: company } })
  await prisma.aiSettings.deleteMany({ where: { companyId: company } })
  await prisma.user.deleteMany({ where: { companyId: company } })
  await prisma.company.deleteMany({ where: { id: company } })
}

runIntegration('Phase 4 Ideas and Content persistence', () => {
  beforeAll(async () => {
    await prisma.$connect()
    const primary = await bootstrapOperator(prisma, { companyName: 'Phase 4 Company', companyDescription: 'Phase 4 integration company', userName: 'Phase 4 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(prisma, { companyName: 'Phase 4 Other', companyDescription: 'Other integration company', userName: 'Phase 4 Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 4 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const [active, inactive] = await Promise.all([
      prisma.product.create({ data: { companyId, name: 'Active Product', slug: `active-${suffix}`, description: 'An active product for editorial context.', status: 'active', profile: { create: {} } } }),
      prisma.product.create({ data: { companyId, name: 'Inactive Product', slug: `inactive-${suffix}`, description: 'A historical product.', status: 'inactive', profile: { create: {} } } }),
    ])
    activeProductId = active.id
    inactiveProductId = inactive.id
  })

  afterAll(async () => {
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('I01-I06/I12: creates, filters, updates, duplicates, archives, restores, and idempotently replays Ideas', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/content-ideas' })
    expect(unauthenticated.statusCode).toBe(401)
    const created = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-primary' }, payload: companyIdea() })
    expect(created.statusCode).toBe(201)
    sourceIdeaId = created.json().data.id
    expect(created.headers.etag).toBe('"1"')
    const replay = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-primary' }, payload: companyIdea() })
    expect(replay.statusCode).toBe(201)
    expect(replay.json().data.id).toBe(sourceIdeaId)
    const conflict = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-primary' }, payload: companyIdea('A changed payload') })
    expect(conflict.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } })
    const product = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-product' }, payload: productIdea() })
    expect(product.statusCode).toBe(201)
    const rejectsCompanyProduct = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-company-reject' }, payload: { ...companyIdea('Bad company context'), productId: activeProductId } })
    expect(rejectsCompanyProduct.statusCode).toBe(422)
    const rejectsInactive = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-inactive-reject' }, payload: { ...productIdea('Bad inactive context'), productId: inactiveProductId } })
    expect(rejectsInactive.statusCode).toBe(409)
    const listed = await app.inject({ method: 'GET', url: '/api/content-ideas?search=approval&limit=1', headers: { cookie: auth.cookie } })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().data[0].id).toBe(sourceIdeaId)
    const edited = await app.inject({ method: 'PUT', url: `/api/content-ideas/${sourceIdeaId}`, headers: mutationHeaders(auth, 1), payload: { ...companyIdea(), notes: 'Updated editorial note.' } })
    expect(edited.statusCode).toBe(200)
    expect(edited.headers.etag).toBe('"2"')
    expect((await app.inject({ method: 'PUT', url: `/api/content-ideas/${sourceIdeaId}`, headers: mutationHeaders(auth, 1), payload: companyIdea() })).statusCode).toBe(412)
    const duplicated = await app.inject({ method: 'POST', url: `/api/content-ideas/${sourceIdeaId}/duplicate`, headers: { ...mutationHeaders(auth, 2), 'idempotency-key': 'idea-duplicate' }, payload: {} })
    expect(duplicated.statusCode).toBe(201)
    expect(duplicated.json().data).toMatchObject({ status: 'ready', title: 'Make approval work visible (Copy)', relatedContentIds: [] })
    const duplicateReplay = await app.inject({ method: 'POST', url: `/api/content-ideas/${sourceIdeaId}/duplicate`, headers: { ...mutationHeaders(auth, 2), 'idempotency-key': 'idea-duplicate' }, payload: {} })
    expect(duplicateReplay.json().data.id).toBe(duplicated.json().data.id)
    const archived = await app.inject({ method: 'POST', url: `/api/content-ideas/${duplicated.json().data.id}/archive`, headers: mutationHeaders(auth, 1), payload: {} })
    expect(archived.json().data.status).toBe('archived')
    expect((await app.inject({ method: 'PUT', url: `/api/content-ideas/${duplicated.json().data.id}`, headers: mutationHeaders(auth, 2), payload: companyIdea('No edit') })).statusCode).toBe(409)
    const restored = await app.inject({ method: 'POST', url: `/api/content-ideas/${duplicated.json().data.id}/restore`, headers: mutationHeaders(auth, 2), payload: {} })
    expect(restored.json().data.status).toBe('ready')
    await app.close()
  })

  it('C01-C09/C14/C15-C18: creates a complete draft atomically, consumes a Ready source Idea once, and retains historical links', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const source = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': `idea-content-source-${suffix}` }, payload: companyIdea('A source idea for content creation') })
    expect(source.statusCode).toBe(201)
    sourceIdeaId = source.json().data.id
    const rejected = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-invalid' }, payload: { sourceIdeaId, brief: { ...companyBrief(), topic: '   ' }, enabledPlatforms: ['instagram'] } })
    expect(rejected.statusCode).toBe(422)
    expect((await prisma.contentIdea.findUnique({ where: { id: sourceIdeaId } }))?.status).toBe('ready')
    expect(await prisma.content.count({ where: { companyId } })).toBe(0)
    const created = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-primary' }, payload: { sourceIdeaId, brief: companyBrief(), enabledPlatforms: ['instagram', 'linkedin'] } })
    expect(created.statusCode, `POST /api/contents failed: ${created.statusCode} ${created.body}`).toBe(201)
    contentId = created.json().data.id
    expect(created.json().data).toMatchObject({ sourceIdeaId, editorialStage: 'draft', editorialRevision: 1, designStatus: 'not_started', master: null, visualDirection: null, lifecycleStatus: 'Draft', resumeStep: 'brief' })
    expect(created.json().data.title).toBe(companyBrief().topic)
    expect(created.json().data.variants).toHaveLength(2)
    expect((await prisma.contentIdea.findUnique({ where: { id: sourceIdeaId } }))?.status).toBe('used')
    const replay = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-primary' }, payload: { sourceIdeaId, brief: companyBrief(), enabledPlatforms: ['instagram', 'linkedin'] } })
    expect(replay.json().data.id).toBe(contentId)
    expect((await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-used-idea' }, payload: { sourceIdeaId, brief: companyBrief('A second attempt'), enabledPlatforms: ['instagram'] } })).statusCode).toBe(409)
    const productContent = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-product' }, payload: { brief: productBrief(), enabledPlatforms: ['instagram'] } })
    expect(productContent.statusCode).toBe(201)
    const inactive = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-inactive' }, payload: { brief: productBrief(inactiveProductId), enabledPlatforms: ['instagram'] } })
    expect(inactive.statusCode).toBe(409)
    await prisma.product.update({ where: { id: activeProductId }, data: { status: 'inactive' } })
    expect((await app.inject({ method: 'GET', url: `/api/contents/${productContent.json().data.id}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    await prisma.product.update({ where: { id: activeProductId }, data: { status: 'active' } })
    await app.close()
  })

  it('C05: accepts one concurrent first consumer of a Ready source Idea', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const source = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), 'idempotency-key': 'idea-race' }, payload: companyIdea('A concurrent source idea') })
    const raceId = source.json().data.id as string
    const command = (key: string) => app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': key }, payload: { sourceIdeaId: raceId, brief: companyBrief(`Race ${key}`), enabledPlatforms: ['instagram'] } })
    const [first, second] = await Promise.all([command('content-race-a'), command('content-race-b')])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409])
    expect(await prisma.content.count({ where: { sourceIdeaId: raceId } })).toBe(1)
    await app.close()
  })

  it('C10-C13/C19-C24: scopes content, derives live names/title/adaptation, and performs aggregate editorial updates', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const detail = await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })
    expect(detail.headers.etag).toBe('"1"')
    const before = await readState()
    expect((await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/contents', headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    expect(await readState()).toEqual(before)
    const patch = await app.inject({ method: 'PATCH', url: `/api/contents/${contentId}`, headers: mutationHeaders(auth, 1), payload: { brief: companyBrief('Live title fallback'), master: master(), visualDirection: direction(), designStatus: 'in_progress', enabledPlatforms: ['instagram'] } })
    expect(patch.statusCode).toBe(200)
    expect(patch.headers.etag).toBe('"2"')
    expect(patch.json().data).toMatchObject({ title: master().title, editorialRevision: 2, designStatus: 'in_progress', master: master(), visualDirection: direction() })
    expect(patch.json().data.variants.find((item: { platform: string }) => item.platform === 'linkedin').enabled).toBe(false)
    expect((await app.inject({ method: 'PATCH', url: `/api/contents/${contentId}`, headers: mutationHeaders(auth, 1), payload: { designStatus: 'ready' } })).statusCode).toBe(412)
    expect((await app.inject({ method: 'PATCH', url: `/api/contents/${contentId}`, headers: mutationHeaders(auth, 2), payload: { enabledPlatforms: [] } })).statusCode).toBe(422)
    const copied = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram`, headers: mutationHeaders(auth, 2), payload: variantCopy('instagram') })
    expect(copied.statusCode).toBe(200)
    expect(copied.headers.etag).toBe('"3"')
    const instagram = copied.json().data.variants.find((item: { platform: string }) => item.platform === 'instagram')
    const linkedin = copied.json().data.variants.find((item: { platform: string }) => item.platform === 'linkedin')
    expect(instagram).toMatchObject({ revision: 2, adaptationState: 'current' })
    expect(linkedin).toMatchObject({ revision: 1, enabled: false, copy: null })
    const adapted = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/progress`, headers: mutationHeaders(auth, 3), payload: { stage: 'adapted' } })
    expect(adapted.statusCode).toBe(200)
    expect(adapted.json().data.editorialRevision).toBe(3)
    const changedMaster = await app.inject({ method: 'PATCH', url: `/api/contents/${contentId}`, headers: mutationHeaders(auth, adapted.json().data.version), payload: { master: master('A revised visible handoff') } })
    expect(changedMaster.json().data).toMatchObject({ version: 5, editorialRevision: 4, editorialStage: 'draft', lifecycleStatus: 'Draft', resumeStep: 'brief' })
    expect(changedMaster.json().data.variants.find((item: { platform: string }) => item.platform === 'instagram').adaptationState).toBe('needs_adaptation')
    const listed = await app.inject({ method: 'GET', url: '/api/contents?search=revised&limit=1', headers: { cookie: auth.cookie } })
    expect(listed.json().data[0].id).toBe(contentId)
    const candidate = await prisma.content.findFirst({ where: { companyId, id: { not: contentId } } })
    if (!candidate) throw new Error('Expected an interleaved Content fixture.')
    await prisma.content.update({ where: { id: candidate.id }, data: { editorialStage: 'generated' } })
    const draftIds: string[] = []
    let cursor: string | null = null
    do {
      const requestUrl: string = cursor ? `/api/contents?lifecycleStatus=Draft&limit=1&cursor=${encodeURIComponent(cursor)}` : '/api/contents?lifecycleStatus=Draft&limit=1'
      const page: any = await app.inject({ method: 'GET', url: requestUrl, headers: { cookie: auth.cookie } })
      expect(page.statusCode).toBe(200)
      for (const item of page.json().data as Array<{ id: string; lifecycleStatus: string }>) {
        draftIds.push(item.id)
        expect(item.lifecycleStatus).toBe('Draft')
      }
      cursor = page.json().page.nextCursor
    } while (cursor)
    const expectedDraftCount = await prisma.content.count({ where: { companyId, editorialStage: 'draft', archivedAt: null } })
    expect(new Set(draftIds).size).toBe(expectedDraftCount)
    const generatedPage = await app.inject({ method: 'GET', url: '/api/contents?lifecycleStatus=Generated', headers: { cookie: auth.cookie } })
    expect(generatedPage.json().data.map((item: { id: string }) => item.id)).toContain(candidate.id)
    await prisma.content.update({ where: { id: candidate.id }, data: { editorialStage: 'draft' } })

    const expansion = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'content-platform-expansion' }, payload: { brief: companyBrief('Platform expansion'), enabledPlatforms: ['instagram'] } })
    expect(expansion.statusCode).toBe(201)
    const expansionId = expansion.json().data.id as string
    const expansionMaster = await app.inject({ method: 'PATCH', url: `/api/contents/${expansionId}`, headers: mutationHeaders(auth, 1), payload: { master: master('Platform expansion master') } })
    const expansionCopy = await app.inject({ method: 'PUT', url: `/api/contents/${expansionId}/variants/instagram`, headers: mutationHeaders(auth, expansionMaster.json().data.version), payload: variantCopy('instagram') })
    const expansionProgress = await app.inject({ method: 'POST', url: `/api/contents/${expansionId}/progress`, headers: mutationHeaders(auth, expansionCopy.json().data.version), payload: { stage: 'adapted' } })
    const expanded = await app.inject({ method: 'PATCH', url: `/api/contents/${expansionId}`, headers: mutationHeaders(auth, expansionProgress.json().data.version), payload: { enabledPlatforms: ['instagram', 'linkedin'] } })
    expect(expanded.json().data).toMatchObject({ editorialStage: 'draft', lifecycleStatus: 'Draft' })
    expect(expanded.json().data.variants.find((item: { platform: string }) => item.platform === 'linkedin')).toMatchObject({ enabled: true, adaptationState: 'missing' })
    const other = await session(app, otherEmail)
    expect((await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/contents', headers: { cookie: other.cookie } })).json().data).toHaveLength(0)
    await app.close()
  })

  it('C25-C27/C37-C39: validates progress, emits append-only events, and keeps progress out of editorial revision', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const stale = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/progress`, headers: mutationHeaders(auth, 4), payload: { stage: 'adapted' } })
    expect(stale.statusCode).toBe(412)
    const current = await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })
    const version = current.json().data.version as number
    const copy = await app.inject({ method: 'PUT', url: `/api/contents/${contentId}/variants/instagram`, headers: mutationHeaders(auth, version), payload: variantCopy('instagram') })
    const beforeEditorial = copy.json().data.editorialRevision as number
    const progressed = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/progress`, headers: mutationHeaders(auth, copy.json().data.version), payload: { stage: 'adapted' } })
    expect(progressed.statusCode).toBe(200)
    expect(progressed.json().data).toMatchObject({ editorialStage: 'adapted', editorialRevision: beforeEditorial, lifecycleStatus: 'Adapted', resumeStep: 'adapt' })
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/progress`, headers: mutationHeaders(auth, progressed.json().data.version), payload: { stage: 'generated' } })).statusCode).toBe(422)
    const events = await app.inject({ method: 'GET', url: `/api/contents/${contentId}/events?limit=2`, headers: { cookie: auth.cookie } })
    expect(events.statusCode).toBe(200)
    expect(events.json().data.map((event: { type: string }) => event.type)).toContain('progress_changed')
    expect(JSON.stringify(events.json())).not.toContain(auth.csrf)
    if (events.json().page.nextCursor) expect((await app.inject({ method: 'GET', url: `/api/contents/${contentId}/events?limit=2&cursor=${encodeURIComponent(events.json().page.nextCursor)}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    await app.close()
  })

  it('C28-C36/C40: duplicates and archives Content without re-consuming its source, with protected side-effect-free reads', async () => {
    const app = await buildApp({ config, logger: false })
    const auth = await session(app)
    const original = await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })
    const originalVersion = original.json().data.version as number
    const duplicate = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/duplicate`, headers: { ...mutationHeaders(auth, originalVersion), 'idempotency-key': 'content-duplicate' }, payload: {} })
    expect(duplicate.statusCode).toBe(201)
    expect(duplicate.json().data).toMatchObject({ editorialStage: 'draft', lifecycleStatus: 'Draft', resumeStep: 'brief', sourceIdeaId })
    expect(duplicate.json().data.id).not.toBe(contentId)
    expect((await prisma.contentIdea.findUnique({ where: { id: sourceIdeaId } }))?.status).toBe('used')
    const duplicateReplay = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/duplicate`, headers: { ...mutationHeaders(auth, originalVersion), 'idempotency-key': 'content-duplicate' }, payload: {} })
    expect(duplicateReplay.json().data.id).toBe(duplicate.json().data.id)
    const before = await readState()
    expect((await app.inject({ method: 'GET', url: '/api/content-ideas?status=used', headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/contents/${contentId}/events`, headers: { cookie: auth.cookie } })).statusCode).toBe(200)
    expect(await readState()).toEqual(before)
    const beforeArchive = (await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })).json().data
    const archive = await app.inject({ method: 'POST', url: `/api/contents/${contentId}/archive`, headers: mutationHeaders(auth, originalVersion), payload: {} })
    expect(archive.statusCode).toBe(200)
    expect(archive.json().data).toMatchObject({ lifecycleStatus: 'Archived', resumeStep: null, version: beforeArchive.version + 1, editorialRevision: beforeArchive.editorialRevision, sourceIdeaId: beforeArchive.sourceIdeaId, master: beforeArchive.master, visualDirection: beforeArchive.visualDirection, brief: beforeArchive.brief })
    const archivedDetail = await app.inject({ method: 'GET', url: `/api/contents/${contentId}`, headers: { cookie: auth.cookie } })
    expect(archivedDetail.json().data.brief).toEqual(beforeArchive.brief)
    expect(archivedDetail.json().data.variants).toEqual(beforeArchive.variants)
    expect(archivedDetail.json().data.sourceIdeaId).toBe(beforeArchive.sourceIdeaId)
    expect(archivedDetail.json().data.master).toEqual(beforeArchive.master)
    expect(archivedDetail.json().data.visualDirection).toEqual(beforeArchive.visualDirection)
    const archivedEvents = await app.inject({ method: 'GET', url: `/api/contents/${contentId}/events`, headers: { cookie: auth.cookie } })
    expect(archivedEvents.json().data.map((event: { type: string }) => event.type)).toContain('content_archived')
    expect((await app.inject({ method: 'PATCH', url: `/api/contents/${contentId}`, headers: mutationHeaders(auth, archive.json().data.version), payload: { designStatus: 'ready' } })).statusCode).toBe(409)
    const related = await app.inject({ method: 'GET', url: `/api/content-ideas?status=used`, headers: { cookie: auth.cookie } })
    expect(related.json().data.find((idea: { id: string }) => idea.id === sourceIdeaId).relatedContentIds).toContain(contentId)
    const usedIdea = await prisma.contentIdea.findUniqueOrThrow({ where: { id: sourceIdeaId } })
    expect((await app.inject({ method: 'PUT', url: `/api/content-ideas/${sourceIdeaId}`, headers: mutationHeaders(auth, usedIdea.version), payload: companyIdea('Used idea edit') })).statusCode).toBe(409)
    const sourceArchived = await app.inject({ method: 'POST', url: `/api/content-ideas/${sourceIdeaId}/archive`, headers: mutationHeaders(auth, usedIdea.version), payload: {} })
    expect(sourceArchived.statusCode).toBe(200)
    const sourceRestored = await app.inject({ method: 'POST', url: `/api/content-ideas/${sourceIdeaId}/restore`, headers: mutationHeaders(auth, sourceArchived.json().data.version), payload: {} })
    expect(sourceRestored.statusCode).toBe(200)
    expect(sourceRestored.json().data.status).toBe('ready')
    expect(sourceRestored.json().data.relatedContentIds).toContain(contentId)
    const noCsrf = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { origin, cookie: auth.cookie, 'idempotency-key': 'missing-csrf' }, payload: companyIdea('Missing CSRF') })
    expect(noCsrf.statusCode).toBe(403)
    const badOrigin = await app.inject({ method: 'POST', url: '/api/content-ideas', headers: { ...mutationHeaders(auth), origin: 'https://invalid.example', 'idempotency-key': 'bad-origin' }, payload: companyIdea('Bad origin') })
    expect(badOrigin.statusCode).toBe(403)
    await app.close()
  })

  it('keeps pure lifecycle and adaptation selectors deterministic without persisted mirrors', () => {
    expect(deriveLifecycleStatus({ archivedAt: null, editorialStage: 'needs_revision' })).toBe('Needs Revision')
    expect(deriveLifecycleStatus({ archivedAt: new Date(), editorialStage: 'draft' })).toBe('Archived')
    expect(deriveResumeStep({ archivedAt: null, editorialStage: 'creative_in_progress' })).toBe('creative')
    expect(deriveResumeStep({ archivedAt: new Date(), editorialStage: 'draft' })).toBeNull()
    expect(deriveAdaptationState({ copy: 'copy', cta: 'cta', hashtags: '#tag', visualRecommendation: 'visual', adaptedFromMasterRevision: 1, masterRevision: 1, hasMaster: true })).toBe('current')
    expect(deriveAdaptationState({ copy: 'copy', cta: 'cta', hashtags: '#tag', visualRecommendation: 'visual', adaptedFromMasterRevision: 1, masterRevision: 2, hasMaster: true })).toBe('needs_adaptation')
    expect(deriveAdaptationState({ copy: null, cta: null, hashtags: null, visualRecommendation: null, adaptedFromMasterRevision: null, masterRevision: 0, hasMaster: false })).toBe('missing')
  })
})
