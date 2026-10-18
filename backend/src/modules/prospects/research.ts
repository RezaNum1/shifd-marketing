import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import { AppError, aiNotConfigured, aiOutputInvalid, conflict, notFound } from '../../shared/errors/AppError.js'
import { requestHash } from '../context/normalize.js'
import { AI_MODEL_ID, AI_PROVIDER, PROSPECT_RESEARCH_OPERATION, PROSPECT_RESEARCH_SCHEMA_VERSION } from '../ai/constants.js'
import { PROSPECT_RESEARCH_SYSTEM_PROMPT, renderProspectResearchPrompt } from '../ai/prospect-research-prompt.js'
import { ensureProspectResearchPrompt } from '../ai/seed.js'
import { mapProviderFailure } from '../ai/service.js'
import type { ProspectResearchProvider, ProspectResearchProviderResult, TopicDiscoverySource } from '../ai/provider.js'
import { aiExecution } from '../ai/provider.js'

const categories = ['overview', 'industry', 'products_services', 'operations', 'market_segments', 'development', 'opportunity'] as const
export type ResearchCategory = typeof categories[number]
export type ResearchClaimType = 'sourced_fact' | 'hypothesis'
export type ResearchReviewStatus = 'approved' | 'rejected'

export function parseResearchResult(text: string, providerSources: TopicDiscoverySource[], officialWebsite: string | null, retrievedAt = new Date()) {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw aiOutputInvalid() }
  if (!record(parsed) || !nonBlank(parsed.summary) || !['matched', 'needs_confirmation'].includes(String(parsed.identityStatus)) || !nonBlank(parsed.identityExplanation) || !Array.isArray(parsed.claims) || !Array.isArray(parsed.limitations)) throw aiOutputInvalid()
  const sources = new Map<string, { url: string; title: string; publisher: string | null; domain: string; sourceType: 'official' | 'external'; retrievedAt: Date }>()
  for (const source of providerSources.slice(0, 30)) {
    const url = canonicalPublicUrl(source.url)
    if (!url) continue
    const parsedUrl = new URL(url)
    const normalized = { url, title: bounded(source.title, 500) ?? url, publisher: bounded(source.publisher, 240), domain: parsedUrl.hostname.toLowerCase(), sourceType: sourceType(parsedUrl.hostname, officialWebsite), retrievedAt }
    if (!sources.has(url)) sources.set(url, normalized)
  }
  const claims: Array<{ text: string; category: ResearchCategory; claimType: ResearchClaimType; sources: string[] }> = []
  for (const raw of parsed.claims.slice(0, 16)) {
    if (!record(raw) || !nonBlank(raw.text) || raw.text.length > 1200 || !categories.includes(raw.category as ResearchCategory)) continue
    if (raw.claimType === 'unsupported') continue
    if (raw.claimType !== 'sourced_fact' && raw.claimType !== 'hypothesis') continue
    const claimType = raw.category === 'opportunity' ? 'hypothesis' : raw.claimType
    if (parsed.identityStatus === 'needs_confirmation' && claimType === 'sourced_fact') continue
    const linked = Array.isArray(raw.sourceUrls) ? [...new Set(raw.sourceUrls.flatMap((u) => typeof u === 'string' && sources.has(canonicalPublicUrl(u)) ? [canonicalPublicUrl(u)] : []))] : []
    if (claimType === 'sourced_fact' && linked.length === 0) continue
    claims.push({ text: raw.text.trim(), category: raw.category as ResearchCategory, claimType, sources: linked })
  }
  const limitations = parsed.limitations.flatMap((item) => nonBlank(item) && item.length <= 500 ? [item.trim()] : []).slice(0, 8)
  const sourcedSummary = claims.filter((claim) => claim.claimType === 'sourced_fact').slice(0, 4).map((claim) => claim.text).join(' ')
  return { summary: sourcedSummary || 'No source-backed company facts could be validated in this run.', identityStatus: parsed.identityStatus as 'matched' | 'needs_confirmation', identityExplanation: parsed.identityExplanation.trim().slice(0, 1200), limitations, sources: [...sources.values()], claims }
}

export function canonicalPublicUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return ''
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal' || host === '169.254.169.254' || /^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.includes(':')) return ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch { return '' }
}

