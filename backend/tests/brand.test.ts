import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import { M4_OUTPUT_SCHEMA_VERSION } from '../src/modules/ai/constants.js'
import { m4PromptDigest, m3PromptDigest, promptDigest } from '../src/modules/ai/prompt.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from '../src/modules/ai/provider.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for database-backed tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = {
  ...loadConfig({
    NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: testDatabaseUrl,
    ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000', AI_REQUEST_TIMEOUT_MS: '100',
  }),
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `phase8-${suffix}@example.test`
const otherEmail = `phase8-other-${suffix}@example.test`
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
const assessmentOutput = {
  score: 91,
  status: 'aligned',
  recommendation: 'The variant is aligned with the supplied context.',
  checks,
}
const warningOutput = {
  score: 61,
  status: 'needs_attention',
  recommendation: 'Clarify the claim before review.',
  checks: checks.map((check, index) => index === 3 ? { ...check, status: 'warning' as const } : check),
}

class FakeAiProvider implements AiProvider {
  calls = 0
  requests: AiProviderRequest[] = []
  outcome: 'success' | 'warning' | 'invalid' | 'failure' | 'timeout' = 'success'
  blocked = false
  private releasePromise: Promise<void> | null = null
  private releaseResolve: (() => void) | null = null

  isConfigured() { return true }

  reset() {
    this.release()
    this.outcome = 'success'
    this.blocked = false
    this.calls = 0
    this.requests = []
  }

  release() {
    this.releaseResolve?.()
    this.releaseResolve = null
    this.releasePromise = null
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1
    this.requests.push(request)
    if (this.blocked) {
      this.releasePromise ??= new Promise<void>((resolve) => { this.releaseResolve = resolve })
      await this.releasePromise
    }
    if (this.outcome === 'invalid') return { text: '{not-json', inputTokens: null, outputTokens: null, providerRequestId: 'fake-invalid' }
    if (this.outcome === 'failure') throw new AiProviderFailure('provider', 'simulated provider failure', 'fake-failure')
    if (this.outcome === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, request.timeoutMs + 10))
      throw new AiProviderFailure('timeout', 'simulated provider timeout', 'fake-timeout')
    }
    return {
      text: JSON.stringify(this.outcome === 'warning' ? warningOutput : assessmentOutput),
      inputTokens: 31,
      outputTokens: 47,
      providerRequestId: `fake-brand-${this.calls}`,
    }
  }
}

const fake = new FakeAiProvider()

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(address: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: address, password: 'correct-password' } })
  if (response.statusCode !== 200) throw new Error(`Test login failed: ${response.statusCode} ${response.body.replaceAll('correct-password', '[redacted]')}`)
  const body = response.json<{ data?: { csrfToken?: unknown } }>()
  if (typeof body.data?.csrfToken !== 'string' || !body.data.csrfToken) throw new Error(`Test login failed: missing CSRF token (${response.statusCode})`)
  return { cookie: cookieFrom(response), csrf: body.data.csrfToken }
}

