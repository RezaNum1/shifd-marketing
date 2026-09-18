import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import type { AiProvider, AiProviderRequest, AiProviderResult } from '../src/modules/ai/provider.js'
import type { Clock } from '../src/shared/time/clock.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for database-backed tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = loadConfig({
  NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: testDatabaseUrl,
  ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000', AI_REQUEST_TIMEOUT_MS: '100',
})
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `phase10-${suffix}@example.test`
const otherEmail = `phase10-other-${suffix}@example.test`
const fixedNow = new Date('2026-09-14T05:00:00.000Z')
let clockMs = fixedNow.getTime()
const clock: Clock = { now: () => new Date(clockMs) }
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let otherCompanyId = ''

const checks = [
  { label: 'Tone / Brand Voice', status: 'pass' },
  { label: 'Messaging Alignment', status: 'pass' },
  { label: 'Audience Fit', status: 'pass' },
  { label: 'Claim Grounding', status: 'pass' },
  { label: 'CTA Alignment', status: 'pass' },
  { label: 'Company/Product Context Alignment', status: 'pass' },
  { label: 'Platform Appropriateness', status: 'pass' },
] as const

class FakeAiProvider implements AiProvider {
  calls = 0
  isConfigured() { return true }
  reset() { this.calls = 0 }
  async generate(_request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1
    return {
      text: JSON.stringify({
        score: 94,
        status: 'aligned',
        recommendation: 'The variant is aligned with the supplied context.',
        checks,
      }),
      inputTokens: 11,
      outputTokens: 17,
      providerRequestId: `phase10-brand-${this.calls}`,
    }
  }
}

const fake = new FakeAiProvider()
type Auth = { cookie: string; csrf: string }
type AnyRecord = Record<string, any>

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(address: string): Promise<Auth> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: address, password: 'correct-password' } })
  if (response.statusCode !== 200) throw new Error(`Test login failed: ${response.statusCode}`)
  const body = response.json<{ data?: { csrfToken?: unknown } }>()
  if (typeof body.data?.csrfToken !== 'string' || !body.data.csrfToken) throw new Error('Test login failed: missing CSRF token.')
  return { cookie: cookieFrom(response), csrf: body.data.csrfToken }
}

function headers(auth: Auth, version?: number, key?: string) {
  return {
    origin,
    cookie: auth.cookie,
    'x-csrf-token': auth.csrf,
    ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    ...(key === undefined ? {} : { 'idempotency-key': key }),
  }
}

function at(hours: number, days = 0) {
  return new Date(clockMs + (days * 24 + hours) * 60 * 60 * 1_000).toISOString()
}

function setClock(date: Date) {
  clockMs = date.getTime()
}

function resetClock() {
  clockMs = fixedNow.getTime()
}

function companyPayload() {
  return {
    profile: {
      name: 'Phase 10 Company', description: 'A deterministic scheduling company.', industry: 'Software', businessTypes: ['B2B'],
      primaryMarket: 'Indonesia', website: 'phase10.example.com', mission: 'Make work clearer.', vision: 'A useful future.', positioning: 'A practical workflow.', coreValueProposition: 'Clear decisions.', differentiators: ['Focused'],
      customerSegments: ['Operations teams'], decisionMakers: ['Operations leads'], painPoints: ['Scattered decisions'],
    },
    brand: {
      brandVoice: 'Direct and thoughtful', toneDescription: 'Clear and calm.', preferredLanguage: 'English', communicationGuidelines: ['Use plain language'],
      preferredTerms: ['workflow'], thingsToAvoid: ['Hype'], ctaStyle: 'Invite a useful next step', brandKeywords: ['clarity'],
    },
    bmcBlocks: ['key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams'].map((type) => ({ type, entries: [`${type} evidence`] })),
  }
}

const master = { title: 'Phase 10 canonical master', coreMessage: 'A grounded core message.', hook: 'A useful hook.', body: 'A practical body based on supplied context.', cta: 'Take a useful next step.' }
const visualDirection = { format: 'Carousel', concept: 'Show a practical workflow.', structure: ['Problem', 'Approach', 'Next step'], notes: 'Use a calm editorial layout.' }

function brief(options: { productId?: string | null; contextType?: 'company' | 'product'; topic?: string } = {}) {
  return {
    contextType: options.contextType ?? 'company',
    productId: options.productId ?? null,
    pillarCode: 'educational',
    objective: 'education',
    targetAudience: 'Lean startup founders',
    topic: options.topic ?? 'A schedulable topic',
    angle: null,
    additionalInstructions: null,
  }
}

async function createApprovedContent(
  auth: Auth,
  key: string,
  options: { platforms?: Array<'instagram' | 'linkedin'>; productId?: string; topic?: string } = {},
) {
  const platforms = options.platforms ?? ['instagram', 'linkedin']
  const created = await app.inject({
    method: 'POST',
    url: '/api/contents',
    headers: headers(auth, undefined, `${key}-create`),
    payload: { brief: brief({ productId: options.productId ?? null, contextType: options.productId ? 'product' : 'company', ...(options.topic === undefined ? {} : { topic: options.topic }) }), enabledPlatforms: platforms },
  })
  expect(created.statusCode).toBe(201)
  const id = created.json().data.id as string
  const saved = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: headers(auth, 1), payload: { master, visualDirection } })
  expect(saved.statusCode).toBe(200)
  await prisma.platformVariant.updateMany({
    where: { contentId: id },
    data: { copy: 'A complete platform adaptation.', cta: 'Continue the conversation.', hashtags: '#workflow', visualRecommendation: 'Use the supplied editorial visual direction.', adaptedFromMasterRevision: 1 },
  })
  let current = saved.json().data as AnyRecord
  for (const stage of ['adapted', 'creative_in_progress', 'ready_for_review'] as const) {
    const progressed = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: headers(auth, current.version), payload: { stage } })
    expect(progressed.statusCode).toBe(200)
    current = progressed.json().data
  }
  for (const platform of platforms) {
    const checked = await app.inject({ method: 'POST', url: `/api/contents/${id}/brand-check`, headers: headers(auth, current.version, `${key}-${platform}-check`), payload: { platform } })
    expect(checked.statusCode).toBe(200)
    current = checked.json().data.content
  }
  const approved = await app.inject({
    method: 'POST',
    url: `/api/contents/${id}/approve`,
    headers: headers(auth, current.version, `${key}-approve`),
    payload: { checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true } },
  })
  expect(approved.statusCode).toBe(201)
  const detail = await app.inject({ method: 'GET', url: `/api/contents/${id}`, headers: { cookie: auth.cookie } })
  expect(detail.statusCode).toBe(200)
  return { id, content: detail.json().data as AnyRecord }
}

