import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import type { Clock } from '../src/shared/time/clock.js'
import { MetaInstagramInsightsProvider } from '../src/modules/performance/instagram/meta.js'
import { InstagramProviderError, type InstagramInsightsProvider, type InstagramMedia, type InstagramMediaInsights, type InstagramProfile } from '../src/modules/performance/instagram/provider.js'

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
const email = `instagram-${suffix}@example.test`
const fixedNow = new Date('2026-09-19T05:00:00.000Z')
const clock: Clock = { now: () => new Date(fixedNow.getTime()) }
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let actorId = ''
let contentId = ''
let publicationId = ''
let accountId = ''

class FakeInstagramProvider implements InstagramInsightsProvider {
  profile: InstagramProfile = { userId: '17841447520550815', username: 'shifdlabs', name: 'Shifd Labs', accountType: 'BUSINESS', followersCount: 6, mediaCount: 1 }
  media: InstagramMedia[] = [{ id: '18000000000000001', caption: 'Verified publication', mediaType: 'IMAGE', mediaProductType: 'FEED', timestamp: new Date('2026-09-18T00:00:00.000Z'), permalink: 'https://www.instagram.com/p/verified/', thumbnailUrl: null }]
  insights: InstagramMediaInsights = { views: 27, reach: 8, likes: 2, comments: 0, saves: 0, shares: 0, totalInteractions: 2 }
  profileCalls = 0
  mediaCalls = 0
  insightCalls = 0
  async getProfile() { this.profileCalls += 1; return this.profile }
  async listMedia() { this.mediaCalls += 1; return this.media }
  async getMediaInsights(_mediaId: string) { this.insightCalls += 1; return this.insights }
  async getAccountReach() { return { metric: 'reach' as const, period: 'week' as const, values: [] } }
}

const fake = new FakeInstagramProvider()
type Auth = { cookie: string; csrf: string }

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(): Promise<Auth> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
  if (response.statusCode !== 200) throw new Error(`Test login failed: ${response.statusCode}`)
  return { cookie: cookieFrom(response), csrf: response.json().data.csrfToken as string }
}