async function waitForProviderCalls(expected: number) {
  const deadline = Date.now() + 1_000
  while (fake.calls < expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function headers(auth: { cookie: string; csrf: string }, version?: number, key?: string) {
  return {
    origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf,
    ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    ...(key === undefined ? {} : { 'idempotency-key': key }),
  }
}

function companyPayload() {
  return {
    profile: {
      name: 'Phase 8 Company', description: 'A deterministic company context for brand checking.', industry: 'Software', businessTypes: ['B2B'],
      primaryMarket: 'Indonesia', website: 'phase8.example.com', mission: 'Make work clearer.', vision: 'A useful future.', positioning: 'A practical workflow.', coreValueProposition: 'Clear decisions.', differentiators: ['Focused'],
      customerSegments: ['Operations teams'], decisionMakers: ['Operations leads'], painPoints: ['Scattered decisions'],
    },
    brand: {
      brandVoice: 'Direct and thoughtful', toneDescription: 'Clear and calm.', preferredLanguage: 'English', communicationGuidelines: ['Use plain language'],
      preferredTerms: ['workflow'], thingsToAvoid: ['Hype'], ctaStyle: 'Invite a useful next step', brandKeywords: ['clarity'],
    },
    bmcBlocks: ['key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams'].map((type) => ({ type, entries: [`${type} evidence`] })),
  }
}

function brief(topic = 'How teams make decisions visible') {
  return { contextType: 'company', productId: null, pillarCode: 'educational', objective: 'education', targetAudience: 'Lean startup founders', topic, angle: null, additionalInstructions: null }
}

const master = { title: 'A canonical master', coreMessage: 'A grounded core message.', hook: 'A useful hook.', body: 'A practical body based on supplied context.', cta: 'Take a useful next step.' }
const visualDirection = { format: 'Carousel', concept: 'Show a practical workflow.', structure: ['Problem', 'Approach', 'Next step'], notes: 'Use a calm editorial layout.' }

async function createReadyContent(auth: { cookie: string; csrf: string }, key: string) {
  const created = await app.inject({ method: 'POST', url: '/api/contents', headers: headers(auth, undefined, `${key}-create`), payload: { brief: brief(), enabledPlatforms: ['instagram', 'linkedin'] } })
  expect(created.statusCode).toBe(201)
  const id = created.json().data.id as string
  const saved = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: headers(auth, 1), payload: { master, visualDirection } })
  expect(saved.statusCode).toBe(200)
  await prisma.platformVariant.updateMany({ where: { contentId: id }, data: { copy: 'A complete platform adaptation.', cta: 'Continue the conversation.', hashtags: '#workflow', visualRecommendation: 'Use the supplied editorial visual direction.', adaptedFromMasterRevision: 1 } })
  return { id, version: saved.json().data.version as number }
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
  await prisma.platformVariant.updateMany({ where: { content: { companyId: id } }, data: { currentAssessmentId: null } })
  await prisma.brandAssessment.deleteMany({ where: { variant: { content: { companyId: id } } } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
  await prisma.contentEvent.deleteMany({ where: { content: { companyId: id } } })
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

runIntegration('Phase 8 M4 Brand Consistency Checker', () => {
  beforeEach(() => fake.reset())

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake })
    const seeded = await seedM2Prompt(app.prisma)
    expect(seeded.digest).toBe(promptDigest())
    expect(seeded.m3Digest).toBe(m3PromptDigest())
    expect(seeded.m4Digest).toBe(m4PromptDigest())
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 8 Company', companyDescription: 'Initial company', userName: 'Phase 8 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 8 Other', companyDescription: 'Other company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 8 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const auth = await session(email)
    const current = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: headers(auth, current.json().data.contextVersion), payload: companyPayload() })
    if (saved.statusCode !== 200) throw new Error(`Phase 8 company setup failed: ${saved.statusCode} ${saved.body}`)
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('B401-B403: seeds immutable M4 v1 metadata without changing M2/M3', async () => {
    const beforeM2 = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M2', version: 'v1' } } })
    const beforeM3 = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M3', version: 'v1' } } })
    const first = await seedM2Prompt(app.prisma)
    const second = await seedM2Prompt(app.prisma)
    expect(first.m4Id).toBe(second.m4Id)
    expect(first.m4Digest).toBe(m4PromptDigest())
    const afterM2 = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M2', version: 'v1' } } })
    const afterM3 = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M3', version: 'v1' } } })
    expect(afterM2?.templateDigest).toBe(beforeM2?.templateDigest)
    expect(afterM3?.templateDigest).toBe(beforeM3?.templateDigest)
    const auth = await session(email)
    const response = await app.inject({ method: 'GET', url: '/api/prompt-versions?module=M4', headers: { cookie: auth.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject([{ module: 'M4', operation: 'brand_check', version: 'v1', status: 'active', templateDigest: m4PromptDigest() }])
    expect(response.json().data[0]).not.toHaveProperty('template')
  })

  it('B404-B416: enforces auth, exact command shape, ownership and readiness before the provider', async () => {
    const auth = await session(email)
    const other = await session(otherEmail)
    const prepared = await createReadyContent(auth, 'phase8-boundary')
    // Pass Origin validation so this assertion specifically exercises the authentication boundary.
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: { origin }, payload: { platform: 'instagram' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: { cookie: auth.cookie, 'if-match': `"${prepared.version}"`, 'idempotency-key': 'no-origin' }, payload: { platform: 'instagram' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: { origin, cookie: auth.cookie, 'if-match': `"${prepared.version}"`, 'idempotency-key': 'no-csrf' }, payload: { platform: 'instagram' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, undefined, 'no-etag'), payload: { platform: 'instagram' } })).statusCode).toBe(428)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'bad-body'), payload: { platform: 'instagram', score: 100 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'bad-platform'), payload: { platform: 'facebook' } })).statusCode).toBe(422)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: { ...headers(other, prepared.version), 'idempotency-key': 'wrong-company' }, payload: { platform: 'instagram' } })).statusCode).toBe(404)
    expect(fake.calls).toBe(0)
    await prisma.platformVariant.updateMany({ where: { contentId: prepared.id, platform: 'instagram' }, data: { enabled: false } })
    const disabled = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'disabled'), payload: { platform: 'instagram' } })
    expect(disabled.statusCode).toBe(422)
    expect(fake.calls).toBe(0)
  })

  it('B417-B440/B456-B462: stores one advisory assessment without changing editorial content', async () => {
    const auth = await session(email)
    const prepared = await createReadyContent(auth, 'phase8-success')
    const before = await app.inject({ method: 'GET', url: `/api/contents/${prepared.id}`, headers: { cookie: auth.cookie } })
    const beforeData = before.json().data
    const targetBefore = beforeData.variants.find((variant: { platform: string }) => variant.platform === 'instagram')
    const response = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'phase8-success-check'), payload: { platform: 'instagram' } })
    expect(response.statusCode).toBe(200)
    const data = response.json().data
    const target = data.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram')
    expect(data.request).toMatchObject({ module: 'M4', operation: 'brand_check', variantId: target.id, status: 'success', inputTokens: 31, outputTokens: 47, estimatedCostUsd: null })
    expect(target).toMatchObject({ copy: targetBefore.copy, cta: targetBefore.cta, hashtags: targetBefore.hashtags, visualRecommendation: targetBefore.visualRecommendation, revision: targetBefore.revision })
    expect(data.content).toMatchObject({ version: prepared.version + 1, editorialRevision: beforeData.editorialRevision, master: beforeData.master, visualDirection: beforeData.visualDirection, editorialStage: beforeData.editorialStage })
    expect(target.assessment).toMatchObject({ variantId: target.id, variantRevision: target.revision, score: 91, status: 'aligned', recommendation: assessmentOutput.recommendation, checks: assessmentOutput.checks, freshness: 'current' })
    expect(target.assessment).not.toHaveProperty('inputHash')
    const assessment = await prisma.brandAssessment.findUnique({ where: { id: target.assessment.id } })
    expect(fake.requests.at(-1)?.outputSchemaVersion).toBe(M4_OUTPUT_SCHEMA_VERSION)
    expect(await prisma.aiRequestLog.findUnique({ where: { id: data.request.id } })).toMatchObject({ provider: 'openai', model: 'gpt-5.6-luna' })
    expect(assessment?.variantRevision).toBe(target.revision)
    expect(assessment?.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await prisma.brandAssessment.count({ where: { variantId: target.id } })).toBe(1)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_brand_checked' } })).toBe(1)
    const event = await prisma.contentEvent.findFirst({ where: { contentId: prepared.id, eventType: 'ai_brand_checked' } })
    expect(JSON.stringify(event?.metadata)).not.toMatch(/inputHash|snapshot|rawPrompt|OPENAI|secret/i)
    expect(data.content.approval).toBeNull()
    expect(data.content.variants.find((variant: { platform: string }) => variant.platform === 'linkedin')).toMatchObject({ revision: 1 })
    const requestLog = await prisma.aiRequestLog.findUnique({ where: { id: data.request.id } })
    expect(requestLog).toMatchObject({ module: 'M4', operation: 'brand_check', variantId: target.id, status: 'success' })
    expect(JSON.stringify(requestLog?.inputSnapshot)).not.toMatch(/storageKey|contentUrl|OPENAI_API_KEY|cookie|csrf/i)
  })

  it('B420-B422/B444-B446: validates advisory semantics and keeps failures non-mutating', async () => {
    const auth = await session(email)
    const warningContent = await createReadyContent(auth, 'phase8-warning')
    fake.outcome = 'warning'
    const warning = await app.inject({ method: 'POST', url: `/api/contents/${warningContent.id}/brand-check`, headers: headers(auth, warningContent.version, 'warning'), payload: { platform: 'instagram' } })
    expect(warning.statusCode).toBe(200)
    expect(warning.json().data.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram').assessment).toMatchObject({ status: 'needs_attention', score: 61 })

    const invalidContent = await createReadyContent(auth, 'phase8-invalid')
    fake.outcome = 'invalid'
    const invalid = await app.inject({ method: 'POST', url: `/api/contents/${invalidContent.id}/brand-check`, headers: headers(auth, invalidContent.version, 'invalid'), payload: { platform: 'instagram' } })
    expect(invalid.statusCode).toBe(502)
    expect(invalid.json().error.code).toBe('AI_OUTPUT_INVALID')
    expect(await prisma.brandAssessment.count({ where: { variant: { contentId: invalidContent.id } } })).toBe(0)

    const failureContent = await createReadyContent(auth, 'phase8-failure')
    fake.outcome = 'failure'
    const failure = await app.inject({ method: 'POST', url: `/api/contents/${failureContent.id}/brand-check`, headers: headers(auth, failureContent.version, 'failure'), payload: { platform: 'instagram' } })
    expect(failure.statusCode).toBe(502)
    expect(failure.json().error.code).toBe('AI_PROVIDER_ERROR')

    const timeoutContent = await createReadyContent(auth, 'phase8-timeout')
    fake.outcome = 'timeout'
    const timeout = await app.inject({ method: 'POST', url: `/api/contents/${timeoutContent.id}/brand-check`, headers: headers(auth, timeoutContent.version, 'timeout'), payload: { platform: 'instagram' } })
    expect(timeout.statusCode).toBe(504)
    expect(timeout.json().error.code).toBe('AI_TIMEOUT')
    expect(await prisma.brandAssessment.count({ where: { variant: { contentId: timeoutContent.id } } })).toBe(0)
  })

  it('B408/B447-B451: distinguishes initial ETag conflicts from relevant drift', async () => {
    const auth = await session(email)
    const prepared = await createReadyContent(auth, 'phase8-stale')
    const staleIfMatch = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version - 1, 'stale-if-match'), payload: { platform: 'instagram' } })
    expect(staleIfMatch.statusCode).toBe(412)
    expect(fake.calls).toBe(0)

    fake.blocked = true
    const pendingPromise = app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'relevant-drift'), payload: { platform: 'instagram' } })
    await waitForProviderCalls(1)
    expect(fake.calls).toBe(1)
    const changed = await app.inject({ method: 'PATCH', url: `/api/contents/${prepared.id}`, headers: headers(auth, prepared.version), payload: { master: { ...master, title: 'Changed while checking' } } })
    expect(changed.statusCode).toBe(200)
    fake.release()
    const stale = await pendingPromise
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('INPUT_CHANGED')
    expect(await prisma.aiRequestLog.count({ where: { contentId: prepared.id, status: 'stale' } })).toBe(1)
    expect(await prisma.brandAssessment.count({ where: { variant: { contentId: prepared.id } } })).toBe(0)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_brand_checked' } })).toBe(0)
  })

  it('B428/B441-B443/B452-B455: appends historical assessments and replays idempotently', async () => {
    const auth = await session(email)
    const prepared = await createReadyContent(auth, 'phase8-replay')
    const first = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'replay-key'), payload: { platform: 'instagram' } })
    expect(first.statusCode).toBe(200)
    const firstData = first.json().data
    const calls = fake.calls
    const replay = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'replay-key'), payload: { platform: 'instagram' } })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.request.id).toBe(firstData.request.id)
    expect(fake.calls).toBe(calls)
    expect(await prisma.brandAssessment.count({ where: { variant: { contentId: prepared.id } } })).toBe(1)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_brand_checked' } })).toBe(1)

    const mismatch = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, prepared.version, 'replay-key'), payload: { platform: 'linkedin' } })
    expect(mismatch.statusCode).toBe(409)
    expect(mismatch.json().error.code).toBe('IDEMPOTENCY_CONFLICT')

    const changed = await app.inject({ method: 'PUT', url: '/api/company', headers: headers(auth, 2), payload: companyPayload() })
    expect(changed.statusCode).toBe(200)
    const rerun = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/brand-check`, headers: headers(auth, firstData.content.version, 'rerun-after-context'), payload: { platform: 'instagram' } })
    expect(rerun.statusCode).toBe(200)
    const rerunData = rerun.json().data
    expect(rerunData.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram').assessment.id).not.toBe(firstData.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram').assessment.id)
    expect(await prisma.brandAssessment.count({ where: { variant: { contentId: prepared.id } } })).toBe(2)
    const list = await app.inject({ method: 'GET', url: `/api/ai-requests?module=M4&contentId=${prepared.id}`, headers: { cookie: auth.cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json().data.every((request: Record<string, unknown>) => !('inputSnapshot' in request) && !('inputHash' in request))).toBe(true)
    const usage = await app.inject({ method: 'GET', url: `/api/ai-usage?start=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`, headers: { cookie: auth.cookie } })
    expect(usage.statusCode).toBe(200)
    expect(usage.json().data.mode).toBe('real')
    expect(usage.json().data.unknownCostRequests).toBeGreaterThanOrEqual(2)
  })
})
