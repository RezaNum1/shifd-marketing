import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import type { TopicDiscoveryProvider, TopicDiscoveryProviderRequest } from '../src/modules/ai/provider.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for topic discovery tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config = loadConfig({ NODE_ENV: 'test', PORT: '3000', HOST: '127.0.0.1', DATABASE_URL: testDatabaseUrl, ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000' })
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString()
const email = `topic-discovery-${suffix}@example.test`
let app: Awaited<ReturnType<typeof buildApp>>
let companyId = ''
let productId = ''

class FakeDiscoveryProvider implements TopicDiscoveryProvider {
  calls = 0
  requests: TopicDiscoveryProviderRequest[] = []
  isConfigured() { return true }
  async discoverTopics(request: TopicDiscoveryProviderRequest) {
    this.calls += 1
    this.requests.push(request)
    const source = { url: 'https://example.com/current-approval', title: 'Current approval source', publisher: 'Example', publishedAt: '2026-09-19' }
    return { text: JSON.stringify({ topics: [{ title: 'Current approval workflow discussion', summary: 'A current operational discussion.', whyCurrent: 'The source was published in the requested window.', relevanceToCompany: 'It maps to approval operations.', contentAngle: 'Explain the operational question for teams.', suggestedObjective: 'education', suggestedPlatforms: ['linkedin'], sources: [{ url: source.url, title: source.title, publisher: source.publisher, publishedAt: source.publishedAt }] }] }), sources: [source], sourceDiagnostics: { webSearchCallCount: 1, actionSourceCount: 1, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 1 }, inputTokens: 10, outputTokens: 20, providerRequestId: 'fake-discovery' }
  }
}

const fake = new FakeDiscoveryProvider()

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) {
  const value = response.headers['set-cookie']
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.split(';')[0] ?? '' : ''
}

async function auth() {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'correct-password' } })
  return { cookie: cookieFrom(response), csrf: response.json().data.csrfToken as string }
}

function mutationHeaders(session: { cookie: string; csrf: string }, key: string, version?: number) {
  return { origin, cookie: session.cookie, 'x-csrf-token': session.csrf, 'idempotency-key': key, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) }
}

function companyPayload() {
  return {
    profile: {
      name: 'Discovery Company', description: 'Workflow software for Indonesian business teams.', industry: 'Software', businessTypes: ['B2B'], primaryMarket: 'Indonesia', website: 'https://discovery.example.com', mission: 'Make operations clearer.', vision: 'Clearer work.', positioning: 'Practical workflow software.', coreValueProposition: 'Make decisions easier to follow.', differentiators: ['Focused workflow'], customerSegments: ['Operations teams'], decisionMakers: ['Operations leads'], painPoints: ['Manual approvals'],
    },
    brand: { brandVoice: 'Clear and practical', toneDescription: 'Calm.', preferredLanguage: 'English', communicationGuidelines: ['Be precise'], preferredTerms: ['workflow'], thingsToAvoid: ['Hype'], ctaStyle: 'Invite a useful next step', brandKeywords: ['clarity'] },
    bmcBlocks: ['key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams'].map((type) => ({ type, entries: [`${type} evidence`] })),
  }
}

async function cleanupCompany(id: string) {
  if (!id) return
  await prisma.publicationMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: id } } })
  await prisma.socialAccount.deleteMany({ where: { companyId: id } })
  await prisma.topicCandidate.deleteMany({ where: { companyId: id } })
  await prisma.topicDiscoveryRun.deleteMany({ where: { companyId: id } })
  await prisma.requestIdempotency.deleteMany({ where: { companyId: id } })
  await prisma.aiRequestLog.deleteMany({ where: { companyId: id } })
  await prisma.productProfile.deleteMany({ where: { product: { companyId: id } } })
  await prisma.product.deleteMany({ where: { companyId: id } })
  await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
  await prisma.aiSettings.deleteMany({ where: { companyId: id } })
  await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
  await prisma.brandProfile.deleteMany({ where: { companyId: id } })
  await prisma.user.deleteMany({ where: { companyId: id } })
  await prisma.company.delete({ where: { id } })
}

