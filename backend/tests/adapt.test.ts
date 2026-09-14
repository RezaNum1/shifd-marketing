import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import { m3PromptDigest, promptDigest } from '../src/modules/ai/prompt.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from '../src/modules/ai/provider.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config: AppConfig = {
  ...loadConfig({
    NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: process.env.DATABASE_URL,
    ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000', AI_REQUEST_TIMEOUT_MS: '100',
  }),
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `phase7-${suffix}@example.test`
const otherEmail = `phase7-other-${suffix}@example.test`
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let otherCompanyId = ''

const master = { title: 'A canonical master', coreMessage: 'A grounded core message.', hook: 'A useful hook.', body: 'A practical body based on supplied context.', cta: 'Take a useful next step.' }
const visualDirection = { format: 'Carousel', concept: 'Show the problem and a practical workflow.', structure: ['Problem', 'Approach', 'Next step'], notes: 'Use a calm, editorial layout.' }
const instagramOutput = { copy: 'Instagram adaptation grounded in the Master.', cta: 'Learn more about the workflow.', hashtags: '#B2B #Workflow', visualRecommendation: 'Use a concise carousel showing the workflow.' }
const linkedinOutput = { copy: 'LinkedIn adaptation grounded in the Master.', cta: 'Continue the conversation with your team.', hashtags: '#B2B #Operations', visualRecommendation: 'Use a professional document-style visual.' }

class FakeAiProvider implements AiProvider {
  calls = 0
  requests: AiProviderRequest[] = []
  outcome: 'success' | 'invalid' | 'failure' | 'timeout' = 'success'
  blocked = false
  release: (() => void) | null = null

  isConfigured() { return true }

  reset() {
    this.release?.()
    this.release = null
    this.blocked = false
    this.outcome = 'success'
    this.calls = 0
    this.requests = []
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1
    this.requests.push(request)
    if (this.blocked) await new Promise<void>((resolve) => { this.release = resolve })
    if (this.outcome === 'invalid') return { text: '{invalid-json', inputTokens: null, outputTokens: null, providerRequestId: 'fake-invalid' }
    if (this.outcome === 'failure') throw new AiProviderFailure('provider', 'simulated provider failure', 'fake-failure')
    if (this.outcome === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, request.timeoutMs + 25))
      throw new AiProviderFailure('timeout', 'simulated provider timeout', 'fake-timeout')
    }
    const text = request.userPrompt.includes('"code":"linkedin"') ? JSON.stringify(linkedinOutput) : JSON.stringify(instagramOutput)
    return { text, inputTokens: 17, outputTokens: 23, providerRequestId: `fake-${this.calls}` }
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
      name: 'Phase 7 Company', description: 'A deterministic company context for adaptation.', industry: 'Software', businessTypes: ['B2B'],
      primaryMarket: 'Indonesia', website: 'phase7.example.com', mission: 'Make work clearer.', vision: 'A useful future.', positioning: 'A practical workflow.', coreValueProposition: 'Clear decisions.', differentiators: ['Focused'],
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

async function createPreparedContent(auth: { cookie: string; csrf: string }, key: string) {
  const created = await app.inject({ method: 'POST', url: '/api/contents', headers: headers(auth, undefined, `${key}-create`), payload: { brief: brief(), enabledPlatforms: ['instagram', 'linkedin'] } })
  expect(created.statusCode).toBe(201)
  const id = created.json().data.id as string
  const prepared = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: headers(auth, 1), payload: { master, visualDirection } })
  expect(prepared.statusCode).toBe(200)
  expect(prepared.json().data.version).toBe(2)
  return { id, version: 2 }
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
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