export async function researchProspect(prisma: PrismaClient, config: AppConfig, provider: ProspectResearchProvider, companyId: string, actorId: string, prospectId: string) {
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId, archivedAt: null } })
  if (!prospect) throw notFound('Prospect not found.')
  const pending = await prisma.prospectResearchRun.findFirst({ where: { companyId, prospectId, status: 'pending' }, select: { id: true } })
  if (pending) throw conflict('Research is already running for this prospect.')
  const prompt = await ensureProspectResearchPrompt(prisma)
  const settings = await prisma.aiSettings.findUnique({ where: { companyId }, select: { modelId: true } })
  const runtime = aiExecution(provider, settings?.modelId ?? config.openaiModel ?? AI_MODEL_ID)
  const model = runtime.model
  if (provider.isConfigured && !provider.isConfigured(model)) throw aiNotConfigured()
  const researchedAt = new Date()
  const identityContext = { name: prospect.name, website: prospect.website, industry: prospect.industry, location: prospect.address }
  const snapshot = { prospect: identityContext, ai: { module: 'M2', operation: PROSPECT_RESEARCH_OPERATION, model, promptVersionId: prompt.id, outputSchemaVersion: PROSPECT_RESEARCH_SCHEMA_VERSION }, researchedAt: researchedAt.toISOString() }
  const logId = randomUUID(); const runId = randomUUID()
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "prospects" WHERE "id" = CAST(${prospectId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID) FOR UPDATE`
    const concurrent = await tx.prospectResearchRun.findFirst({ where: { companyId, prospectId, status: 'pending' }, select: { id: true } })
    if (concurrent) throw conflict('Research is already running for this prospect.')
    await tx.aiRequestLog.create({ data: { id: logId, companyId, requestedBy: actorId, promptVersionId: prompt.id, module: 'M2', operation: PROSPECT_RESEARCH_OPERATION, provider: runtime.provider, model, mode: runtime.mode, language: 'English', inputHash: requestHash(snapshot), inputSnapshot: toJson(snapshot), status: 'pending' } })
    await tx.prospectResearchRun.create({ data: { id: runId, companyId, prospectId, createdBy: actorId, aiRequestLogId: logId, promptVersionId: prompt.id, status: 'pending', identityStatus: 'needs_confirmation', identityExplanation: 'Research is in progress.', summary: '', limitations: [], researchedAt } })
  })
  const startedAt = Date.now()
  let result: ProspectResearchProviderResult | null = null
  try {
    const providerResult = await provider.researchProspect({ model, systemPrompt: PROSPECT_RESEARCH_SYSTEM_PROMPT, userPrompt: renderProspectResearchPrompt(identityContext), maxOutputTokens: Math.min(config.topicDiscoveryMaxOutputTokens, 4096), timeoutMs: config.aiRequestTimeoutMs })
    result = providerResult
    const normalized = parseResearchResult(providerResult.text, providerResult.sources, prospect.website, researchedAt)
    await persistSuccessfulResearch(prisma, runId, logId, normalized, providerResult, Date.now() - startedAt)
  } catch (error) {
    const failure = error instanceof AppError ? error : mapProviderFailure(error)
    await Promise.all([
      prisma.prospectResearchRun.update({ where: { id: runId }, data: { status: 'failed', identityExplanation: failure.message } }),
      prisma.aiRequestLog.update({ where: { id: logId }, data: { status: 'failed', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: result?.inputTokens ?? null, outputTokens: result?.outputTokens ?? null, providerRequestId: result?.providerRequestId ?? null, errorCode: failure.code, errorMessage: failure.message } }),
    ])
    throw failure
  }
  return readResearchRun(prisma, companyId, runId)
}

async function persistSuccessfulResearch(prisma: PrismaClient, runId: string, logId: string, data: ReturnType<typeof parseResearchResult>, providerResult: ProspectResearchProviderResult, latencyMs: number) {
  await prisma.$transaction(async (tx) => {
    const sourceIds = new Map<string, string>()
    for (const source of data.sources) {
      const id = randomUUID(); sourceIds.set(source.url, id)
      await tx.prospectResearchSource.create({ data: { id, runId, url: source.url, title: source.title, publisher: source.publisher, domain: source.domain, retrievedAt: source.retrievedAt, sourceType: source.sourceType, availability: 'retrieved' } })
    }
    for (const claim of data.claims) {
      const id = randomUUID()
      await tx.prospectResearchClaim.create({ data: { id, runId, text: claim.text, category: claim.category, claimType: claim.claimType, reviewStatus: 'pending', sources: { create: claim.sources.flatMap((url) => sourceIds.has(url) ? [{ source: { connect: { id: sourceIds.get(url)! } } }] : []) } } })
    }
    await tx.prospectResearchRun.update({ where: { id: runId }, data: { status: data.identityStatus === 'needs_confirmation' ? 'needs_confirmation' : data.claims.length ? 'completed' : 'empty', identityStatus: data.identityStatus, identityExplanation: data.identityExplanation, summary: data.summary, limitations: data.limitations } })
    await tx.aiRequestLog.update({ where: { id: logId }, data: { status: 'success', completedAt: new Date(), latencyMs, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens, providerRequestId: providerResult.providerRequestId } })
  })
}

export async function readResearchRun(prisma: PrismaClient, companyId: string, runId: string) {
  const run = await prisma.prospectResearchRun.findFirst({ where: { id: runId, companyId }, include: { sources: { orderBy: { domain: 'asc' } }, claims: { include: { sources: { include: { source: true } } }, orderBy: { createdAt: 'asc' } }, aiRequestLog: { select: { model: true, provider: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true } } } })
  if (!run) throw notFound('Research run not found.')
  return mapRun(run)
}

export async function listResearchRuns(prisma: PrismaClient, companyId: string, prospectId: string) {
  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { id: true } })
  if (!prospect) throw notFound('Prospect not found.')
  const runs = await prisma.prospectResearchRun.findMany({ where: { companyId, prospectId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, select: { id: true, status: true, identityStatus: true, summary: true, researchedAt: true, createdAt: true } })
  return runs.map((run) => ({ ...run, summary: run.summary.slice(0, 400), researchedAt: run.researchedAt.toISOString(), createdAt: run.createdAt.toISOString() }))
}

export async function reviewResearchClaim(prisma: PrismaClient, companyId: string, prospectId: string, actorId: string, claimId: string, status: ResearchReviewStatus, note: string | null) {
  const claim = await prisma.prospectResearchClaim.findFirst({ where: { id: claimId, run: { companyId, prospectId } }, select: { id: true } })
  if (!claim) throw notFound('Research claim not found.')
  const now = new Date()
  await prisma.prospectResearchClaim.update({ where: { id: claim.id }, data: { reviewStatus: status, reviewNote: note, reviewedAt: now, reviewedBy: actorId } })
  return { id: claim.id, reviewStatus: status, reviewNote: note, reviewedAt: now.toISOString(), reviewedBy: actorId }
}

function mapRun(run: any) {
  return { id: run.id, prospectId: run.prospectId, status: run.status, identityStatus: run.identityStatus, identityExplanation: run.identityExplanation, summary: run.summary, limitations: run.limitations, researchedAt: run.researchedAt.toISOString(), createdAt: run.createdAt.toISOString(), provider: run.aiRequestLog.provider, model: run.aiRequestLog.model, usage: { inputTokens: run.aiRequestLog.inputTokens?.toString() ?? null, outputTokens: run.aiRequestLog.outputTokens?.toString() ?? null, estimatedCostUsd: run.aiRequestLog.estimatedCostUsd?.toString() ?? null }, sources: run.sources.map((source: any) => ({ id: source.id, title: source.title, publisher: source.publisher, domain: source.domain, url: source.url, retrievedAt: source.retrievedAt.toISOString(), sourceType: source.sourceType, availability: source.availability })), claims: run.claims.map((claim: any) => ({ id: claim.id, text: claim.text, category: claim.category, claimType: claim.claimType, reviewStatus: claim.reviewStatus, reviewNote: claim.reviewNote, reviewedAt: claim.reviewedAt?.toISOString() ?? null, reviewedBy: claim.reviewedBy, sources: claim.sources.map((link: any) => ({ id: link.source.id, title: link.source.title, domain: link.source.domain, url: link.source.url })) })) }
}
function sourceType(host: string, website: string | null): 'official' | 'external' {
  if (!website) return 'external'
  try { const target = new URL(website).hostname.toLowerCase().replace(/^www\./, ''); const candidate = host.toLowerCase().replace(/^www\./, ''); return candidate === target || candidate.endsWith(`.${target}`) ? 'official' : 'external' } catch { return 'external' }
}
function bounded(value: unknown, max: number) { return nonBlank(value) ? value.trim().slice(0, max) : null }
function nonBlank(value: unknown): value is string { return typeof value === 'string' && !!value.trim() }
function record(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function toJson(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