function headers(auth: Auth, version?: number) {
  return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

runIntegration('Instagram Insights integration', () => {
  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, instagramProvider: fake, clock })
    const operator = await bootstrapOperator(app.prisma, { companyName: `Instagram Test ${suffix}`, companyDescription: 'Instagram integration test company.', userName: 'Instagram Tester', userEmail: email, userPassword: 'correct-password' })
    if (!operator.created) throw new Error('Instagram test bootstrap unexpectedly reused an operator.')
    companyId = operator.company.id
    actorId = operator.user.id
    accountId = (await prisma.socialAccount.findUniqueOrThrow({ where: { companyId_platform: { companyId, platform: 'instagram' } } })).id
    const content = await prisma.content.create({
      data: {
        companyId,
        contextType: 'company',
        editorialStage: 'ready_for_review',
        editorialRevision: 1,
        masterRevision: 1,
        designStatus: 'not_started',
        createdBy: actorId,
        masterContent: { title: 'Instagram observation test', coreMessage: 'A test observation.', hook: 'A test hook.', body: 'A test body.', cta: 'Learn more.' } as Prisma.InputJsonValue,
        brief: { create: { pillarCode: 'educational', objective: 'education', targetAudience: 'Operators', topic: 'Instagram observation' } },
        variants: { create: { platform: 'instagram', enabled: true, copy: 'Observed copy.', cta: 'Learn more.', hashtags: '#test', visualRecommendation: 'A test visual.', adaptedFromMasterRevision: 1 } },
      },
      include: { variants: true },
    })
    contentId = content.id
    const approval = await prisma.approvalAction.create({ data: { contentId: content.id, editorialRevision: 1, action: 'approve', actorId, checklist: {}, reviewedVariants: [] } })
    await prisma.content.update({ where: { id: content.id }, data: { currentApprovalId: approval.id } })
    const schedule = await prisma.contentSchedule.create({ data: { variantId: content.variants[0]!.id, scheduledAt: new Date('2026-09-18T07:00:00.000Z'), timezone: 'Asia/Jakarta', approvalActionId: approval.id, createdBy: actorId } })
    const publication = await prisma.publicationRecord.create({ data: { variantId: content.variants[0]!.id, scheduleId: schedule.id, scheduledAtSnapshot: schedule.scheduledAt, publishedAt: new Date('2026-09-18T08:00:00.000Z'), postUrl: 'https://www.instagram.com/p/verified/', markedBy: actorId } })
    publicationId = publication.id
  })

  afterAll(async () => {
    if (companyId) {
      await prisma.publicationMetric.deleteMany({ where: { socialAccount: { companyId } } })
      await prisma.publicationRecord.deleteMany({ where: { variant: { content: { companyId } } } })
      await prisma.contentSchedule.deleteMany({ where: { variant: { content: { companyId } } } })
      await prisma.content.updateMany({ where: { companyId }, data: { currentApprovalId: null } })
      await prisma.approvalAction.deleteMany({ where: { content: { companyId } } })
      await prisma.platformVariant.deleteMany({ where: { content: { companyId } } })
      await prisma.contentBrief.deleteMany({ where: { content: { companyId } } })
      await prisma.content.deleteMany({ where: { companyId } })
      await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId } } })
      await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId } } })
      await prisma.aiSettings.deleteMany({ where: { companyId } })
      await prisma.authSession.deleteMany({ where: { user: { companyId } } })
      await prisma.bmcBlock.deleteMany({ where: { companyId } })
      await prisma.brandProfile.deleteMany({ where: { companyId } })
      await prisma.socialAccount.deleteMany({ where: { companyId } })
      await prisma.user.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await app?.close()
    await prisma.$disconnect()
  })

  it('validates the canonical professional account and updates the existing row', async () => {
    const auth = await session()
    const initial = await app.inject({ method: 'GET', url: '/api/integrations', headers: { cookie: auth.cookie } })
    const result = await app.inject({ method: 'POST', url: '/api/integrations/instagram/connect', headers: headers(auth, initial.json().data.instagram.version), payload: {} })
    expect(result.statusCode).toBe(200)
    expect(result.json().data).toMatchObject({ mode: 'api', status: 'connected', accountName: 'shifdlabs', currentSource: 'instagram_api' })
    expect((await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })).externalAccountId).toBe('17841447520550815')
    expect(fake.profileCalls).toBeGreaterThan(0)
  })

  it('persists account snapshot and matched media metrics without publication side effects', async () => {
    const auth = await session()
    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })
    const before = await prisma.content.findUniqueOrThrow({ where: { id: contentId }, select: { id: true, editorialStage: true, version: true } }).catch(() => null)
    const result = await app.inject({ method: 'POST', url: '/api/integrations/instagram/sync', headers: headers(auth, account.version), payload: {} })
    expect(result.statusCode).toBe(200)
    expect(result.json().data).toMatchObject({ mode: 'api', matchedPublications: 1, needsSelection: [] })
    const metric = await prisma.publicationMetric.findUniqueOrThrow({ where: { publicationRecordId_source: { publicationRecordId: publicationId, source: 'instagram_api' } } })
    expect(metric).toMatchObject({ externalMediaId: '18000000000000001', source: 'instagram_api', platform: 'instagram', version: 1 })
    expect(metric.views).toBe(27n)
    expect(metric.reach).toBe(8n)
    expect(metric.likes).toBe(2n)
    expect(metric.comments).toBe(0n)
    expect(metric.saves).toBe(0n)
    const weekly = await prisma.weeklyMetric.findFirstOrThrow({ where: { socialAccountId: accountId, source: 'instagram_api' } })
    expect(weekly).toMatchObject({ followers: 6n, reach: null, impressions: null, likes: null, comments: null, saves: null })
    expect(before).not.toBeNull()
    expect(await prisma.publicationRecord.count({ where: { variant: { content: { companyId } } } })).toBe(1)
    expect(await prisma.content.findUniqueOrThrow({ where: { id: contentId }, select: { id: true, editorialStage: true, version: true } })).toEqual(before)
  })

  it('updates the canonical observation on repeat sync and exposes post metrics', async () => {
    const auth = await session()
    fake.insights = { views: 31, reach: 9, likes: 3, comments: 1, saves: 0, shares: 1, totalInteractions: 5 }
    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })
    const result = await app.inject({ method: 'POST', url: '/api/integrations/instagram/sync', headers: headers(auth, account.version), payload: {} })
    expect(result.statusCode).toBe(200)
    const metric = await prisma.publicationMetric.findUniqueOrThrow({ where: { publicationRecordId_source: { publicationRecordId: publicationId, source: 'instagram_api' } } })
    expect(metric.version).toBe(2)
    expect(metric.views).toBe(31n)
    expect(metric.totalInteractions).toBe(5n)
    const publications = await app.inject({ method: 'GET', url: '/api/publications?platform=instagram', headers: { cookie: auth.cookie } })
    expect(publications.statusCode).toBe(200)
    expect(publications.json().data[0].postMetrics).toMatchObject({ scope: 'publication', source: 'instagram_api', views: 31, reach: 9, likes: 3, comments: 1, saves: 0, shares: 1, totalInteractions: 5, version: 2 })
    const performance = await app.inject({ method: 'GET', url: '/api/performance?weeks=4&platform=instagram', headers: { cookie: auth.cookie } })
    expect(performance.statusCode).toBe(200)
    expect(performance.json().data.summary.impressions).toBeNull()
    expect(performance.json().data.summary.engagementRate).toBeNull()
  })
})

