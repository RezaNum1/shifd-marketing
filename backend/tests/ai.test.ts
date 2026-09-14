import 'dotenv/config'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from '../src/modules/ai/provider.js'
import { promptDigest } from '../src/modules/ai/prompt.js'

const runIntegration = process.env.DATABASE_URL && process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
// This suite intentionally reuses one Fastify instance and logs in repeatedly
// across independent integration cases. Keep the production limiter enabled,
// but avoid exhausting its low production-oriented threshold during setup.
const config: AppConfig = {
  ...loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: process.env.DATABASE_URL, ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000', AI_REQUEST_TIMEOUT_MS: '100' }),
}
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `phase6-${suffix}@example.test`
const otherEmail = `phase6-other-${suffix}@example.test`
let companyId = ''
let otherCompanyId = ''
let app: Awaited<ReturnType<typeof buildApp>>

const output = {
  master: { title: 'A grounded master title', coreMessage: 'A clear core message.', hook: 'A useful hook.', body: 'A body grounded in the supplied context.', cta: 'Explore the next step.' },
  visualDirection: { format: 'Four-panel carousel', concept: 'Show the problem and a practical workflow.', structure: ['Problem', 'Approach', 'Outcome'], notes: 'Use calm, high-contrast editorial composition.' },
}

class FakeAiProvider implements AiProvider {
  calls = 0
  requests: AiProviderRequest[] = []
  outcome: 'success' | 'invalid' | 'failure' | 'timeout' = 'success'
  release: (() => void) | null = null
  blocked = false

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
    if (this.outcome === 'invalid') return { text: '{not-json', inputTokens: null, outputTokens: null, providerRequestId: 'fake-invalid' }
    if (this.outcome === 'failure') throw new AiProviderFailure('provider', 'simulated provider failure', 'fake-provider-failure')
    if (this.outcome === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, request.timeoutMs + 25))
      throw new AiProviderFailure('timeout', 'simulated timeout', 'fake-provider-timeout')
    }
    return { text: JSON.stringify(output), inputTokens: 111, outputTokens: 222, providerRequestId: `fake-${this.calls}` }
  }
}

const fake = new FakeAiProvider()

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function session(emailAddress: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: emailAddress, password: 'correct-password' } })
  if (response.statusCode !== 200) {
    throw new Error(`Test login failed: ${response.statusCode} ${response.body.replaceAll('correct-password', '[redacted]')}`)
  }
  const body = response.json<{ data?: { csrfToken?: unknown } }>()
  if (typeof body.data?.csrfToken !== 'string' || !body.data.csrfToken) {
    throw new Error(`Test login failed: 200 response did not contain a CSRF token: ${response.body.replaceAll('correct-password', '[redacted]')}`)
  }
  return { cookie: cookieFrom(response), csrf: body.data.csrfToken }
}