runIntegration('Phase 7 M3 cross-platform adaptation', () => {
  beforeEach(() => fake.reset())

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake })
    const seeded = await seedM2Prompt(app.prisma)
    expect(seeded.digest).toBe(promptDigest())
    expect(seeded.m3Digest).toBe(m3PromptDigest())
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 7 Company', companyDescription: 'Initial company', userName: 'Phase 7 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 7 Other', companyDescription: 'Other company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 7 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const auth = await session(email)
    const current = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: headers(auth, current.json().data.contextVersion), payload: companyPayload() })
    if (saved.statusCode !== 200) throw new Error(`Phase 7 company setup failed: ${saved.statusCode} ${saved.body}`)
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('M301-M303: seeds M3 v1 idempotently without changing M2 metadata', async () => {
    const before = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M2', version: 'v1' } } })
    const first = await seedM2Prompt(app.prisma)
    const second = await seedM2Prompt(app.prisma)
    expect(first.m3Id).toBe(second.m3Id)
    expect(first.m3Digest).toBe(second.m3Digest)
    const after = await prisma.promptVersion.findUnique({ where: { module_version: { module: 'M2', version: 'v1' } } })
    expect(after?.templateDigest).toBe(before?.templateDigest)
    const auth = await session(email)
    const response = await app.inject({ method: 'GET', url: '/api/prompt-versions?module=M3', headers: { cookie: auth.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toHaveLength(1)
    expect(response.json().data[0]).toMatchObject({ module: 'M3', operation: 'adapt', version: 'v1', status: 'active', templateDigest: m3PromptDigest() })
    expect(response.json().data[0]).not.toHaveProperty('template')
  })

  it('M304-M312: enforces authentication, mutation boundaries, exact body, and enabled target', async () => {
    const auth = await session(email)
    const prepared = await createPreparedContent(auth, 'phase7-boundary')
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: { origin }, payload: { platform: 'instagram' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: { cookie: auth.cookie, 'if-match': '"2"', 'idempotency-key': 'no-origin' }, payload: { platform: 'instagram' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: { cookie: auth.cookie, origin, 'if-match': '"2"', 'idempotency-key': 'no-csrf' }, payload: { platform: 'instagram' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, undefined, 'no-if-match'), payload: { platform: 'instagram' } })).statusCode).toBe(428)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2), payload: { platform: 'instagram' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2, 'unknown-body'), payload: { platform: 'instagram', prompt: 'no' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2, 'unsupported-platform'), payload: { platform: 'facebook' } })).statusCode).toBe(422)
    await prisma.platformVariant.updateMany({ where: { contentId: prepared.id, platform: 'instagram' }, data: { enabled: false } })
    const disabled = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2, 'disabled-target'), payload: { platform: 'instagram' } })
    expect(disabled.statusCode).toBe(409)
  })

  it('M316-M329/M351-M356: adapts only the target Variant and derives Adapted after both are current', async () => {
    const auth = await session(email)
    const prepared = await createPreparedContent(auth, 'phase7-success')
    const first = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, prepared.version, 'phase7-instagram'), payload: { platform: 'instagram' } })
    expect(first.statusCode).toBe(200)
    const firstData = first.json().data
    expect(firstData.request).toMatchObject({ module: 'M3', operation: 'adapt', variantId: firstData.content.variants.find((v: { platform: string }) => v.platform === 'instagram').id, status: 'success', inputTokens: 17, outputTokens: 23, estimatedCostUsd: null })
    expect(firstData.content.variants.find((v: { platform: string }) => v.platform === 'instagram')).toMatchObject({ copy: instagramOutput.copy, cta: instagramOutput.cta, hashtags: instagramOutput.hashtags, visualRecommendation: instagramOutput.visualRecommendation, revision: 2, adaptationState: 'current' })
    expect(firstData.content.variants.find((v: { platform: string }) => v.platform === 'linkedin')).toMatchObject({ copy: null, revision: 1, adaptationState: 'missing' })
    expect(firstData.content).toMatchObject({ version: 3, editorialRevision: 3, master: master, visualDirection, editorialStage: 'generated', lifecycleStatus: 'Generated' })
    expect(firstData.request).not.toHaveProperty('inputSnapshot')
    expect(firstData.request).not.toHaveProperty('inputHash')
    const snapshot = await prisma.aiRequestLog.findUnique({ where: { id: firstData.request.id } })
    expect(snapshot?.module).toBe('M3')
    expect(snapshot?.variantId).toBe(firstData.content.variants.find((v: { platform: string }) => v.platform === 'instagram').id)
    expect(snapshot?.inputSnapshot).toMatchObject({ content: { version: 2, editorialRevision: 2, masterRevision: 1 }, targetVariant: { platform: 'instagram', revision: 1 } })
    expect(JSON.stringify(snapshot?.inputSnapshot)).not.toContain('ANTHROPIC_API_KEY')

    const second = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 3, 'phase7-linkedin'), payload: { platform: 'linkedin' } })
    expect(second.statusCode).toBe(200)
    const secondData = second.json().data
    expect(secondData.content.editorialStage).toBe('adapted')
    expect(secondData.content.lifecycleStatus).toBe('Adapted')
    expect(secondData.content.variants.find((v: { platform: string }) => v.platform === 'linkedin')).toMatchObject({ copy: linkedinOutput.copy, revision: 2, adaptationState: 'current' })
    expect(secondData.content.variants.find((v: { platform: string }) => v.platform === 'instagram')).toMatchObject({ copy: instagramOutput.copy, revision: 2 })
    expect(secondData.request.variantId).toBe(secondData.content.variants.find((v: { platform: string }) => v.platform === 'linkedin').id)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_adapted' } })).toBe(2)

    const replay = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2, 'phase7-instagram'), payload: { platform: 'instagram' } })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.request.id).toBe(firstData.request.id)
    expect(fake.calls).toBe(2)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_adapted' } })).toBe(2)
    const conflictingPlatform = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, 2, 'phase7-instagram'), payload: { platform: 'linkedin' } })
    expect(conflictingPlatform.statusCode).toBe(409)
    expect(conflictingPlatform.json().error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('M327-M338: detects relevant drift but allows an unrelated other-platform edit', async () => {
    const auth = await session(email)
    const staleContent = await createPreparedContent(auth, 'phase7-relevant-stale')
    fake.blocked = true
    const staleCall = app.inject({ method: 'POST', url: `/api/contents/${staleContent.id}/adapt`, headers: headers(auth, staleContent.version, 'phase7-relevant-stale-adapt'), payload: { platform: 'instagram' } })
    for (let attempt = 0; attempt < 100 && fake.calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const changed = await app.inject({ method: 'PATCH', url: `/api/contents/${staleContent.id}`, headers: headers(auth, staleContent.version), payload: { master: { ...master, body: 'Changed while adaptation runs.' } } })
    expect(changed.statusCode).toBe(200)
    fake.release?.()
    const stale = await staleCall
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('INPUT_CHANGED')
    const staleRequest = await prisma.aiRequestLog.findFirst({ where: { companyId, contentId: staleContent.id, module: 'M3' } })
    expect(staleRequest).toMatchObject({ status: 'stale', errorCode: 'INPUT_CHANGED' })
    expect((await app.inject({ method: 'GET', url: `/api/contents/${staleContent.id}`, headers: { cookie: auth.cookie } })).json().data.variants[0].copy).toBeNull()
    expect(await prisma.contentEvent.count({ where: { contentId: staleContent.id, eventType: 'ai_adapted' } })).toBe(0)

    fake.reset()
    const unrelatedContent = await createPreparedContent(auth, 'phase7-unrelated-platform')
    fake.blocked = true
    const targetCall = app.inject({ method: 'POST', url: `/api/contents/${unrelatedContent.id}/adapt`, headers: headers(auth, unrelatedContent.version, 'phase7-unrelated-adapt'), payload: { platform: 'instagram' } })
    for (let attempt = 0; attempt < 100 && fake.calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const linked = await app.inject({ method: 'PUT', url: `/api/contents/${unrelatedContent.id}/variants/linkedin`, headers: headers(auth, unrelatedContent.version), payload: linkedinOutput })
    expect(linked.statusCode).toBe(200)
    fake.release?.()
    const unaffected = await targetCall
    expect(unaffected.statusCode).toBe(200)
    expect(unaffected.json().data.content.editorialStage).toBe('adapted')
    expect(unaffected.json().data.content.variants.find((v: { platform: string }) => v.platform === 'linkedin')).toMatchObject({ copy: linkedinOutput.copy, revision: 2 })
  })

  it('M313-M315/M344-M350/M354: readiness and provider failures occur before any partial Variant write', async () => {
    const auth = await session(email)
    const noMaster = await app.inject({ method: 'POST', url: '/api/contents', headers: headers(auth, undefined, 'phase7-no-master-create'), payload: { brief: brief(), enabledPlatforms: ['instagram'] } })
    expect(noMaster.statusCode).toBe(201)
    const noMasterAdapt = await app.inject({ method: 'POST', url: `/api/contents/${noMaster.json().data.id}/adapt`, headers: headers(auth, 1, 'phase7-no-master-adapt'), payload: { platform: 'instagram' } })
    expect(noMasterAdapt.statusCode).toBe(422)
    expect(noMasterAdapt.json().error.code).toBe('INPUT_NOT_READY')
    expect(fake.calls).toBe(0)

    const failureContent = await createPreparedContent(auth, 'phase7-failure')
    fake.outcome = 'failure'
    const failed = await app.inject({ method: 'POST', url: `/api/contents/${failureContent.id}/adapt`, headers: headers(auth, failureContent.version, 'phase7-failure-adapt'), payload: { platform: 'instagram' } })
    expect(failed.statusCode).toBe(502)
    expect(failed.json().error.code).toBe('AI_PROVIDER_ERROR')
    expect(await prisma.aiRequestLog.findFirst({ where: { contentId: failureContent.id, module: 'M3' } })).toMatchObject({ status: 'failed', errorCode: 'AI_PROVIDER_ERROR' })
    expect((await app.inject({ method: 'GET', url: `/api/contents/${failureContent.id}`, headers: { cookie: auth.cookie } })).json().data.variants[0].copy).toBeNull()

    fake.reset()
    const timeoutContent = await createPreparedContent(auth, 'phase7-timeout')
    fake.outcome = 'timeout'
    const timeout = await app.inject({ method: 'POST', url: `/api/contents/${timeoutContent.id}/adapt`, headers: headers(auth, timeoutContent.version, 'phase7-timeout-adapt'), payload: { platform: 'instagram' } })
    expect(timeout.statusCode).toBe(504)
    expect(timeout.json().error.code).toBe('AI_TIMEOUT')

    fake.reset()
    const invalidContent = await createPreparedContent(auth, 'phase7-invalid')
    fake.outcome = 'invalid'
    const invalid = await app.inject({ method: 'POST', url: `/api/contents/${invalidContent.id}/adapt`, headers: headers(auth, invalidContent.version, 'phase7-invalid-adapt'), payload: { platform: 'instagram' } })
    expect(invalid.statusCode).toBe(502)
    expect(invalid.json().error.code).toBe('AI_OUTPUT_INVALID')
    expect(await prisma.aiRequestLog.findFirst({ where: { contentId: invalidContent.id, module: 'M3' } })).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID', inputTokens: null, outputTokens: null })
  })

  it('M339-M343: pending and completed idempotency never make a second provider call or event', async () => {
    const auth = await session(email)
    const prepared = await createPreparedContent(auth, 'phase7-pending')
    fake.blocked = true
    const first = app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, prepared.version, 'phase7-pending-adapt'), payload: { platform: 'instagram' } })
    for (let attempt = 0; attempt < 100 && fake.calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fake.calls).toBe(1)
    const pending = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, prepared.version, 'phase7-pending-adapt'), payload: { platform: 'instagram' } })
    expect(pending.statusCode).toBe(409)
    expect(pending.json().error.code).toBe('REQUEST_IN_PROGRESS')
    expect(fake.calls).toBe(1)
    fake.release?.()
    const completed = await first
    expect(completed.statusCode).toBe(200)
    const requestId = completed.json().data.request.id
    const replay = await app.inject({ method: 'POST', url: `/api/contents/${prepared.id}/adapt`, headers: headers(auth, prepared.version, 'phase7-pending-adapt'), payload: { platform: 'instagram' } })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.request.id).toBe(requestId)
    expect(fake.calls).toBe(1)
    expect(await prisma.contentEvent.count({ where: { contentId: prepared.id, eventType: 'ai_adapted' } })).toBe(1)
  })
})
