import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import type { AiProvider, AiProviderRequest, AiProviderResult } from '../src/modules/ai/provider.js'
import type { Clock } from '../src/shared/time/clock.js'
import type { InstagramInsightsProvider } from '../src/modules/performance/instagram/provider.js'

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
const email = `phase11-${suffix}@example.test`
const otherEmail = `phase11-other-${suffix}@example.test`
const fixedNow = new Date('2026-09-14T05:00:00.000Z')
const clock: Clock = { now: () => new Date(fixedNow.getTime()) }
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let otherCompanyId = ''
let actorId = ''
let instagramAccountId = ''
let linkedinAccountId = ''
let whatsappAccountId = ''

class FakeInstagramProvider implements InstagramInsightsProvider {
  async getProfile() { return { userId: '17841447520550815', username: 'shifdlabs', name: 'Shifd Labs', accountType: 'BUSINESS', followersCount: 6, mediaCount: 0 } }
  async listMedia() { return [] }
  async getMediaInsights(_mediaId: string) { return { views: null, reach: null, likes: null, comments: null, saves: null, shares: null, totalInteractions: null } }
  async getAccountReach() { return { metric: 'reach' as const, period: 'week' as const, values: [] } }
}

class FakeAiProvider implements AiProvider {
  isConfigured() { return true }
  async generate(_request: AiProviderRequest): Promise<AiProviderResult> {
    return { text: '{}', inputTokens: 1, outputTokens: 1, providerRequestId: 'phase11-test' }
  }
}

const fake = new FakeAiProvider()
const fakeInstagram = new FakeInstagramProvider()
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
  return { cookie: cookieFrom(response), csrf: response.json().data.csrfToken as string }
}

function headers(auth: Auth, version?: number) {
  return {
    origin,
    cookie: auth.cookie,
    'x-csrf-token': auth.csrf,
    ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
  }
}

function weekStart(index: number) {
  const start = new Date('2026-06-29T00:00:00.000Z')
  start.setUTCDate(start.getUTCDate() + index * 7)
  return start
}

function weekEnd(start: Date) {
  const end = new Date(start.getTime())
  end.setUTCDate(end.getUTCDate() + 6)
  return end
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10)
}

