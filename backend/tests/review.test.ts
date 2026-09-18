import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig, type AppConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from '../src/modules/ai/provider.js'

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
const email = `phase9-${suffix}@example.test`
const otherEmail = `phase9-other-${suffix}@example.test`
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let otherCompanyId = ''

const allPassChecks = [
  { label: 'Tone / Brand Voice', status: 'pass' },
  { label: 'Messaging Alignment', status: 'pass' },
  { label: 'Audience Fit', status: 'pass' },
  { label: 'Claim Grounding', status: 'pass' },
  { label: 'CTA Alignment', status: 'pass' },
  { label: 'Company/Product Context Alignment', status: 'pass' },
  { label: 'Platform Appropriateness', status: 'pass' },
] as const
const warningChecks = allPassChecks.map((check, index) => index === 3 ? { ...check, status: 'warning' as const } : check)

class FakeAiProvider implements AiProvider {
  calls = 0
  outcome: 'aligned' | 'warning' | 'failure' = 'aligned'
  isConfigured() { return true }
  reset() { this.calls = 0; this.outcome = 'aligned' }
  async generate(_request: AiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1
    if (this.outcome === 'failure') throw new AiProviderFailure('provider', 'simulated failure')
    return {
      text: JSON.stringify({
        score: this.outcome === 'warning' ? 61 : 94,
        status: this.outcome === 'warning' ? 'needs_attention' : 'aligned',
        recommendation: this.outcome === 'warning' ? 'Clarify this claim before approval.' : 'The variant is aligned with the supplied context.',
        checks: this.outcome === 'warning' ? warningChecks : allPassChecks,
      }),
      inputTokens: 11,
      outputTokens: 17,
      providerRequestId: `fake-review-${this.calls}`,
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

function headers(auth: { cookie: string; csrf: string }, version?: number, key?: string) {
  return {
    origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf,
    ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    ...(key === undefined ? {} : { 'idempotency-key': key }),
  }
}

const master = { title: 'Reviewable master', coreMessage: 'A grounded message.', hook: 'A useful hook.', body: 'A complete body.', cta: 'Take the next step.' }
const direction = { format: 'Carousel', concept: 'A clear visual story.', structure: ['Problem', 'Approach', 'Next step'], notes: 'Use a calm layout.' }
const brief = { contextType: 'company', productId: null, pillarCode: 'educational', objective: 'education', targetAudience: 'Lean startup founders', topic: 'A reviewable topic', angle: null, additionalInstructions: null }

async function createReviewableContent(auth: { cookie: string; csrf: string }, key: string) {
  const created = await app.inject({ method: 'POST', url: '/api/contents', headers: headers(auth, undefined, `${key}-create`), payload: { brief, enabledPlatforms: ['instagram', 'linkedin'] } })
  expect(created.statusCode).toBe(201)
  const id = created.json().data.id as string
  const saved = await app.inject({ method: 'PATCH', url: `/api/contents/${id}`, headers: headers(auth, 1), payload: { master, visualDirection: direction } })
  expect(saved.statusCode).toBe(200)
  await prisma.platformVariant.updateMany({ where: { contentId: id }, data: { copy: 'A complete platform adaptation.', cta: 'Continue the conversation.', hashtags: '#workflow', visualRecommendation: 'Use the supplied visual direction.', adaptedFromMasterRevision: 1 } })
  let current = saved.json().data as { version: number }
  for (const stage of ['adapted', 'creative_in_progress', 'ready_for_review'] as const) {
    const progressed = await app.inject({ method: 'POST', url: `/api/contents/${id}/progress`, headers: headers(auth, current.version), payload: { stage } })
    expect(progressed.statusCode).toBe(200)
    current = progressed.json().data
  }
  for (const platform of ['instagram', 'linkedin'] as const) {
    const checked = await app.inject({ method: 'POST', url: `/api/contents/${id}/brand-check`, headers: headers(auth, current.version, `${key}-${platform}-check`), payload: { platform } })
    expect(checked.statusCode).toBe(200)
    current = checked.json().data.content
  }
  const detail = await app.inject({ method: 'GET', url: `/api/contents/${id}`, headers: { cookie: auth.cookie } })
  return { id, version: detail.json().data.version as number, detail: detail.json().data }
}

async function removeCompany(id: string) {
  if (!id) return
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
  await prisma.content.updateMany({ where: { companyId: id }, data: { currentApprovalId: null } })
  await prisma.approvalAction.deleteMany({ where: { content: { companyId: id } } })
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

runIntegration('Phase 9 Human Review', () => {
  beforeEach(() => fake.reset())

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, aiProvider: fake })
    await seedM2Prompt(app.prisma)
    const primary = await bootstrapOperator(app.prisma, { companyName: 'Phase 9 Company', companyDescription: 'Human review test company', userName: 'Phase 9 Founder', userEmail: email, userPassword: 'correct-password' })
    const other = await bootstrapOperator(app.prisma, { companyName: 'Phase 9 Other', companyDescription: 'Other test company', userName: 'Other Founder', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!primary.created || !other.created) throw new Error('Phase 9 test bootstrap unexpectedly reused a user.')
    companyId = primary.company.id
    otherCompanyId = other.company.id
    const auth = await session(email)
    const company = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: auth.cookie } })
    const payload = company.json().data
    const saved = await app.inject({ method: 'PUT', url: '/api/company', headers: headers(auth, payload.contextVersion), payload: {
      profile: { ...payload.profile, name: 'Phase 9 Company', description: 'Human review test company' },
      brand: { ...payload.brand, brandVoice: 'Direct and thoughtful', ctaStyle: 'Invite a useful next step' },
      bmcBlocks: payload.bmcBlocks.map((block: { type: string }) => ({ type: block.type, entries: [`${block.type} evidence`] })),
    } })
    expect(saved.statusCode).toBe(200)
  })

  afterAll(async () => {
    await app?.close()
    await removeCompany(companyId)
    await removeCompany(otherCompanyId)
    await prisma.$disconnect()
  })

  it('R901-R910/R911-R915/R933-R943: records warning overrides and final approval evidence', async () => {
    const auth = await session(email)
    const content = await createReviewableContent(auth, 'review-approval')
    fake.outcome = 'warning'
    const warning = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/brand-check`, headers: headers(auth, content.version, 'review-warning'), payload: { platform: 'instagram' } })
    expect(warning.statusCode).toBe(200)
    const warningData = warning.json().data
    const target = warningData.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram')
    const override = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/override`, headers: headers(auth, warningData.content.version, 'review-override'), payload: { platform: 'instagram', assessmentId: target.assessment.id, justification: 'I reviewed and accept this grounded qualification.' } })
    expect(override.statusCode).toBe(201)
    expect(override.json().data).toMatchObject({ action: { action: 'override', variantId: target.id, assessmentId: target.assessment.id }, content: { approval: null } })
    const beforeApproval = override.json().data.content
    const approved = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/approve`, headers: headers(auth, beforeApproval.version, 'review-approve'), payload: { checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true } } })
    expect(approved.statusCode).toBe(201)
    const data = approved.json().data
    expect(data.action).toMatchObject({ action: 'approve', editorialRevision: beforeApproval.editorialRevision, checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true } })
    expect(data.action.reviewedVariants).toHaveLength(2)
    expect(data.content).toMatchObject({ lifecycleStatus: 'Approved', resumeStep: 'schedule', editorialStage: 'ready_for_review', editorialRevision: beforeApproval.editorialRevision, version: beforeApproval.version + 1 })
    expect(data.content.variants).toEqual(beforeApproval.variants)
    expect(await prisma.approvalAction.count({ where: { contentId: content.id } })).toBe(2)
    expect(await prisma.contentEvent.count({ where: { contentId: content.id, eventType: 'content_approved' } })).toBe(1)
    const actions = await app.inject({ method: 'GET', url: `/api/contents/${content.id}/review-actions`, headers: { cookie: auth.cookie } })
    expect(actions.statusCode).toBe(200)
    expect(actions.json().data.map((action: { action: string }) => action.action)).toEqual(['approve', 'override'])
  })

  it('R916-R952/R967: approval is protected by the checklist, D-03 and the reviewed write gate', async () => {
    const auth = await session(email)
    const content = await createReviewableContent(auth, 'review-lock')
    const approved = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/approve`, headers: headers(auth, content.version, 'review-lock-approve'), payload: { checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true } } })
    expect(approved.statusCode).toBe(201)
    const approvedData = approved.json().data.content
    expect(approvedData.lifecycleStatus).toBe('Approved')
    const lockedPatch = await app.inject({ method: 'PATCH', url: `/api/contents/${content.id}`, headers: headers(auth, approvedData.version), payload: { master: { ...master, body: 'Attempted reviewed edit.' } } })
    expect(lockedPatch.statusCode).toBe(409)
    expect(lockedPatch.json().error.code).toBe('REVIEW_LOCKED')
    const lockedProgress = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/progress`, headers: headers(auth, approvedData.version), payload: { stage: 'adapted' } })
    expect(lockedProgress.statusCode).toBe(409)
    const requested = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: headers(auth, approvedData.version, 'review-request-revision'), payload: { reason: 'Founder requested a new editorial pass.' } })
    expect(requested.statusCode).toBe(201)
    expect(requested.json().data.content).toMatchObject({ lifecycleStatus: 'Needs Revision', approval: null, editorialStage: 'needs_revision', editorialRevision: approvedData.editorialRevision, version: approvedData.version + 1 })
    const editable = await app.inject({ method: 'PATCH', url: `/api/contents/${content.id}`, headers: headers(auth, requested.json().data.content.version), payload: { master: { ...master, body: 'Edited after explicit request.' } } })
    expect(editable.statusCode).toBe(200)
    expect(editable.json().data.editorialRevision).toBe(approvedData.editorialRevision + 1)
    const history = await app.inject({ method: 'GET', url: `/api/contents/${content.id}/review-actions`, headers: { cookie: auth.cookie } })
    expect(history.json().data.map((action: { action: string }) => action.action)).toEqual(['request_revision', 'approve'])
  })

  it('R920-R932/R954-R968: rejects invalid approval inputs and keeps review advisory', async () => {
    const auth = await session(email)
    const content = await createReviewableContent(auth, 'review-validation')
    const missing = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/approve`, headers: headers(auth, content.version, 'review-missing-checklist'), payload: { checklist: { copyReviewed: true } } })
    expect(missing.statusCode).toBe(422)
    const falseValue = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/approve`, headers: headers(auth, content.version, 'review-false-checklist'), payload: { checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: false } } })
    expect(falseValue.statusCode).toBe(422)
    const aligned = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/brand-check`, headers: headers(auth, content.version, 'review-aligned'), payload: { platform: 'instagram' } })
    expect(aligned.statusCode).toBe(200)
    const assessmentId = aligned.json().data.content.variants.find((variant: { platform: string }) => variant.platform === 'instagram').assessment.id
    const invalidOverride = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/override`, headers: headers(auth, aligned.json().data.content.version, 'review-aligned-override'), payload: { platform: 'instagram', assessmentId, justification: 'This must not override aligned evidence.' } })
    expect(invalidOverride.statusCode).toBe(409)
    expect(invalidOverride.json().error.code).toBe('STATE_CONFLICT')

    // The normal design-status write regresses the editorial stage to Draft.
    // Set this fixture's stored design gate directly so the approval test can
    // isolate D-03 from the separate stage-transition command.
    await prisma.content.update({ where: { id: content.id }, data: { designStatus: 'ready' } })
    const blocked = await app.inject({ method: 'POST', url: `/api/contents/${content.id}/approve`, headers: headers(auth, aligned.json().data.content.version, 'review-assets-required'), payload: { checklist: { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true } } })
    expect(blocked.statusCode).toBe(422)
    expect(blocked.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('R903-R919/R955-R956/R968: review commands enforce auth boundaries and company scope', async () => {
    const auth = await session(email)
    const other = await session(otherEmail)
    const content = await createReviewableContent(auth, 'review-auth')
    expect((await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: { origin }, payload: { reason: 'no session' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: { cookie: auth.cookie }, payload: { reason: 'no origin' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: { origin, cookie: auth.cookie, 'if-match': `"${content.version}"`, 'idempotency-key': 'no-csrf' }, payload: { reason: 'no csrf' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: headers(auth, undefined, 'no-etag'), payload: { reason: 'no etag' } })).statusCode).toBe(428)
    expect((await app.inject({ method: 'POST', url: `/api/contents/${content.id}/request-revision`, headers: { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'if-match': `"${content.version}"` }, payload: { reason: 'no key' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `/api/contents/${content.id}/review-actions`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
  })
})