describe('Meta Instagram provider', () => {
  it('redacts credentials and maps profile, media, and insight responses', async () => {
    const token = 'unit-test-token'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/me?')) return new Response(JSON.stringify({ user_id: '17841447520550815', username: 'shifdlabs', account_type: 'BUSINESS', followers_count: 6, media_count: 1 }), { status: 200 })
      if (url.includes('/media?')) return new Response(JSON.stringify({ data: [{ id: '1', timestamp: '2026-09-18T00:00:00+0000', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/test/' }] }), { status: 200 })
      if (url.includes('/insights?metric=views')) return new Response(JSON.stringify({ data: [{ name: 'views', values: [{ value: 0 }] }, { name: 'reach', values: [{ value: 8 }] }, { name: 'saved', values: [{ value: 0 }] }] }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ name: 'reach', values: [{ value: 0, end_time: '2026-09-19T00:00:00+0000' }] }] }), { status: 200 })
    })
    const provider = new MetaInstagramInsightsProvider({ instagramAccessToken: token, instagramUserId: '17841447520550815' })
    expect((await provider.getProfile()).followersCount).toBe(6)
    expect((await provider.listMedia())[0]?.id).toBe('1')
    expect(await provider.getMediaInsights('1')).toMatchObject({ views: 0, reach: 8, saves: 0 })
    expect((await provider.getAccountReach({ period: 'day' })).values[0]?.value).toBe(0)
    expect((await provider.getProfile()).username).toBe('shifdlabs')
    fetchMock.mockRestore()
  })

  it.each([401, 403, 429, 500, 503])('returns a safe provider error for HTTP %s', async (status) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 190, type: 'OAuthException', message: 'safe provider message' } }), { status }))
    const provider = new MetaInstagramInsightsProvider({ instagramAccessToken: 'unit-test-token', instagramUserId: '17841447520550815' })
    await expect(provider.getProfile()).rejects.toBeInstanceOf(InstagramProviderError)
    fetchMock.mockRestore()
  })

  it('maps a network timeout to a safe provider error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network timeout'))
    const provider = new MetaInstagramInsightsProvider({ instagramAccessToken: 'unit-test-token', instagramUserId: '17841447520550815' })
    await expect(provider.getProfile()).rejects.toMatchObject({ status: 503 })
    fetchMock.mockRestore()
  })
})