function at(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`)
}

async function createMetricRow(accountId: string, platform: 'instagram' | 'linkedin', index: number, overrides: Partial<{ followers: number; reach: number | null; impressions: number; likes: number; comments: number; saves: number; reported: number; source: string }> = {}) {
  const start = weekStart(index)
  return prisma.weeklyMetric.create({
    data: {
      socialAccountId: accountId,
      weekStart: start,
      weekEnd: weekEnd(start),
      followers: BigInt(overrides.followers ?? (platform === 'instagram' ? 100 + index * 5 : 200 + index * 7)),
      reach: overrides.reach === undefined ? BigInt(platform === 'instagram' ? 100 + index : 200 + index) : overrides.reach === null ? null : BigInt(overrides.reach),
      impressions: BigInt(overrides.impressions ?? 100 + index * 10),
      likes: BigInt(overrides.likes ?? 10 + index),
      comments: BigInt(overrides.comments ?? 2),
      saves: BigInt(overrides.saves ?? 3),
      reportedPublishedPosts: overrides.reported ?? 0,
      source: overrides.source ?? (platform === 'instagram' ? 'mock' : 'linkedin_manual'),
      recordedBy: platform === 'linkedin' ? actorId : null,
    },
  })
}

async function createReportContent(key: string, platforms: Array<'instagram' | 'linkedin'> = ['instagram', 'linkedin']) {
  const content = await prisma.content.create({
    data: {
      companyId,
      contextType: 'company',
      editorialStage: 'ready_for_review',
      editorialRevision: 1,
      masterRevision: 1,
      designStatus: 'not_started',
      createdBy: actorId,
      masterContent: { title: `Phase 11 report ${key}`, coreMessage: 'Observed evidence.', hook: 'A grounded hook.', body: 'A grounded body.', cta: 'Learn more.' } as Prisma.InputJsonValue,
      brief: { create: { pillarCode: 'educational', objective: 'education', targetAudience: 'Operators', topic: `Phase 11 topic ${key}` } },
      variants: { create: platforms.map((platform) => ({ platform, enabled: true, copy: 'Observed copy.', cta: 'Learn more.', hashtags: '#evidence', visualRecommendation: 'A clear visual.', adaptedFromMasterRevision: 1 })) },
    },
    include: { variants: true },
  })
  const approval = await prisma.approvalAction.create({ data: { contentId: content.id, editorialRevision: 1, action: 'approve', actorId, checklist: {}, reviewedVariants: [] } })
  await prisma.content.update({ where: { id: content.id }, data: { currentApprovalId: approval.id } })
  return { ...content, variants: content.variants, approval }
}

async function createSchedule(contentId: string, variantId: string, scheduledAt: Date, approvalActionId: string) {
  return prisma.contentSchedule.create({ data: { variantId, scheduledAt, timezone: 'Asia/Jakarta', approvalActionId, createdBy: actorId } })
}

async function createPublication(variantId: string, scheduleId: string, scheduledAtSnapshot: Date, publishedAt: Date) {
  return prisma.publicationRecord.create({ data: { variantId, scheduleId, scheduledAtSnapshot, publishedAt, markedBy: actorId, recordedAt: publishedAt, updatedAt: publishedAt } })
}

async function createEvidenceAsset(purpose: 'creative' | 'metric_evidence', owningCompanyId = companyId) {
  return prisma.creativeAsset.create({
    data: {
      companyId: owningCompanyId,
      uploadedBy: actorId,
      purpose,
      fileName: `${purpose}.png`,
      storageKey: `phase11/${randomUUID()}.png`,
      mimeType: 'image/png',
      sizeBytes: BigInt(12),
      width: 1,
      height: 1,
      checksumSha256: 'a'.repeat(64),
      state: 'ready',
    },
  })
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.publicationMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.publicationRecord.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.contentSchedule.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.content.updateMany({ where: { companyId: id }, data: { currentApprovalId: null } })
  await prisma.approvalAction.deleteMany({ where: { content: { companyId: id } } })
  await prisma.platformVariant.updateMany({ where: { content: { companyId: id } }, data: { currentAssessmentId: null, reuseCreativeFromVariantId: null } })
  await prisma.brandAssessment.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
  await prisma.contentEvent.deleteMany({ where: { content: { companyId: id } } })
  await prisma.variantAsset.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.platformVariant.deleteMany({ where: { content: { companyId: id } } })
  await prisma.contentBrief.deleteMany({ where: { content: { companyId: id } } })
  await prisma.content.deleteMany({ where: { companyId: id } })
  await prisma.contentIdea.deleteMany({ where: { companyId: id } })
  await prisma.creativeAsset.deleteMany({ where: { companyId: id } })
  await prisma.productProfile.deleteMany({ where: { product: { companyId: id } } })
  await prisma.product.deleteMany({ where: { companyId: id } })
  await prisma.aiSettings.deleteMany({ where: { companyId: id } })
  await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
  await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
  await prisma.brandProfile.deleteMany({ where: { companyId: id } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
  await prisma.user.deleteMany({ where: { companyId: id } })
  await prisma.company.delete({ where: { id } })
}

runIntegration('Phase 11 Performance, Metrics, and Reporting', () => {
  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake, instagramProvider: fakeInstagram, clock })
    await seedM2Prompt(app.prisma)
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 11 Company', companyDescription: 'A reporting company.', userName: 'Phase 11 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 11 Other', companyDescription: 'Another reporting company.', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 11 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    actorId = primary.user.id
    const accounts = await prisma.socialAccount.findMany({ where: { companyId } })
    instagramAccountId = accounts.find((account) => account.platform === 'instagram')!.id
    linkedinAccountId = accounts.find((account) => account.platform === 'linkedin')!.id
    whatsappAccountId = accounts.find((account) => account.platform === 'whatsapp')!.id
    await prisma.company.update({ where: { id: companyId }, data: { name: 'Phase 11 Company', description: 'A configured reporting company.' } })
    await prisma.brandProfile.update({ where: { companyId }, data: { brandVoice: 'Clear and grounded.', toneDescription: 'Direct, useful, and calm.' } })
    for (let index = 0; index < 14; index += 1) {
      if (index !== 11) await createMetricRow(instagramAccountId, 'instagram', index, index === 10 ? { reach: null, impressions: 0, likes: 0, comments: 0, saves: 0 } : undefined)
      await createMetricRow(linkedinAccountId, 'linkedin', index, index === 8 ? { reported: 4, reach: 300 } : undefined)
    }
    const mixed = await createReportContent('reconcile')
    const instagram = mixed.variants.find((row) => row.platform === 'instagram')!
    const linkedin = mixed.variants.find((row) => row.platform === 'linkedin')!
    const approval = mixed.approval
    const igSchedule = await createSchedule(mixed.id, instagram.id, at('2026-09-09', 10), approval.id)
    const liSchedule = await createSchedule(mixed.id, linkedin.id, at('2026-09-10', 10), approval.id)
    await createPublication(instagram.id, igSchedule.id, igSchedule.scheduledAt, at('2026-09-10', 10))
    const second = await createReportContent('second', ['instagram'])
    const secondSchedule = await createSchedule(second.id, second.variants[0]!.id, at('2026-09-11', 10), second.approval.id)
    await createPublication(second.variants[0]!.id, secondSchedule.id, secondSchedule.scheduledAt, at('2026-09-12', 10))
    const outside = await createReportContent('outside', ['linkedin'])
    const outsideSchedule = await createSchedule(outside.id, outside.variants[0]!.id, at('2026-06-20', 10), outside.approval.id)
    await createPublication(outside.variants[0]!.id, outsideSchedule.id, outsideSchedule.scheduledAt, at('2026-06-20', 11))
    // Keep one active schedule for the schedule-cohort and ready-to-publish
    // projections; no elapsed schedule creates a publication.
    const pending = await createReportContent('pending', ['linkedin'])
    await createSchedule(pending.id, pending.variants[0]!.id, at('2026-09-13', 10), pending.approval.id)
    void liSchedule
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('M1100-M1103/I1102: bootstraps three source accounts, keeps credentials private, and keeps reads pure', async () => {
    const auth = await session(email)
    const accounts = await app.inject({ method: 'GET', url: '/api/integrations', headers: { cookie: auth.cookie } })
    expect(accounts.statusCode).toBe(200)
    expect(Object.keys(accounts.json().data).sort()).toEqual(['instagram', 'linkedin', 'whatsapp'])
    expect(accounts.json().data.linkedin).toMatchObject({ mode: 'manual', status: 'manual', currentSource: 'linkedin_manual' })
    expect(accounts.json().data.whatsapp).toMatchObject({ mode: 'manual', status: 'manual' })
    expect(accounts.json().data.instagram).toMatchObject({ mode: 'demo', status: 'disconnected' })
    await prisma.socialAccount.update({ where: { id: instagramAccountId }, data: { credentialReference: 'opaque-secret-reference' } })
    const publicState = await app.inject({ method: 'GET', url: '/api/integrations', headers: { cookie: auth.cookie } })
    expect(JSON.stringify(publicState.json())).not.toContain('opaque-secret-reference')
    const before = await prisma.$transaction(async (tx) => ({ metrics: await tx.weeklyMetric.count({ where: { socialAccount: { companyId } } }), accounts: await tx.socialAccount.count({ where: { companyId } }) }))
    const performance = await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=combined', headers: { cookie: auth.cookie } })
    expect(performance.statusCode).toBe(200)
    const overview = await app.inject({ method: 'GET', url: '/api/overview', headers: { cookie: auth.cookie } })
    expect(overview.statusCode).toBe(200)
    const after = await prisma.$transaction(async (tx) => ({ metrics: await tx.weeklyMetric.count({ where: { socialAccount: { companyId } } }), accounts: await tx.socialAccount.count({ where: { companyId } }) }))
    expect(after).toEqual(before)
  })

  it('M1104-M1119: validates LinkedIn manual observations, D-04 intervals, evidence, correction ETags, and no delete route', async () => {
    const auth = await session(email)
    const validStart = new Date('2026-05-25T00:00:00.000Z')
    const payload = { weekStart: dateText(validStart), weekEnd: dateText(weekEnd(validStart)), followers: 0, reach: null, impressions: 0, likes: 0, comments: 0, saves: 0, publishedPosts: 0, evidenceAssetId: null, notes: 'Zero observation is valid.' }
    const created = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload })
    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({ platform: 'linkedin', source: 'linkedin_manual', followers: 0, reach: null, impressions: 0, engagements: 0, engagementRate: null, publishedPosts: 0, version: 1 })
    const negative = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, weekStart: '2026-06-01', weekEnd: '2026-06-07', impressions: -1 } })
    expect(negative.statusCode).toBe(422)
    const nonMonday = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, weekStart: '2026-09-22', weekEnd: '2026-09-28' } })
    expect(nonMonday.statusCode).toBe(422)
    const wrongEnd = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, weekStart: '2026-09-28', weekEnd: '2026-10-05' } })
    expect(wrongEnd.statusCode).toBe(422)
    const overlap = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, notes: 'duplicate' } })
    expect(overlap.statusCode).toBe(409)
    const creative = await createEvidenceAsset('creative')
    const wrongEvidence = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, weekStart: '2026-06-01', weekEnd: '2026-06-07', evidenceAssetId: creative.id } })
    expect(wrongEvidence.statusCode).toBe(422)
    const evidence = await createEvidenceAsset('metric_evidence')
    const withEvidence = await app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...payload, weekStart: '2026-06-01', weekEnd: '2026-06-07', evidenceAssetId: evidence.id } })
    expect(withEvidence.statusCode).toBe(201)
    const metric = created.json().data as AnyRecord
    const update = await app.inject({ method: 'PUT', url: `/api/metrics/linkedin/${metric.id}`, headers: headers(auth, metric.version), payload: { ...payload, followers: 12, notes: 'Corrected observation.' } })
    expect(update.statusCode).toBe(200)
    expect(update.json().data).toMatchObject({ id: metric.id, followers: 12, version: 2, source: 'linkedin_manual' })
    const stale = await app.inject({ method: 'PUT', url: `/api/metrics/linkedin/${metric.id}`, headers: headers(auth, 1), payload })
    expect(stale.statusCode).toBe(412)
    expect((await app.inject({ method: 'DELETE', url: `/api/metrics/linkedin/${metric.id}`, headers: headers(auth, 2) })).statusCode).toBe(404)
    const concurrentStart = '2026-06-08'
    const concurrentPayload = { ...payload, weekStart: concurrentStart, weekEnd: '2026-06-14', followers: 10 }
    const concurrent = await Promise.all([
      app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: concurrentPayload }),
      app.inject({ method: 'POST', url: '/api/metrics/linkedin', headers: headers(auth), payload: { ...concurrentPayload, followers: 11 } }),
    ])
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([201, 409])
    const queried = await app.inject({ method: 'GET', url: '/api/metrics/linkedin?start=2026-05-25&end=2026-06-14', headers: { cookie: auth.cookie } })
    expect(queried.statusCode).toBe(200)
    expect(queried.json().data.some((row: AnyRecord) => row.id === metric.id)).toBe(true)
  })

  it('Q1100-Q1105/I1100-I1101: records only supplementary WhatsApp counts and keeps them independent from publications', async () => {
    const auth = await session(email)
    const payload = { weekStart: '2026-10-12', weekEnd: '2026-10-18', count: 0 }
    const created = await app.inject({ method: 'POST', url: '/api/metrics/inquiries', headers: headers(auth), payload })
    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({ channel: 'whatsapp', source: 'manual', count: 0, weekStart: payload.weekStart })
    const negative = await app.inject({ method: 'POST', url: '/api/metrics/inquiries', headers: headers(auth), payload: { weekStart: '2026-10-19', weekEnd: '2026-10-25', count: -1 } })
    expect(negative.statusCode).toBe(422)
    expect((await app.inject({ method: 'POST', url: '/api/metrics/inquiries', headers: headers(auth), payload: { ...payload, count: 2 } })).statusCode).toBe(409)
    const metric = created.json().data as AnyRecord
    const corrected = await app.inject({ method: 'PUT', url: `/api/metrics/inquiries/${metric.id}`, headers: headers(auth, metric.version), payload: { ...payload, count: 4 } })
    expect(corrected.statusCode).toBe(200)
    expect(corrected.json().data).toMatchObject({ id: metric.id, count: 4, version: 2 })
    expect((await app.inject({ method: 'POST', url: '/api/metrics/inquiries', headers: headers(auth), payload: { weekStart: '2026-10-19', weekEnd: '2026-10-25', count: 2 } })).statusCode).toBe(201)
    const countsBefore = { publications: await prisma.publicationRecord.count({ where: { variant: { content: { companyId } } } }), metrics: await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } }) }
    const linkedIn = await app.inject({ method: 'GET', url: '/api/metrics/inquiries', headers: { cookie: auth.cookie } })
    expect(linkedIn.statusCode).toBe(200)
    const countsAfter = { publications: await prisma.publicationRecord.count({ where: { variant: { content: { companyId } } } }), metrics: await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } }) }
    expect(countsAfter).toEqual(countsBefore)
    expect(await prisma.inboundInquiryMetric.count({ where: { socialAccountId: whatsappAccountId } })).toBeGreaterThanOrEqual(2)
    expect(await prisma.$queryRaw<Array<{ relname: string }>>`SELECT c.relname FROM pg_class c WHERE c.relname IN ('post_metrics', 'leads', 'customers')`).toEqual([])
  })

  it('R1100-R1119/I1102: calculates account observations, weighted engagement, safe follower growth, reconciliation, consistency, and schedule cohorts', async () => {
    const auth = await session(email)
    const response = await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=combined', headers: { cookie: auth.cookie } })
    expect(response.statusCode).toBe(200)
    const report = response.json().data as AnyRecord
    expect(report.period).toMatchObject({ basis: 'latest_recorded_intervals', requestedWeeks: 4, timezone: 'Asia/Jakarta', asOf: fixedNow.toISOString() })
    expect(report.period.recordedWeekStarts).toHaveLength(4)
    expect(report.weekly).toHaveLength(4)
    const instagramRows = (await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=instagram', headers: { cookie: auth.cookie } })).json().data.weekly as AnyRecord[]
    expect(instagramRows.some((row) => row.coverage === 'missing')).toBe(true)
    expect(report.summary.engagementRate).toBeCloseTo((report.summary.engagements / report.summary.impressions) * 100, 10)
    expect(report.summary.published.basis).toBe('max_per_account_interval')
    expect(report.summary.published.explicitPosts).toBeGreaterThanOrEqual(2)
    expect(report.summary.published.effectivePosts).toBeGreaterThanOrEqual(report.summary.published.explicitPosts)
    expect(report.consistency).toHaveLength(2)
    expect(report.consistency.every((row: AnyRecord) => row.expected === 8 && row.targetPerWeek === 2 && row.visualPercent <= 100)).toBe(true)
    expect(report.execution.periodBasis).toBe('schedule_cohort')
    expect(report.contentOutput).toMatchObject({ basis: 'campaigns', scope: 'all_saved' })
    expect(report.inquiries).toMatchObject({ channel: 'whatsapp', kind: 'supplementary' })
    expect(report.inquiries.weeks.every((row: AnyRecord) => row.channel === 'whatsapp')).toBe(true)
    const instagram = await app.inject({ method: 'GET', url: '/api/performance?weeks=8&platform=instagram', headers: { cookie: auth.cookie } })
    const linkedin = await app.inject({ method: 'GET', url: '/api/performance?weeks=12&platform=linkedin', headers: { cookie: auth.cookie } })
    expect(instagram.statusCode).toBe(200)
    expect(linkedin.statusCode).toBe(200)
    expect(instagram.json().data.followers[0]).toMatchObject({ platform: 'instagram', start: expect.any(Number), end: expect.any(Number) })
    expect(linkedin.json().data.followers[0].changePercent).toBeTypeOf('number')
    const invalidWeeks = await app.inject({ method: 'GET', url: '/api/performance?weeks=5', headers: { cookie: auth.cookie } })
    const invalidPlatform = await app.inject({ method: 'GET', url: '/api/performance?platform=whatsapp', headers: { cookie: auth.cookie } })
    expect(invalidWeeks.statusCode).toBe(422)
    expect(invalidPlatform.statusCode).toBe(422)
    const unchanged = await prisma.$transaction(async (tx) => ({ publication: await tx.publicationRecord.count({ where: { variant: { content: { companyId } } } }), metric: await tx.weeklyMetric.count({ where: { socialAccount: { companyId } } }) }))
    expect(unchanged.publication).toBeGreaterThan(0)
    expect(unchanged.metric).toBeGreaterThan(0)
  })

  it('R1112-R1119/P1100-P1107: reconciles max-not-sum, exposes explicit changes, and joins only account-week metrics', async () => {
    const auth = await session(email)
    const before = await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=instagram', headers: { cookie: auth.cookie } })
    const beforeCounts = before.json().data.summary.published as AnyRecord
    const publications = await app.inject({ method: 'GET', url: '/api/publications?platform=instagram', headers: { cookie: auth.cookie } })
    expect(publications.statusCode).toBe(200)
    expect(publications.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ platformMetricsForPublicationWeek: expect.objectContaining({ scope: 'platform_account_week' }) })]))
    const joined = publications.json().data.find((row: AnyRecord) => row.platformMetricsForPublicationWeek)
    expect(joined.platformMetricsForPublicationWeek).not.toHaveProperty('postReach')
    expect(joined.platformMetricsForPublicationWeek).not.toHaveProperty('postImpressions')
    expect(joined.platformMetricsForPublicationWeek).not.toHaveProperty('postEngagement')
    const explicitBefore = beforeCounts.explicitPosts
    const extra = await createReportContent('explicit-visible', ['instagram'])
    const schedule = await createSchedule(extra.id, extra.variants[0]!.id, at('2026-09-13', 12), extra.approval.id)
    await createPublication(extra.variants[0]!.id, schedule.id, schedule.scheduledAt, at('2026-09-13', 13))
    const after = await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=instagram', headers: { cookie: auth.cookie } })
    const afterCounts = after.json().data.summary.published as AnyRecord
    expect(afterCounts.explicitPosts).toBe(explicitBefore + 1)
    expect(afterCounts.effectivePosts).toBeGreaterThanOrEqual(afterCounts.explicitPosts)
    expect(beforeCounts.reportedPosts).toBeGreaterThanOrEqual(0)
    expect(afterCounts.reportedPosts).toBe(beforeCounts.reportedPosts)
    const bounded = await app.inject({ method: 'GET', url: `/api/publications?start=${encodeURIComponent('2026-09-12T00:00:00+07:00')}&end=${encodeURIComponent('2026-09-13T00:00:00+07:00')}`, headers: { cookie: auth.cookie } })
    expect(bounded.statusCode).toBe(200)
    expect(bounded.json().data.every((row: AnyRecord) => row.publication.publishedAt >= '2026-09-11T17:00:00.000Z' && row.publication.publishedAt < '2026-09-12T17:00:00.000Z')).toBe(true)
    const order = publications.json().data.map((row: AnyRecord) => row.publication.publishedAt)
    expect(order).toEqual([...order].sort().reverse())
  })

  it('O1100-O1110/I1102: preserves Overview mixed periods, derived readiness, live names, and no-write GET behavior', async () => {
    const auth = await session(email)
    const before = { accounts: await prisma.socialAccount.count({ where: { companyId } }), metrics: await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } }), inquiries: await prisma.inboundInquiryMetric.count({ where: { socialAccount: { companyId } } }) }
    const response = await app.inject({ method: 'GET', url: '/api/overview', headers: { cookie: auth.cookie } })
    expect(response.statusCode).toBe(200)
    const overview = response.json().data as AnyRecord
    expect(overview).toMatchObject({ asOf: fixedNow.toISOString(), timezone: 'Asia/Jakarta', publishedPeriod: { basis: 'all_history' } })
    expect(overview.thisWeek.start).toBe('2026-09-13T17:00:00.000Z')
    expect(overview.thisWeek.end).toBe('2026-09-20T17:00:00.000Z')
    expect(overview.performanceSnapshot.period).toMatchObject({ requestedWeeks: 8, basis: 'latest_recorded_intervals' })
    expect(overview.upcoming.length).toBeLessThanOrEqual(5)
    expect(overview.recentlyPublished.length).toBeLessThanOrEqual(5)
    expect(overview.ideas.readyCount).toBeTypeOf('number')
    expect(overview.context).toMatchObject({ companyConfigured: true, brandConfigured: true })
    expect(overview.readyToPublish).toBeGreaterThan(0)
    const after = { accounts: await prisma.socialAccount.count({ where: { companyId } }), metrics: await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } }), inquiries: await prisma.inboundInquiryMetric.count({ where: { socialAccount: { companyId } } }) }
    expect(after).toEqual(before)
  })

  it('I1000-I1003: validates the read-only Instagram boundary and preserves selection safety', async () => {
    const auth = await session(email)
    const initial = await app.inject({ method: 'GET', url: '/api/integrations', headers: { cookie: auth.cookie } })
    const account = initial.json().data.instagram as AnyRecord
    const connected = await app.inject({ method: 'POST', url: '/api/integrations/instagram/connect', headers: headers(auth, account.version), payload: {} })
    expect(connected.statusCode).toBe(200)
    expect(connected.json().data).toMatchObject({ mode: 'api', status: 'connected', currentSource: 'instagram_api' })
    const beforeSync = await prisma.socialAccount.findUniqueOrThrow({ where: { id: instagramAccountId } })
    const before = await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } })
    const sync = await app.inject({ method: 'POST', url: '/api/integrations/instagram/sync', headers: headers(auth, connected.json().data.version), payload: {} })
    expect(sync.statusCode).toBe(200)
    expect(sync.json().data).toMatchObject({ mode: 'api', metricsChanged: true, matchedPublications: 0 })
    expect(sync.json().data.needsSelection.length).toBeGreaterThanOrEqual(2)
    expect(await prisma.weeklyMetric.count({ where: { socialAccount: { companyId } } })).toBe(before + 1)
    expect(await prisma.socialAccount.findUniqueOrThrow({ where: { id: instagramAccountId } })).toMatchObject({ version: beforeSync.version + 1 })
    expect(await prisma.socialAccount.findUniqueOrThrow({ where: { id: instagramAccountId } })).not.toMatchObject({ lastSuccessfulSyncAt: beforeSync.lastSuccessfulSyncAt })
    const disconnected = await app.inject({ method: 'POST', url: '/api/integrations/instagram/disconnect', headers: headers(auth, sync.json().data.integration.version), payload: {} })
    expect(disconnected.statusCode).toBe(200)
    expect(disconnected.json().data.status).toBe('disconnected')
    await prisma.socialAccount.update({ where: { id: instagramAccountId }, data: { mode: 'demo', connectionStatus: 'disconnected' } })
  })
})