async function createDraftContent(auth: Auth, key: string) {
  const response = await app.inject({ method: 'POST', url: '/api/contents', headers: headers(auth, undefined, `${key}-create`), payload: { brief: brief(), enabledPlatforms: ['instagram'] } })
  expect(response.statusCode).toBe(201)
  return { id: response.json().data.id as string, content: response.json().data as AnyRecord }
}

async function createProduct(auth: Auth) {
  const created = await app.inject({ method: 'POST', url: '/api/products', headers: headers(auth, undefined, 'phase10-product-create'), payload: {
    name: 'Phase 10 Product', description: 'A product used by the Calendar fixture.', category: 'Software', status: 'active', url: 'https://phase10-product.example',
  } })
  expect(created.statusCode).toBe(201)
  const product = created.json().data as AnyRecord
  const updated = await app.inject({ method: 'PUT', url: `/api/products/${product.id}`, headers: headers(auth, product.version), payload: {
    product: { name: product.name, description: product.description, category: product.category, status: 'active', url: product.url },
    profile: {
      targetUsers: ['Operations teams'], targetOrganizations: ['Growing companies'], decisionMakers: ['Operations leads'], problemsAddressed: ['Scattered work'],
      valueProposition: 'A clear workflow.', features: ['Planning'], benefits: ['Clarity'], differentiators: ['Focused'], useCases: ['Content planning'], campaignObjective: 'education', positioning: 'Practical workflow',
      keyMessages: ['Make work visible'], proofPoints: ['Used by operators'], defaultCta: 'Learn more', inheritCompanyTone: true, toneOverride: null,
    },
  } })
  expect(updated.statusCode).toBe(200)
  return updated.json().data as AnyRecord
}

function variant(content: AnyRecord, platform: string): AnyRecord {
  const result = content.variants.find((candidate: AnyRecord) => candidate.platform === platform)
  if (!result) throw new Error(`Missing ${platform} variant.`)
  return result
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
  await prisma.publicationRecord.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.contentSchedule.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.content.updateMany({ where: { companyId: id }, data: { currentApprovalId: null } })
  await prisma.approvalAction.deleteMany({ where: { content: { companyId: id } } })
  await prisma.platformVariant.updateMany({ where: { content: { companyId: id } }, data: { currentAssessmentId: null } })
  await prisma.brandAssessment.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
  await prisma.contentEvent.deleteMany({ where: { content: { companyId: id } } })
  await prisma.variantAsset.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.platformVariant.deleteMany({ where: { content: { companyId: id } } })
  await prisma.contentBrief.deleteMany({ where: { content: { companyId: id } } })
  await prisma.content.deleteMany({ where: { companyId: id } })
  await prisma.contentIdea.deleteMany({ where: { companyId: id } })
  await prisma.productProfile.deleteMany({ where: { product: { companyId: id } } })
  await prisma.product.deleteMany({ where: { companyId: id } })
  await prisma.aiSettings.deleteMany({ where: { companyId: id } })
  await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
  await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
  await prisma.brandProfile.deleteMany({ where: { companyId: id } })
  await prisma.user.deleteMany({ where: { companyId: id } })
  await prisma.company.delete({ where: { id } })
}