function mutationHeaders(auth: { cookie: string; csrf: string }, version?: number) {
  return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

function companyPayload() {
  return {
    profile: {
      name: 'Phase 6 Company', description: 'A deterministic company context for generation.', industry: 'Software', businessTypes: ['B2B'],
      primaryMarket: 'Indonesia', website: 'phase6.example.com', mission: 'Make work clearer.', vision: 'A useful future.', positioning: 'A practical workflow.', coreValueProposition: 'Clear decisions.', differentiators: ['Focused'],
      customerSegments: ['Operations teams'], decisionMakers: ['Operations leads'], painPoints: ['Scattered decisions'],
    },
    brand: {
      brandVoice: 'Direct and thoughtful', toneDescription: 'Clear and calm.', preferredLanguage: 'English', communicationGuidelines: ['Use plain language'],
      preferredTerms: ['workflow'], thingsToAvoid: ['Hype'], ctaStyle: 'Invite a useful next step', brandKeywords: ['clarity'],
    },
    bmcBlocks: ['key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams'].map((type) => ({ type, entries: [`${type} evidence`] })),
  }
}

function brief(topic: string) {
  return { contextType: 'company', productId: null, pillarCode: 'educational', objective: 'education', targetAudience: 'Lean startup founders', topic, angle: null, additionalInstructions: null }
}

async function createDraft(auth: { cookie: string; csrf: string }, key: string, topic = 'How to make decisions visible') {
  return app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': key }, payload: { brief: brief(topic), enabledPlatforms: ['instagram', 'linkedin'] } })
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

runIntegration('Phase 6 M2 Claude guided generation', () => {
  beforeEach(() => fake.reset())

  afterEach(() => fake.reset())

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake })
    await seedM2Prompt(app.prisma)
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 6 Company', companyDescription: 'Initial company', userName: 'Phase 6 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 6 Other', companyDescription: 'Other company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 6 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const auth = await session(email)
    const company = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(auth, company.json().data.contextVersion), payload: companyPayload() })
    if (saved.statusCode !== 200) throw new Error(`Phase 6 company setup failed: ${saved.statusCode}`)
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('AI01-AI05: provisions non-secret settings and exposes immutable prompt metadata only', async () => {
    const auth = await session(email)
    const settings = await app.inject({ method: 'GET', url: '/api/settings/ai', headers: { cookie: auth.cookie } })
    expect(settings.statusCode).toBe(200)
    expect(settings.json().data).toMatchObject({ provider: 'Claude', generationLanguage: 'English', mode: 'real', status: 'not_configured' })
    expect(JSON.stringify(settings.json())).not.toContain('ANTHROPIC_API_KEY')
    const prompts = await app.inject({ method: 'GET', url: '/api/prompt-versions?module=M2', headers: { cookie: auth.cookie } })
    expect(prompts.statusCode).toBe(200)
    expect(prompts.json().data[0]).toMatchObject({ module: 'M2', operation: 'generate', version: 'v1', status: 'active' })
    expect(prompts.json().data[0]).not.toHaveProperty('template')
    expect(prompts.json().data[0].templateDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(prompts.json().data[0].templateDigest).toBe(promptDigest())
    const seededAgain = await seedM2Prompt(app.prisma)
    expect(seededAgain.digest).toBe(promptDigest())
  })

  it('AI03/AI08/AI55: edits only generation language and protects settings with If-Match', async () => {
    const auth = await session(email)
    const before = await app.inject({ method: 'GET', url: '/api/settings/ai', headers: { cookie: auth.cookie } })
    const invalid = await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: mutationHeaders(auth, before.json().data.version), payload: { model: 'attacker-controlled', generationLanguage: 'English' } })
    expect(invalid.statusCode).toBe(400)
    const updated = await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: mutationHeaders(auth, before.json().data.version), payload: { generationLanguage: 'Indonesian' } })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().data.generationLanguage).toBe('Indonesian')
    expect((await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: mutationHeaders(auth, before.json().data.version), payload: { generationLanguage: 'English' } })).statusCode).toBe(412)
    const restored = await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: mutationHeaders(auth, updated.json().data.version), payload: { generationLanguage: 'English' } })
    expect(restored.statusCode).toBe(200)
  })

  it('AI06-AI10/AI54-AI58: enforces command boundaries, ownership, and no future operation', async () => {
    const auth = await session(email)
    const other = await session(otherEmail)
    const draft = await createDraft(auth, 'phase6-boundary-content')
    const contentId = draft.json().data.id
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/generate`, payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/generate`, headers: { cookie: auth.cookie, origin, 'if-match': '"1"', 'idempotency-key': 'missing-csrf' }, payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/generate`, headers: mutationHeaders(auth), payload: {} })).statusCode).toBe(428)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/generate`, headers: { ...mutationHeaders(auth, 1) }, payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${contentId}/generate`, headers: { ...mutationHeaders(other, 1), 'idempotency-key': 'wrong-company' }, payload: {} })).statusCode).toBe(404)
    // M3/M4 own their operation-specific routes; Human Review remains outside scope.
  })

  it('AI14-AI30/AI37/AI44-AI48/AI51-AI53: writes validated Master evidence exactly once and replays safely', async () => {
    const auth = await session(email)
    const draft = await createDraft(auth, 'phase6-success-content')
    const before = await app.inject({ method: 'GET', url: `/api/contents/${draft.json().data.id}`, headers: { cookie: auth.cookie } })
    const generated = await app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, before.json().data.version), 'idempotency-key': 'phase6-success' }, payload: {} })
    expect(generated.statusCode).toBe(200)
    const body = generated.json().data
    expect(body.content.master).toEqual(output.master)
    expect(body.content.visualDirection).toEqual(output.visualDirection)
    expect(body.content.editorialStage).toBe('generated')
    expect(body.content.lifecycleStatus).toBe('Generated')
    expect(body.request).toMatchObject({ module: 'M2', operation: 'generate', status: 'success', inputTokens: 111, outputTokens: 222, estimatedCostUsd: null })
    expect(body.request).not.toHaveProperty('inputSnapshot')
    expect(body.request).not.toHaveProperty('inputHash')
    expect(fake.requests.at(-1)?.systemPrompt).toContain('SERVER INSTRUCTIONS')
    expect(fake.requests.at(-1)?.userPrompt).toContain('COMPANY_CONTEXT_DATA')
    const log = await prisma.aiRequestLog.findUnique({ where: { id: body.request.id } })
    expect(log?.inputSnapshot).toMatchObject({ content: { id: draft.json().data.id, version: 1, editorialRevision: 1, masterRevision: 0 }, contextVersions: { company: 2 } })
    expect(log?.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(log?.inputSnapshot)).not.toContain('ANTHROPIC_API_KEY')
    const eventCount = await prisma.contentEvent.count({ where: { contentId: draft.json().data.id, eventType: 'ai_generated' } })
    expect(eventCount).toBe(1)
    const callsBeforeReplay = fake.calls
    const replay = await app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, before.json().data.version), 'idempotency-key': 'phase6-success' }, payload: {} })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.request.id).toBe(body.request.id)
    expect(fake.calls).toBe(callsBeforeReplay)
    expect(await prisma.contentEvent.count({ where: { contentId: draft.json().data.id, eventType: 'ai_generated' } })).toBe(1)
    const usage = await app.inject({ method: 'GET', url: `/api/ai-usage?start=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`, headers: { cookie: auth.cookie } })
    expect(usage.statusCode).toBe(200)
    expect(usage.json().data).toMatchObject({ mode: 'real', inputTokens: 111, outputTokens: 222, unknownUsageRequests: 0, unknownCostRequests: 1 })
  })

  it('AI11-AI13/AI39-AI43: rejects incomplete inputs and provider results without partial writes', async () => {
    const auth = await session(email)
    const otherAuth = await session(otherEmail)
    const incompleteCompanyDraft = await createDraft(otherAuth, 'phase6-incomplete-company')
    const callsBeforeReadiness = fake.calls
    const incompleteCompany = await app.inject({ method: 'POST', url: `/api/contents/${incompleteCompanyDraft.json().data.id}/generate`, headers: { ...mutationHeaders(otherAuth, 1), 'idempotency-key': 'phase6-incomplete-company' }, payload: {} })
    expect(incompleteCompany.statusCode).toBe(422)
    expect(incompleteCompany.json().error.code).toBe('INPUT_NOT_READY')
    expect(fake.calls).toBe(callsBeforeReadiness)

    const draft = await createDraft(auth, 'phase6-invalid-output')
    fake.outcome = 'invalid'
    const invalid = await app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-invalid' }, payload: {} })
    expect(invalid.statusCode).toBe(502)
    expect(invalid.json().error.code).toBe('AI_OUTPUT_INVALID')
    expect((await app.inject({ method: 'GET', url: `/api/contents/${draft.json().data.id}`, headers: { cookie: auth.cookie } })).json().data.master).toBeNull()
    const log = await prisma.aiRequestLog.findFirst({ where: { companyId, contentId: draft.json().data.id } })
    expect(log).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID' })
    fake.outcome = 'success'

    const product = await app.inject({ method: 'POST', url: '/api/products', headers: { ...mutationHeaders(auth), 'idempotency-key': 'phase6-incomplete-product' }, payload: { name: 'Incomplete Product', description: 'Product without AI-ready profile', category: null, status: 'active', url: null } })
    const productDraft = await app.inject({ method: 'POST', url: '/api/contents', headers: { ...mutationHeaders(auth), 'idempotency-key': 'phase6-product-content' }, payload: { brief: { ...brief('Product-specific topic'), contextType: 'product', productId: product.json().data.id }, enabledPlatforms: ['instagram'] } })
    const incompleteProduct = await app.inject({ method: 'POST', url: `/api/contents/${productDraft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-incomplete-product-generate' }, payload: {} })
    expect(incompleteProduct.statusCode).toBe(422)
    expect(incompleteProduct.json().error.code).toBe('PRODUCT_CONTEXT_INCOMPLETE')

    const unconfiguredApp = await buildApp({ config, logger: false })
    const unconfigured = await unconfiguredApp.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-unconfigured' }, payload: {} })
    expect(unconfigured.statusCode).toBe(503)
    expect(unconfigured.json().error.code).toBe('AI_NOT_CONFIGURED')
    await unconfiguredApp.close()
  })

  it('AI31-AI35: stale completion records INPUT_CHANGED and never overwrites Content', async () => {
    const auth = await session(email)
    const draft = await createDraft(auth, 'phase6-stale-content')
    fake.blocked = true
    const callsBefore = fake.calls
    const generation = app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-stale' }, payload: {} })
    for (let attempt = 0; attempt < 100 && fake.calls === callsBefore; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const changed = await app.inject({ method: 'PATCH', url: `/api/contents/${draft.json().data.id}`, headers: mutationHeaders(auth, 1), payload: { brief: brief('Changed while generation runs') } })
    expect(changed.statusCode).toBe(200)
    fake.release?.()
    const stale = await generation
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('INPUT_CHANGED')
    const log = await prisma.aiRequestLog.findFirst({ where: { companyId, contentId: draft.json().data.id, inputHash: { not: '' } }, orderBy: { createdAt: 'desc' } })
    expect(log?.status).toBe('stale')
    expect((await app.inject({ method: 'GET', url: `/api/contents/${draft.json().data.id}`, headers: { cookie: auth.cookie } })).json().data.master).toBeNull()
    fake.blocked = false
  })

  it('AI39-AI43: provider failures and timeouts are recorded without partial Content writes', async () => {
    const auth = await session(email)
    const failedDraft = await createDraft(auth, 'phase6-provider-failure')
    fake.outcome = 'failure'
    const failed = await app.inject({ method: 'POST', url: `/api/contents/${failedDraft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-provider-failure' }, payload: {} })
    expect(failed.statusCode).toBe(502)
    expect(failed.json().error.code).toBe('AI_PROVIDER_ERROR')
    expect((await app.inject({ method: 'GET', url: `/api/contents/${failedDraft.json().data.id}`, headers: { cookie: auth.cookie } })).json().data.master).toBeNull()
    expect(await prisma.aiRequestLog.findFirst({ where: { companyId, contentId: failedDraft.json().data.id } })).toMatchObject({ status: 'failed', errorCode: 'AI_PROVIDER_ERROR' })

    const timeoutDraft = await createDraft(auth, 'phase6-provider-timeout')
    fake.outcome = 'timeout'
    const timeout = await app.inject({ method: 'POST', url: `/api/contents/${timeoutDraft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-provider-timeout' }, payload: {} })
    expect(timeout.statusCode).toBe(504)
    expect(timeout.json().error.code).toBe('AI_TIMEOUT')
    expect(await prisma.aiRequestLog.findFirst({ where: { companyId, contentId: timeoutDraft.json().data.id } })).toMatchObject({ status: 'failed', errorCode: 'AI_TIMEOUT' })
    fake.outcome = 'success'
  })

  it('AI32/AI36/AI38/AI50: pending requests do not duplicate provider calls', async () => {
    const auth = await session(email)
    const draft = await createDraft(auth, 'phase6-pending')
    fake.blocked = true
    const callsBefore = fake.calls
    const first = app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-pending' }, payload: {} })
    for (let attempt = 0; attempt < 40 && fake.calls === callsBefore; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const pending = await app.inject({ method: 'POST', url: `/api/contents/${draft.json().data.id}/generate`, headers: { ...mutationHeaders(auth, 1), 'idempotency-key': 'phase6-pending' }, payload: {} })
    expect(pending.statusCode).toBe(409)
    expect(pending.json().error.code).toBe('REQUEST_IN_PROGRESS')
    fake.release?.()
    expect((await first).statusCode).toBe(200)
    fake.blocked = false
  })
})
