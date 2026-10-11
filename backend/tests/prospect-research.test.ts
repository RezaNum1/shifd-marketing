import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { bootstrapOperator } from '../src/modules/auth/bootstrap.js'
import { seedM2Prompt } from '../src/modules/ai/seed.js'
import type { ProspectResearchProvider, ProspectResearchProviderRequest } from '../src/modules/ai/provider.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for prospect research integration tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const origin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl, ALLOWED_ORIGIN: origin, LOGIN_RATE_LIMIT_MAX: '1000' })
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
const suffix = Date.now().toString(); const email = `prospect-research-${suffix}@example.test`; const otherEmail = `prospect-research-other-${suffix}@example.test`
let companyId = ''; let otherCompanyId = ''; let prospectId = ''; let app: Awaited<ReturnType<typeof buildApp>>
const source = { url: 'https://synthetic-logistics.example/about', title: 'About Synthetic Logistics', publisher: 'Synthetic Logistics', publishedAt: null }
const payload = { summary: 'Public company profile summary.', identityStatus: 'matched', identityExplanation: 'The official website and supplied location match.', limitations: ['Public sources may be incomplete.'], claims: [
  { text: 'Synthetic Logistics provides freight coordination services.', category: 'products_services', claimType: 'sourced_fact', sourceUrls: [source.url] },
  { text: 'A distributed logistics business may benefit from shared approval workflows.', category: 'opportunity', claimType: 'sourced_fact', sourceUrls: [] },
  { text: 'Synthetic Logistics has approval problems.', category: 'operations', claimType: 'unsupported', sourceUrls: [] },
] }
class FakeProspectResearchProvider implements ProspectResearchProvider {
  fail = false
  requests: ProspectResearchProviderRequest[] = []
  isConfigured() { return true }
  async researchProspect(request: ProspectResearchProviderRequest) {
    this.requests.push(request)
    if (this.fail) throw new Error('Synthetic provider failure')
    return { text: JSON.stringify(payload), sources: [source], sourceDiagnostics: { webSearchCallCount: 1, actionSourceCount: 1, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 1 }, inputTokens: 21, outputTokens: 34, providerRequestId: 'synthetic-request' }
  }
}
const provider = new FakeProspectResearchProvider()
function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }) { const raw = response.headers['set-cookie']; const first = Array.isArray(raw) ? raw[0] : raw; return typeof first === 'string' ? first.split(';')[0] ?? '' : '' }
async function login(userEmail: string) { const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: userEmail, password: 'correct-password' } }); return { cookie: cookieFrom(response), csrf: response.json().data.csrfToken as string } }
function mutation(auth: { cookie: string; csrf: string }) { return { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrf } }

runIntegration('Source-backed prospect research API', () => {
  let auth: { cookie: string; csrf: string }; let other: { cookie: string; csrf: string }
  beforeAll(async () => {
    await prisma.$connect(); await seedM2Prompt(prisma)
    const primary = await bootstrapOperator(prisma, { companyName: 'Synthetic Prospect Research', companyDescription: 'Synthetic tenant', userName: 'Research User', userEmail: email, userPassword: 'correct-password' })
    if (!primary.created) throw new Error('Research test bootstrap reused a primary identity.')
    companyId = primary.company.id
    const secondary = await bootstrapOperator(prisma, { companyName: 'Synthetic Other Prospect Research', companyDescription: 'Other synthetic tenant', userName: 'Other User', userEmail: otherEmail, userPassword: 'correct-password' })
    if (!secondary.created) throw new Error('Research test bootstrap reused a secondary identity.')
    otherCompanyId = secondary.company.id
    app = await buildApp({ config, logger: false, prospectResearchProvider: provider })
    auth = await login(email); other = await login(otherEmail)
    const created = await app.inject({ method: 'POST', url: '/api/prospects', headers: mutation(auth), payload: { name: 'Synthetic Logistics', website: 'https://synthetic-logistics.example', industry: 'Logistics', address: 'Jakarta, Indonesia' } })
    expect(created.statusCode).toBe(201); prospectId = created.json().data.id
  })
  afterAll(async () => {
    try {
      await app?.close()
      const fixtureCompanyIds = [companyId, otherCompanyId].filter(Boolean)
      if (fixtureCompanyIds.length) {
        // bootstrapOperator provisions three SocialAccount rows per synthetic
        // company. Remove their dependent metric rows before deleting accounts.
        await prisma.publicationMetric.deleteMany({ where: { socialAccount: { companyId: { in: fixtureCompanyIds } } } })
        await prisma.weeklyMetric.deleteMany({ where: { socialAccount: { companyId: { in: fixtureCompanyIds } } } })
        await prisma.inboundInquiryMetric.deleteMany({ where: { socialAccount: { companyId: { in: fixtureCompanyIds } } } })
      }
      if (companyId) {
        const runs = await prisma.prospectResearchRun.findMany({ where: { companyId }, select: { id: true } }); const runIds = runs.map((row) => row.id)
        if (runIds.length) {
          await prisma.prospectResearchClaimSource.deleteMany({ where: { claim: { runId: { in: runIds } } } })
          await prisma.prospectResearchClaim.deleteMany({ where: { runId: { in: runIds } } })
          await prisma.prospectResearchSource.deleteMany({ where: { runId: { in: runIds } } })
        }
        await prisma.prospectResearchRun.deleteMany({ where: { companyId } })
        await prisma.aiRequestLog.deleteMany({ where: { companyId } })
        await prisma.prospect.deleteMany({ where: { companyId } })
      }
      if (fixtureCompanyIds.length) await prisma.socialAccount.deleteMany({ where: { companyId: { in: fixtureCompanyIds } } })
      for (const id of fixtureCompanyIds) {
        await prisma.authSession.deleteMany({ where: { user: { companyId: id } } })
        await prisma.aiSettings.deleteMany({ where: { companyId: id } })
        await prisma.bmcBlock.deleteMany({ where: { companyId: id } })
        await prisma.brandProfile.deleteMany({ where: { companyId: id } })
        await prisma.user.deleteMany({ where: { companyId: id } })
        await prisma.company.delete({ where: { id } })
      }
    } finally {
      await prisma.$disconnect()
    }
  })
  it('authenticates, persists source-linked claims, records review, scopes history, and handles provider errors', async () => {
    const noAuth = await app.inject({ method: 'POST', url: `/api/prospects/${prospectId}/research`, headers: { origin }, payload: {} }); expect(noAuth.statusCode).toBe(401)
    const generated = await app.inject({ method: 'POST', url: `/api/prospects/${prospectId}/research`, headers: mutation(auth), payload: {} })
    expect(generated.statusCode).toBe(201)
    const run = generated.json().data
    expect(run).toMatchObject({ status: 'completed', identityStatus: 'matched', usage: { inputTokens: '21', outputTokens: '34' } })
    expect(run.sources).toHaveLength(1); expect(run.claims).toHaveLength(2)
    const sourced = run.claims.find((claim: { claimType: string }) => claim.claimType === 'sourced_fact')
    expect(sourced.sources).toHaveLength(1); expect(sourced.reviewStatus).toBe('pending')
    expect(provider.requests[0]?.userPrompt).not.toContain('contactEmail')
    const foreign = await app.inject({ method: 'GET', url: `/api/prospects/${prospectId}/research-runs/${run.id}`, headers: { cookie: other.cookie } }); expect(foreign.statusCode).toBe(404)
    const reviewed = await app.inject({ method: 'PUT', url: `/api/prospects/${prospectId}/research-claims/${sourced.id}/review`, headers: mutation(auth), payload: { status: 'rejected', note: 'Not relevant to the target.' } })
    expect(reviewed.statusCode).toBe(200); expect(reviewed.json().data).toMatchObject({ reviewStatus: 'rejected', reviewNote: 'Not relevant to the target.' })
    const detail = await app.inject({ method: 'GET', url: `/api/prospects/${prospectId}/research-runs/${run.id}`, headers: { cookie: auth.cookie } })
    expect(detail.json().data.claims.find((claim: { id: string }) => claim.id === sourced.id).reviewStatus).toBe('rejected')
    expect((await app.inject({ method: 'GET', url: `/api/prospects/${prospectId}/research-runs`, headers: { cookie: auth.cookie } })).json().data).toHaveLength(1)
    provider.fail = true
    const failed = await app.inject({ method: 'POST', url: `/api/prospects/${prospectId}/research`, headers: mutation(auth), payload: {} })
    expect(failed.statusCode).toBe(502)
    expect((await app.inject({ method: 'GET', url: `/api/prospects/${prospectId}/research-runs`, headers: { cookie: auth.cookie } })).json().data[0].status).toBe('failed')
  })
})