runIntegration('Phase 10 Scheduling, Calendar, and Manual Publication', () => {
  beforeEach(() => {
    resetClock()
    fake.reset()
  })

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake, clock })
    await seedM2Prompt(app.prisma)
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 10 Company', companyDescription: 'Scheduling test company', userName: 'Phase 10 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 10 Other', companyDescription: 'Other scheduling company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 10 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const auth = await session(email)
    const company = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: headers(auth, company.json().data.contextVersion), payload: companyPayload() })
    expect(saved.statusCode).toBe(200)
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('S100-S104/S116: schedules only approved enabled variants, atomically and with a server-selected current approval', async () => {
    const auth = await session(email)
    const draft = await createDraftContent(auth, 's100-unapproved')
    const unapproved = await app.inject({ method: 'POST', url: `/api/contents/${draft.id}/schedules`, headers: headers(auth, draft.content.version, 's100-unapproved-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(unapproved.statusCode).toBe(409)
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: draft.id } } })).toBe(0)
    const atomic = await createApprovedContent(auth, 's102-atomic', { platforms: ['instagram'] })
    await prisma.platformVariant.create({ data: { contentId: atomic.id, platform: 'linkedin', enabled: false } })
    const atomicRejected = await app.inject({ method: 'POST', url: `/api/contents/${atomic.id}/schedules`, headers: headers(auth, atomic.content.version, 's102-atomic-reject'), payload: {
      schedules: [
        { platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' },
        { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' },
      ],
    } })
    expect(atomicRejected.statusCode).toBe(409)
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: atomic.id } } })).toBe(0)
    const fixture = await createApprovedContent(auth, 's100')
    const before = fixture.content
    const beforeRevisions = { editorial: before.editorialRevision, variants: before.variants.map((item: AnyRecord) => [item.platform, item.revision]) }
    const beforeMasterRevision = await prisma.content.findUniqueOrThrow({ where: { id: fixture.id }, select: { masterRevision: true } })
    const first = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, before.version, 's100-schedule-both'), payload: {
      schedules: [
        { platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' },
        { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' },
      ],
    } })
    expect(first.statusCode).toBe(200)
    const scheduled = first.json().data as AnyRecord
    expect(scheduled).toMatchObject({ lifecycleStatus: 'Scheduled', version: before.version + 1, editorialRevision: beforeRevisions.editorial })
    expect((await prisma.content.findUniqueOrThrow({ where: { id: fixture.id }, select: { masterRevision: true } })).masterRevision).toBe(beforeMasterRevision.masterRevision)
    expect(scheduled.approval.id).toBe(before.approval.id)
    expect(scheduled.variants.map((item: AnyRecord) => [item.platform, item.revision])).toEqual(beforeRevisions.variants)
    expect(scheduled.schedules).toHaveLength(2)
    for (const item of scheduled.schedules as AnyRecord[]) {
      expect(item).toMatchObject({ approvalActionId: before.approval.id, status: 'scheduled', cancelledAt: null })
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/i)
    }
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: fixture.id } } })).toBe(2)

    const firstInstagram = scheduled.schedules.find((item: AnyRecord) => item.platform === 'instagram')
    const firstLinkedIn = scheduled.schedules.find((item: AnyRecord) => item.platform === 'linkedin')
    const second = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, scheduled.version, 's104-schedule-instagram'), payload: {
      schedules: [{ platform: 'instagram', scheduledAt: at(4), timezone: 'Asia/Jakarta' }],
    } })
    expect(second.statusCode).toBe(200)
    const updated = second.json().data as AnyRecord
    const updatedInstagram = updated.schedules.find((item: AnyRecord) => item.platform === 'instagram')
    const unchangedLinkedIn = updated.schedules.find((item: AnyRecord) => item.platform === 'linkedin')
    expect(updatedInstagram.id).toBe(firstInstagram.id)
    expect(updatedInstagram.version).toBe(firstInstagram.version + 1)
    expect(updatedInstagram.scheduledAt).toBe(at(4))
    expect(unchangedLinkedIn).toEqual(firstLinkedIn)
  })

  it('S105-S114: reschedules preserve rows, cancellation is soft/repeat-safe, and invalid states are rejected', async () => {
    const auth = await session(email)
    const fixture = await createApprovedContent(auth, 's105', { platforms: ['instagram'] })
    const scheduled = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, fixture.content.version, 's105-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(scheduled.statusCode).toBe(200)
    let content = scheduled.json().data as AnyRecord
    let target = variant(content, 'instagram')
    const scheduleId = target.schedule.id as string
    const rescheduled = await app.inject({ method: 'PUT', url: `/api/schedules/${scheduleId}`, headers: headers(auth, content.version), payload: { scheduledAt: at(5), timezone: 'Asia/Jakarta' } })
    expect(rescheduled.statusCode).toBe(200)
    content = rescheduled.json().data
    target = variant(content, 'instagram')
    expect(target.schedule).toMatchObject({ id: scheduleId, scheduledAt: at(5), cancelledAt: null, cancellationReason: null, version: 2 })
    const cancelled = await app.inject({ method: 'DELETE', url: `/api/schedules/${scheduleId}`, headers: headers(auth, content.version) })
    expect(cancelled.statusCode).toBe(200)
    content = cancelled.json().data
    target = variant(content, 'instagram')
    expect(target.schedule).toMatchObject({ id: scheduleId, cancelledAt: expect.any(String), cancellationReason: 'user_cancelled', version: 3 })
    expect(content.lifecycleStatus).toBe('Approved')
    const eventCount = await prisma.contentEvent.count({ where: { contentId: fixture.id, eventType: 'schedule_cancelled' } })
    const cancelledVersion = content.version
    const repeated = await app.inject({ method: 'DELETE', url: `/api/schedules/${scheduleId}`, headers: headers(auth, cancelledVersion) })
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json().data.version).toBe(cancelledVersion)
    expect(await prisma.contentEvent.count({ where: { contentId: fixture.id, eventType: 'schedule_cancelled' } })).toBe(eventCount)
    const reactivated = await app.inject({ method: 'PUT', url: `/api/schedules/${scheduleId}`, headers: headers(auth, cancelledVersion), payload: { scheduledAt: at(6), timezone: 'Asia/Jakarta' } })
    expect(reactivated.statusCode).toBe(200)
    expect(variant(reactivated.json().data, 'instagram').schedule).toMatchObject({ id: scheduleId, scheduledAt: at(6), cancelledAt: null, cancellationReason: null, version: 4 })

    const invalid = await createApprovedContent(auth, 's113', { platforms: ['instagram'] })
    const past = await app.inject({ method: 'POST', url: `/api/contents/${invalid.id}/schedules`, headers: headers(auth, invalid.content.version, 's113-past'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(-1), timezone: 'Asia/Jakarta' }] } })
    expect(past.statusCode).toBe(422)
    const timezone = await app.inject({ method: 'POST', url: `/api/contents/${invalid.id}/schedules`, headers: headers(auth, invalid.content.version, 's114-zone'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Mars/Olympus' }] } })
    expect(timezone.statusCode).toBe(422)
    const duplicate = await app.inject({ method: 'POST', url: `/api/contents/${invalid.id}/schedules`, headers: headers(auth, invalid.content.version, 's113-duplicate'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }, { platform: 'instagram', scheduledAt: at(3), timezone: 'Asia/Jakarta' }] } })
    expect(duplicate.statusCode).toBe(422)
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: invalid.id } } })).toBe(0)

    const archived = await createApprovedContent(auth, 's111', { platforms: ['instagram'] })
    const archive = await app.inject({ method: 'POST', url: `/api/contents/${archived.id}/archive`, headers: headers(auth, archived.content.version), payload: {} })
    expect(archive.statusCode).toBe(200)
    const archivedSchedule = await app.inject({ method: 'POST', url: `/api/contents/${archived.id}/schedules`, headers: headers(auth, archive.json().data.version, 's111-archived'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(archivedSchedule.statusCode).toBe(409)

    const published = await createApprovedContent(auth, 's109', { platforms: ['instagram'] })
    const publishedSchedule = await app.inject({ method: 'POST', url: `/api/contents/${published.id}/schedules`, headers: headers(auth, published.content.version, 's109-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    const publishedContent = publishedSchedule.json().data as AnyRecord
    const publishedId = variant(publishedContent, 'instagram').schedule.id as string
    const marked = await app.inject({ method: 'POST', url: `/api/schedules/${publishedId}/publish`, headers: headers(auth, publishedContent.version, 's109-publish'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } })
    expect(marked.statusCode).toBe(200)
    const publishedAfter = marked.json().data.content as AnyRecord
    expect((await app.inject({ method: 'PUT', url: `/api/schedules/${publishedId}`, headers: headers(auth, publishedAfter.version), payload: { scheduledAt: at(7), timezone: 'Asia/Jakarta' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'DELETE', url: `/api/schedules/${publishedId}`, headers: headers(auth, publishedAfter.version) })).statusCode).toBe(409)

    const disabled = await createApprovedContent(auth, 's112', { platforms: ['instagram'] })
    await prisma.platformVariant.update({ where: { contentId_platform: { contentId: disabled.id, platform: 'instagram' } }, data: { enabled: false } })
    const disabledSchedule = await app.inject({ method: 'POST', url: `/api/contents/${disabled.id}/schedules`, headers: headers(auth, disabled.content.version, 's112-disabled'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(disabledSchedule.statusCode).toBe(409)
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: disabled.id } } })).toBe(0)
  })

  it('S115/S117: stale operational writes are rejected without side effects or editorial revision changes', async () => {
    const auth = await session(email)
    const fixture = await createApprovedContent(auth, 's115', { platforms: ['instagram'] })
    const before = fixture.content
    const beforeMasterRevision = await prisma.content.findUniqueOrThrow({ where: { id: fixture.id }, select: { masterRevision: true } })
    const eventCount = await prisma.contentEvent.count({ where: { contentId: fixture.id } })
    const rejected = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, before.version - 1, 's115-stale'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(rejected.statusCode).toBe(412)
    expect(await prisma.contentSchedule.count({ where: { variant: { contentId: fixture.id } } })).toBe(0)
    expect(await prisma.contentEvent.count({ where: { contentId: fixture.id } })).toBe(eventCount)
    expect(await prisma.requestIdempotency.count({ where: { companyId, key: 's115-stale' } })).toBe(0)

    const accepted = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, before.version, 's116-operational'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    expect(accepted.statusCode).toBe(200)
    const after = accepted.json().data as AnyRecord
    expect(after.version).toBe(before.version + 1)
    expect(after.editorialRevision).toBe(before.editorialRevision)
    expect((await prisma.content.findUniqueOrThrow({ where: { id: fixture.id }, select: { masterRevision: true } })).masterRevision).toBe(beforeMasterRevision.masterRevision)
    expect(after.variants.map((item: AnyRecord) => item.revision)).toEqual(before.variants.map((item: AnyRecord) => item.revision))
  })

  it('P100-P106/P108-P112/P115: manual publication is explicit, early-safe, idempotent, correctable, and metric-free', async () => {
    const auth = await session(email)
    const metricRowsBefore = await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } })
    const fixture = await createApprovedContent(auth, 'p100', { platforms: ['instagram'] })
    const scheduled = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, fixture.content.version, 'p100-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(5), timezone: 'Asia/Jakarta' }] } })
    const scheduledContent = scheduled.json().data as AnyRecord
    const schedule = variant(scheduledContent, 'instagram').schedule
    const publicationInput = { publishedAt: new Date(clockMs - 60 * 60 * 1_000).toISOString(), postUrl: 'https://social.example/posts/phase10' }
    const published = await app.inject({ method: 'POST', url: `/api/schedules/${schedule.id}/publish`, headers: headers(auth, scheduledContent.version, 'p100-publish'), payload: publicationInput })
    expect(published.statusCode).toBe(200)
    const result = published.json().data as AnyRecord
    expect(result.content).toMatchObject({ lifecycleStatus: 'Published', version: scheduledContent.version + 1 })
    expect(result.publication).toMatchObject({ id: expect.any(String), variantId: schedule.variantId, scheduleId: schedule.id, scheduledAt: schedule.scheduledAt, postUrl: publicationInput.postUrl, version: 1 })
    const publicationId = result.publication.id as string
    const sameRetry = await app.inject({ method: 'POST', url: `/api/schedules/${schedule.id}/publish`, headers: headers(auth, scheduledContent.version, 'p100-publish'), payload: publicationInput })
    expect(sameRetry.statusCode).toBe(200)
    expect(sameRetry.json().data.publication.id).toBe(publicationId)
    expect(sameRetry.json().data.content.version).toBe(result.content.version)

    const correctionInput = { publishedAt: fixedNow.toISOString(), postUrl: 'http://social.example/corrected' }
    const correction = await app.inject({ method: 'POST', url: `/api/schedules/${schedule.id}/publish`, headers: headers(auth, result.content.version, 'p108-correction'), payload: correctionInput })
    expect(correction.statusCode).toBe(200)
    const corrected = correction.json().data as AnyRecord
    expect(corrected.publication).toMatchObject({ id: publicationId, publishedAt: correctionInput.publishedAt, postUrl: correctionInput.postUrl, scheduledAt: schedule.scheduledAt, version: 2 })
    expect(corrected.content.version).toBe(result.content.version + 1)
    const sameMetadata = await app.inject({ method: 'POST', url: `/api/schedules/${schedule.id}/publish`, headers: headers(auth, corrected.content.version, 'p108-same'), payload: correctionInput })
    expect(sameMetadata.statusCode).toBe(200)
    expect(sameMetadata.json().data.content.version).toBe(corrected.content.version)
    expect(await prisma.publicationRecord.count({ where: { variantId: schedule.variantId } })).toBe(1)
    expect(await prisma.contentEvent.count({ where: { contentId: fixture.id, eventType: 'publication_corrected' } })).toBe(1)

    const invalid = await createApprovedContent(auth, 'p102', { platforms: ['instagram'] })
    const invalidScheduleResponse = await app.inject({ method: 'POST', url: `/api/contents/${invalid.id}/schedules`, headers: headers(auth, invalid.content.version, 'p102-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    const invalidSchedule = variant(invalidScheduleResponse.json().data, 'instagram').schedule
    expect((await app.inject({ method: 'POST', url: `/api/schedules/${invalidSchedule.id}/publish`, headers: headers(auth, invalidScheduleResponse.json().data.version, 'p102-future'), payload: { publishedAt: at(1), postUrl: null } })).statusCode).toBe(422)
    expect((await app.inject({ method: 'POST', url: `/api/schedules/${invalidSchedule.id}/publish`, headers: headers(auth, invalidScheduleResponse.json().data.version, 'p105-url'), payload: { publishedAt: fixedNow.toISOString(), postUrl: 'ftp://invalid.example/post' } })).statusCode).toBe(422)
    expect(await prisma.publicationRecord.count({ where: { variant: { contentId: invalid.id } } })).toBe(0)
    expect(await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } })).toBe(metricRowsBefore)
    expect((await app.inject({ method: 'DELETE', url: `/api/publications/${publicationId}`, headers: headers(auth, corrected.content.version) })).statusCode).toBe(404)
  })

  it('P107/P113-P116: concurrent publication is unique, mixed lifecycle is Scheduled, all publication is Published, and pair FKs reject mismatches', async () => {
    const auth = await session(email)
    const concurrent = await createApprovedContent(auth, 'p107', { platforms: ['instagram'] })
    const scheduledResponse = await app.inject({ method: 'POST', url: `/api/contents/${concurrent.id}/schedules`, headers: headers(auth, concurrent.content.version, 'p107-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    const scheduledContent = scheduledResponse.json().data as AnyRecord
    const scheduleId = variant(scheduledContent, 'instagram').schedule.id as string
    const concurrentResults = await Promise.all([
      app.inject({ method: 'POST', url: `/api/schedules/${scheduleId}/publish`, headers: headers(auth, scheduledContent.version, 'p107-a'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } }),
      app.inject({ method: 'POST', url: `/api/schedules/${scheduleId}/publish`, headers: headers(auth, scheduledContent.version, 'p107-b'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } }),
    ])
    expect(concurrentResults.map((response) => response.statusCode).sort()).toEqual([200, 412])
    expect(await prisma.publicationRecord.count({ where: { variant: { contentId: concurrent.id } } })).toBe(1)

    const mixed = await createApprovedContent(auth, 'p113', { platforms: ['instagram', 'linkedin'] })
    const both = await app.inject({ method: 'POST', url: `/api/contents/${mixed.id}/schedules`, headers: headers(auth, mixed.content.version, 'p113-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' }] } })
    let mixedContent = both.json().data as AnyRecord
    const instagramId = variant(mixedContent, 'instagram').schedule.id as string
    const linkedinId = variant(mixedContent, 'linkedin').schedule.id as string
    const first = await app.inject({ method: 'POST', url: `/api/schedules/${instagramId}/publish`, headers: headers(auth, mixedContent.version, 'p113-instagram'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } })
    expect(first.statusCode).toBe(200)
    mixedContent = first.json().data.content
    expect(mixedContent.lifecycleStatus).toBe('Scheduled')
    const second = await app.inject({ method: 'POST', url: `/api/schedules/${linkedinId}/publish`, headers: headers(auth, mixedContent.version, 'p114-linkedin'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } })
    expect(second.statusCode).toBe(200)
    expect(second.json().data.content.lifecycleStatus).toBe('Published')

    const fkFixture = await createApprovedContent(auth, 'p116', { platforms: ['instagram', 'linkedin'] })
    const fkSchedules = await app.inject({ method: 'POST', url: `/api/contents/${fkFixture.id}/schedules`, headers: headers(auth, fkFixture.content.version, 'p116-schedules'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' }] } })
    const fkContent = fkSchedules.json().data as AnyRecord
    const instagram = variant(fkContent, 'instagram')
    const linkedin = variant(fkContent, 'linkedin')
    const actor = await prisma.user.findFirstOrThrow({ where: { companyId } })
    await expect(prisma.$executeRaw`
      INSERT INTO "publication_records"
        ("id", "variant_id", "schedule_id", "scheduled_at_snapshot", "published_at", "post_url", "marked_by", "recorded_at", "updated_at", "version")
      VALUES
        (CAST(${randomUUID()} AS UUID), CAST(${instagram.id} AS UUID), CAST(${linkedin.schedule.id} AS UUID), ${new Date(at(2))}, ${fixedNow}, NULL, CAST(${actor.id} AS UUID), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    `).rejects.toThrow()
    expect(await prisma.publicationRecord.count({ where: { variant: { contentId: fkFixture.id } } })).toBe(0)
  })

  it('R100-R104: Request Revision atomically cancels unpublished schedules, preserves publication evidence, and leaves editorial revision unchanged until edit', async () => {
    const auth = await session(email)
    const noPublication = await createApprovedContent(auth, 'r100', { platforms: ['instagram', 'linkedin'] })
    const scheduled = await app.inject({ method: 'POST', url: `/api/contents/${noPublication.id}/schedules`, headers: headers(auth, noPublication.content.version, 'r100-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' }] } })
    const scheduledContent = scheduled.json().data as AnyRecord
    const requested = await app.inject({ method: 'POST', url: `/api/contents/${noPublication.id}/request-revision`, headers: headers(auth, scheduledContent.version, 'r100-request'), payload: { reason: 'Founder requested a new editorial pass.' } })
    expect(requested.statusCode).toBe(201)
    const revised = requested.json().data.content as AnyRecord
    expect(revised).toMatchObject({ approval: null, editorialStage: 'needs_revision', lifecycleStatus: 'Needs Revision', editorialRevision: noPublication.content.editorialRevision, version: scheduledContent.version + 1 })
    const cancelledRows = await prisma.contentSchedule.findMany({ where: { variant: { contentId: noPublication.id } }, orderBy: { variantId: 'asc' } })
    expect(cancelledRows).toHaveLength(2)
    expect(cancelledRows.every((row) => row.cancelledAt && row.cancellationReason === 'request_revision')).toBe(true)
    const edited = await app.inject({ method: 'PATCH', url: `/api/contents/${noPublication.id}`, headers: headers(auth, revised.version), payload: { master: { ...master, body: 'Edited after explicit Request Revision.' } } })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().data.editorialRevision).toBe(noPublication.content.editorialRevision + 1)

    const mixed = await createApprovedContent(auth, 'r101', { platforms: ['instagram', 'linkedin'] })
    const mixedScheduled = await app.inject({ method: 'POST', url: `/api/contents/${mixed.id}/schedules`, headers: headers(auth, mixed.content.version, 'r101-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: at(3), timezone: 'Asia/Jakarta' }] } })
    let mixedContent = mixedScheduled.json().data as AnyRecord
    const publishedId = variant(mixedContent, 'instagram').schedule.id as string
    const unpublishedId = variant(mixedContent, 'linkedin').schedule.id as string
    const publication = await app.inject({ method: 'POST', url: `/api/schedules/${publishedId}/publish`, headers: headers(auth, mixedContent.version, 'r101-publish'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } })
    mixedContent = publication.json().data.content
    const mixedRevision = await app.inject({ method: 'POST', url: `/api/contents/${mixed.id}/request-revision`, headers: headers(auth, mixedContent.version, 'r101-request'), payload: { reason: 'Revise the remaining unpublished platform.' } })
    expect(mixedRevision.statusCode).toBe(201)
    const mixedRevised = mixedRevision.json().data.content as AnyRecord
    expect(mixedRevised.variants.find((item: AnyRecord) => item.platform === 'instagram').publication).not.toBeNull()
    expect(mixedRevised.variants.find((item: AnyRecord) => item.platform === 'linkedin').schedule).toMatchObject({ id: unpublishedId, cancellationReason: 'request_revision' })
    expect(await prisma.publicationRecord.count({ where: { variant: { contentId: mixed.id } } })).toBe(1)
    expect((await prisma.contentEvent.count({ where: { contentId: mixed.id, eventType: 'schedule_cancelled' } }))).toBe(1)
    const immutableCopy = await app.inject({ method: 'PUT', url: `/api/contents/${mixed.id}/variants/instagram`, headers: headers(auth, mixedRevised.version), payload: { copy: 'Replacement copy is not allowed.', cta: 'No change.', hashtags: '#immutable', visualRecommendation: 'No change.' } })
    expect(immutableCopy.statusCode).toBe(409)
    const immutableMaster = await app.inject({ method: 'PATCH', url: `/api/contents/${mixed.id}`, headers: headers(auth, mixedRevised.version), payload: { master: { ...master, title: 'Published master cannot change.' } } })
    expect(immutableMaster.statusCode).toBe(409)
    const immutableCheck = await app.inject({ method: 'POST', url: `/api/contents/${mixed.id}/brand-check`, headers: headers(auth, mixedRevised.version, 'r101-published-check'), payload: { platform: 'instagram' } })
    expect(immutableCheck.statusCode).toBe(409)
    const fullyPublished = await createApprovedContent(auth, 'r102', { platforms: ['instagram'] })
    const fullyScheduled = await app.inject({ method: 'POST', url: `/api/contents/${fullyPublished.id}/schedules`, headers: headers(auth, fullyPublished.content.version, 'r102-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(2), timezone: 'Asia/Jakarta' }] } })
    const fullyContent = fullyScheduled.json().data as AnyRecord
    const fullyPublication = await app.inject({ method: 'POST', url: `/api/schedules/${variant(fullyContent, 'instagram').schedule.id}/publish`, headers: headers(auth, fullyContent.version, 'r102-publish'), payload: { publishedAt: fixedNow.toISOString(), postUrl: null } })
    expect((await app.inject({ method: 'POST', url: `/api/contents/${fullyPublished.id}/request-revision`, headers: headers(auth, fullyPublication.json().data.content.version, 'r102-request'), payload: { reason: 'Must remain immutable.' } })).statusCode).toBe(409)
  })

  it('C100-C106/C113: Calendar is bounded, read-time projected from one asOf, and excludes cancelled/archived rows without writes', async () => {
    const auth = await session(email)
    const fixture = await createApprovedContent(auth, 'c100', { platforms: ['instagram', 'linkedin'] })
    const calendarBase = new Date(fixedNow.getTime() + 10 * 24 * 60 * 60 * 1_000)
    const calendarAt = (hours: number) => new Date(calendarBase.getTime() + hours * 60 * 60 * 1_000).toISOString()
    const scheduled = await app.inject({ method: 'POST', url: `/api/contents/${fixture.id}/schedules`, headers: headers(auth, fixture.content.version, 'c100-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: calendarAt(1), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: calendarAt(2), timezone: 'Asia/Jakarta' }] } })
    const scheduledContent = scheduled.json().data as AnyRecord
    const start = new Date(calendarBase.getTime() - 24 * 60 * 60 * 1_000).toISOString()
    const end = new Date(calendarBase.getTime() + 5 * 24 * 60 * 60 * 1_000).toISOString()
    const before = { content: await prisma.content.count({ where: { companyId } }), schedules: await prisma.contentSchedule.count({ where: { variant: { content: { companyId } } } }), publications: await prisma.publicationRecord.count({ where: { variant: { content: { companyId } } } }) }
    const calendar = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: { cookie: auth.cookie } })
    expect(calendar.statusCode).toBe(200)
    expect(calendar.json().data).toMatchObject({ start, end, asOf: fixedNow.toISOString() })
    expect(calendar.json().data.entries).toHaveLength(2)
    expect(calendar.json().data.entries.every((entry: AnyRecord) => entry.status === 'scheduled')).toBe(true)
    setClock(new Date(calendarBase.getTime() + 3 * 60 * 60 * 1_000))
    const ready = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: { cookie: auth.cookie } })
    expect(ready.statusCode).toBe(200)
    const readyData = ready.json().data
    expect(readyData.asOf).toBe(new Date(calendarBase.getTime() + 3 * 60 * 60 * 1_000).toISOString())
    expect(readyData.entries.every((entry: AnyRecord) => entry.status === 'ready_to_publish')).toBe(true)
    expect(await prisma.publicationRecord.count({ where: { variant: { contentId: fixture.id } } })).toBe(0)
    const published = await app.inject({ method: 'POST', url: `/api/schedules/${variant(scheduledContent, 'instagram').schedule.id}/publish`, headers: headers(auth, scheduledContent.version, 'c106-publish'), payload: { publishedAt: new Date(clockMs).toISOString(), postUrl: null } })
    expect(published.statusCode).toBe(200)
    const afterPublish = published.json().data.content as AnyRecord
    const publishedCalendar = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&status=published`, headers: { cookie: auth.cookie } })
    expect(publishedCalendar.json().data.entries).toHaveLength(1)
    expect(publishedCalendar.json().data.entries[0].status).toBe('published')
    const currentLinkedIn = variant(afterPublish, 'linkedin').schedule
    const cancelled = await app.inject({ method: 'DELETE', url: `/api/schedules/${currentLinkedIn.id}`, headers: headers(auth, afterPublish.version) })
    expect(cancelled.statusCode).toBe(200)
    const actionable = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: { cookie: auth.cookie } })
    expect(actionable.json().data.entries).toHaveLength(1)
    expect(actionable.json().data.entries[0].status).toBe('published')
    const archived = await createApprovedContent(auth, 'c106-archive', { platforms: ['instagram'] })
    const archivedSchedule = await app.inject({ method: 'POST', url: `/api/contents/${archived.id}/schedules`, headers: headers(auth, archived.content.version, 'c106-archive-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: calendarAt(4), timezone: 'Asia/Jakarta' }] } })
    const archive = await app.inject({ method: 'POST', url: `/api/contents/${archived.id}/archive`, headers: headers(auth, archivedSchedule.json().data.version), payload: {} })
    expect(archive.statusCode).toBe(200)
    const noArchived = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: { cookie: auth.cookie } })
    expect(noArchived.json().data.entries.some((entry: AnyRecord) => entry.contentId === archived.id)).toBe(false)
    expect(await prisma.content.count({ where: { companyId } })).toBe(before.content + 1)
    expect(await prisma.contentSchedule.count({ where: { variant: { content: { companyId } } } })).toBe(before.schedules + 1)
    expect(await prisma.publicationRecord.count({ where: { variant: { content: { companyId } } } })).toBe(before.publications + 1)
    const tooLong = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(new Date(calendarBase.getTime() + 94 * 24 * 60 * 60 * 1_000).toISOString())}`, headers: { cookie: auth.cookie } })
    expect(tooLong.statusCode).toBe(422)
    const reversed = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(end)}&end=${encodeURIComponent(start)}`, headers: { cookie: auth.cookie } })
    expect(reversed.statusCode).toBe(422)
  })

  it('C107-C112: Calendar filters and live names use scheduledAt membership and preserve security boundaries', async () => {
    const auth = await session(email)
    const product = await createProduct(auth)
    const companyFixture = await createApprovedContent(auth, 'c107-company', { platforms: ['instagram', 'linkedin'], topic: 'Company calendar title' })
    const productFixture = await createApprovedContent(auth, 'c109-product', { platforms: ['instagram'], productId: product.id, topic: 'Product calendar topic' })
    const calendarBase = new Date(fixedNow.getTime() + 20 * 24 * 60 * 60 * 1_000)
    const calendarAt = (hours: number) => new Date(calendarBase.getTime() + hours * 60 * 60 * 1_000).toISOString()
    const companyScheduled = await app.inject({ method: 'POST', url: `/api/contents/${companyFixture.id}/schedules`, headers: headers(auth, companyFixture.content.version, 'c107-company-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: calendarAt(1), timezone: 'Asia/Jakarta' }, { platform: 'linkedin', scheduledAt: calendarAt(2), timezone: 'Asia/Jakarta' }] } })
    const productScheduled = await app.inject({ method: 'POST', url: `/api/contents/${productFixture.id}/schedules`, headers: headers(auth, productFixture.content.version, 'c109-product-schedule'), payload: { schedules: [{ platform: 'instagram', scheduledAt: calendarAt(4), timezone: 'Asia/Jakarta' }] } })
    setClock(new Date(calendarBase.getTime() + 3 * 60 * 60 * 1_000))
    const start = new Date(calendarBase.getTime() - 60 * 60 * 1_000).toISOString()
    const end = new Date(calendarBase.getTime() + 8 * 60 * 60 * 1_000).toISOString()
    const all = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: { cookie: auth.cookie } })
    expect(all.statusCode).toBe(200)
    expect(all.json().data.entries.some((entry: AnyRecord) => entry.company.name === 'Phase 10 Company')).toBe(true)
    expect(all.json().data.entries.some((entry: AnyRecord) => entry.product?.name === 'Phase 10 Product')).toBe(true)
    const platform = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&platform=linkedin`, headers: { cookie: auth.cookie } })
    expect(platform.json().data.entries.every((entry: AnyRecord) => entry.platform === 'linkedin')).toBe(true)
    const productFilter = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&productId=${product.id}`, headers: { cookie: auth.cookie } })
    expect(productFilter.json().data.entries).toHaveLength(1)
    expect(productFilter.json().data.entries[0].contentId).toBe(productFixture.id)
    const contextProduct = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&contextType=product`, headers: { cookie: auth.cookie } })
    expect(contextProduct.json().data.entries).toHaveLength(1)
    const contextCompany = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&contextType=company`, headers: { cookie: auth.cookie } })
    expect(contextCompany.json().data.entries.every((entry: AnyRecord) => entry.contentId === companyFixture.id)).toBe(true)
    const scheduled = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&status=scheduled`, headers: { cookie: auth.cookie } })
    expect(scheduled.json().data.entries).toHaveLength(1)
    expect(scheduled.json().data.entries[0].contentId).toBe(productFixture.id)
    const noPublicationPeriod = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(new Date(calendarBase.getTime() + 2.5 * 60 * 60 * 1_000).toISOString())}&end=${encodeURIComponent(new Date(calendarBase.getTime() + 3.5 * 60 * 60 * 1_000).toISOString())}`, headers: { cookie: auth.cookie } })
    expect(noPublicationPeriod.json().data.entries).toHaveLength(0)
    const productSchedule = variant(productScheduled.json().data, 'instagram').schedule
    const productPublication = await app.inject({ method: 'POST', url: `/api/schedules/${productSchedule.id}/publish`, headers: headers(auth, productScheduled.json().data.version, 'c111-product-publish'), payload: { publishedAt: new Date(clockMs).toISOString(), postUrl: null } })
    expect(productPublication.statusCode).toBe(200)
    await prisma.company.update({ where: { id: companyId }, data: { name: 'Phase 10 Live Company' } })
    await prisma.product.update({ where: { id: product.id }, data: { name: 'Phase 10 Live Product' } })
    const schedulePeriod = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(new Date(calendarBase.getTime() + 3.5 * 60 * 60 * 1_000).toISOString())}&end=${encodeURIComponent(new Date(calendarBase.getTime() + 5 * 60 * 60 * 1_000).toISOString())}`, headers: { cookie: auth.cookie } })
    expect(schedulePeriod.json().data.entries).toHaveLength(1)
    expect(schedulePeriod.json().data.entries[0]).toMatchObject({ contentId: productFixture.id, status: 'published', company: { name: 'Phase 10 Live Company' }, product: { name: 'Phase 10 Live Product' } })
    expect(companyScheduled.statusCode).toBe(200)
    expect(productScheduled.statusCode).toBe(200)

    const unauthenticated = await app.inject({ method: 'GET', url: `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` })
    expect(unauthenticated.statusCode).toBe(401)
    const badOrigin = await app.inject({ method: 'POST', url: `/api/contents/${companyFixture.id}/schedules`, headers: { cookie: auth.cookie }, payload: { schedules: [{ platform: 'instagram', scheduledAt: at(6), timezone: 'Asia/Jakarta' }] } })
    expect(badOrigin.statusCode).toBe(403)
    const noSession = await app.inject({ method: 'POST', url: `/api/contents/${companyFixture.id}/schedules`, headers: { origin }, payload: { schedules: [{ platform: 'instagram', scheduledAt: at(6), timezone: 'Asia/Jakarta' }] } })
    expect(noSession.statusCode).toBe(401)
    const noCsrf = await app.inject({ method: 'POST', url: `/api/contents/${companyFixture.id}/schedules`, headers: { origin, cookie: auth.cookie, 'if-match': `"${companyFixture.content.version}"`, 'idempotency-key': 'c112-no-csrf' }, payload: { schedules: [{ platform: 'instagram', scheduledAt: at(6), timezone: 'Asia/Jakarta' }] } })
    expect(noCsrf.statusCode).toBe(403)
    const noIfMatch = await app.inject({ method: 'POST', url: `/api/contents/${companyFixture.id}/schedules`, headers: headers(auth, undefined, 'c112-no-etag'), payload: { schedules: [{ platform: 'instagram', scheduledAt: at(6), timezone: 'Asia/Jakarta' }] } })
    expect(noIfMatch.statusCode).toBe(428)
  })
})