runIntegration('Current Topic Discovery context boundary', () => {
  let session: { cookie: string; csrf: string }

  beforeAll(async () => {
    await prisma.$connect()
    app = await buildApp({ config, logger: false, discoveryProvider: fake })
    await seedM2Prompt(app.prisma)
    const created = await bootstrapOperator(app.prisma, { companyName: 'Discovery Company', companyDescription: 'Initial company', userName: 'Discovery Founder', userEmail: email, userPassword: 'correct-password' })
    if (!created.created) throw new Error('Topic discovery test bootstrap unexpectedly reused a user.')
    companyId = created.company.id
    session = await auth()
    const current = await app.inject({ method: 'GET', url: '/api/company', headers: { cookie: session.cookie } })
    await app.inject({ method: 'PUT', url: '/api/company', headers: mutationHeaders(session, 'company-context-update', current.json().data.contextVersion), payload: companyPayload() })
  })

  afterAll(async () => {
    await app?.close()
    await cleanupCompany(companyId)
    await prisma.$disconnect()
  })

  it('supports company-only discovery without any Content record', async () => {
    const before = await prisma.content.count({ where: { companyId } })
    const response = await app.inject({ method: 'POST', url: '/api/ideas/discover', headers: mutationHeaders(session, 'company-only-discovery'), payload: { productId: null, market: 'ID', timeframe: 'last_7_days', focus: 'workflow efficiency' } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.candidates).toHaveLength(1)
    expect(await prisma.content.count({ where: { companyId } })).toBe(before)
    expect(fake.requests[0]?.maxOutputTokens).toBe(config.topicDiscoveryMaxOutputTokens)
    expect(config.aiMaxOutputTokens).toBe(2_048)
  })

  it('supports Product discovery without any Content record and verifies Product ownership through context loading', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/products', headers: mutationHeaders(session, 'topic-product-create'), payload: { name: 'Shifd Approval', description: 'Digital approval workflow.', category: 'Workflow', status: 'active', url: null } })
    productId = created.json().data.id as string
    const updated = await app.inject({ method: 'PUT', url: `/api/products/${productId}`, headers: mutationHeaders(session, 'topic-product-update', created.json().data.version), payload: { product: { name: 'Shifd Approval', description: 'Digital approval workflow.', category: 'Workflow', status: 'active', url: null }, profile: { targetUsers: ['Administrators'], targetOrganizations: ['Businesses'], decisionMakers: ['Operations leads'], problemsAddressed: ['Manual approvals'], valueProposition: 'Make approval work easier to follow.', features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: 'education', positioning: null, keyMessages: [], proofPoints: [], defaultCta: null, inheritCompanyTone: true, toneOverride: null } } })
    expect(updated.statusCode).toBe(200)
    const before = await prisma.content.count({ where: { companyId } })
    const response = await app.inject({ method: 'POST', url: '/api/ideas/discover', headers: mutationHeaders(session, 'product-discovery'), payload: { productId, market: 'ID', timeframe: 'last_30_days', focus: null } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.productId).toBe(productId)
    expect(await prisma.content.count({ where: { companyId } })).toBe(before)
  })

  it('returns discovery-specific errors for incomplete Company and Product Context', async () => {
    const incomplete = await bootstrapOperator(app.prisma, { companyName: 'Incomplete Discovery Company', companyDescription: 'Only a name and description.', userName: 'Incomplete Founder', userEmail: `incomplete-${suffix}@example.test`, userPassword: 'correct-password' })
    if (!incomplete.created) throw new Error('Incomplete topic discovery test bootstrap unexpectedly reused a user.')
    const incompleteSessionResponse = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: `incomplete-${suffix}@example.test`, password: 'correct-password' } })
    const incompleteSession = { cookie: cookieFrom(incompleteSessionResponse), csrf: incompleteSessionResponse.json().data.csrfToken as string }
    const companyResponse = await app.inject({ method: 'POST', url: '/api/ideas/discover', headers: mutationHeaders(incompleteSession, 'incomplete-company-discovery'), payload: { productId: null, market: 'ID', timeframe: 'last_7_days', focus: null } })
    expect(companyResponse.statusCode).toBe(422)
    expect(companyResponse.json().error).toMatchObject({ code: 'DISCOVERY_COMPANY_CONTEXT_INCOMPLETE', message: 'Complete the Company Context before discovering topics.' })
    expect(companyResponse.json().error.message).not.toContain('Content Context')
    await cleanupCompany(incomplete.company.id)
  })
})
