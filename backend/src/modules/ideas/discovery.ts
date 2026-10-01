import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import { aiNotConfigured, aiOutputInvalid, AppError, conflict, discoveryCompanyContextIncomplete, discoveryProductContextIncomplete, discoveryPromptUnavailable, notFound } from '../../shared/errors/AppError.js'
import { requestHash } from '../context/normalize.js'
import { readResolvedContextFromDb } from '../context/service.js'
import { companyTopicDiscoveryReadiness, productTopicDiscoveryReadiness } from '../context/readiness.js'
import { createIdeaInTransaction, readIdea, type IdeaInput } from '../content/service.js'
import { executeIdempotent } from '../content/idempotency.js'
import { AI_MODEL_ID, AI_PROVIDER, M2_DISCOVERY_OPERATION, M2_DISCOVERY_OUTPUT_SCHEMA_VERSION } from '../ai/constants.js'
import { M2_DISCOVERY_SYSTEM_PROMPT, renderM2DiscoveryPrompt } from '../ai/discovery-prompt.js'
import { mapProviderFailure } from '../ai/service.js'
import type { TopicDiscoveryProvider, TopicDiscoveryProviderResult, TopicDiscoverySource } from '../ai/provider.js'

type Db = PrismaClient | Prisma.TransactionClient
export type DiscoveryTimeframe = 'last_7_days' | 'last_30_days'
export type DiscoveryMarket = 'ID'

export interface TopicDiscoveryInput {
  productId: string | null
  market: DiscoveryMarket
  timeframe: DiscoveryTimeframe
  focus: string | null
}

export type TopicDiscoveryRejectionReason = 'invalidCandidateShape' | 'missingRequiredText' | 'invalidObjective' | 'invalidPlatform' | 'duplicatePlatform' | 'invalidSourceUrl' | 'noValidatedSource'

export interface TopicDiscoveryValidationDiagnostics {
  webSearchCallCount: number
  actionSourceCount: number
  citationAnnotationCount: number
  deduplicatedProviderSourceCount: number
  providerStructuredTopicCount: number
  providerSourceCount: number
  validatedTopicCount: number
  rejected: Record<TopicDiscoveryRejectionReason, number>
}

interface ValidatedTopic {
  title: string
  summary: string
  whyCurrent: string
  relevanceToCompany: string
  contentAngle: string
  suggestedObjective: IdeaInput['objective']
  suggestedPlatforms: Array<'instagram' | 'linkedin'>
  sources: Array<{ url: string; title: string; publisher: string | null; publishedAt: string | null; observedAt: string }>
}

export async function discoverTopics(
  prisma: PrismaClient,
  config: AppConfig,
  provider: TopicDiscoveryProvider,
  companyId: string,
  actorId: string,
  input: TopicDiscoveryInput,
  idempotencyKey: string,
  diagnosticsLogger?: (diagnostics: TopicDiscoveryValidationDiagnostics) => void,
) {
  const normalized = { companyId, actorId, input }
  const hash = requestHash(normalized)
  const existing = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation: M2_DISCOVERY_OPERATION, key: idempotencyKey } } })
  if (existing) return resolveExistingDiscovery(prisma, existing, hash)

  const prepared = await prisma.$transaction(async (tx) => {
    const resolved = await readResolvedContextFromDb(tx, companyId, input.productId ?? undefined)
    const companyReady = companyTopicDiscoveryReadiness({
      description: resolved.company.profile.description,
      customerSegments: resolved.company.profile.customerSegments,
      decisionMakers: resolved.company.profile.decisionMakers,
      painPoints: resolved.company.profile.painPoints,
    })
    if (!companyReady.ready) throw discoveryCompanyContextIncomplete(companyReady.missing)
    if (input.productId && resolved.product) {
      const productReady = productTopicDiscoveryReadiness({
        name: resolved.product.name,
        description: resolved.product.description,
        targetUsers: resolved.product.profile.targetUsers,
        targetOrganizations: resolved.product.profile.targetOrganizations,
        problemsAddressed: resolved.product.profile.problemsAddressed,
        valueProposition: resolved.product.profile.valueProposition,
      })
      if (!productReady.ready) throw discoveryProductContextIncomplete(productReady.missing)
    }
    const prompt = await tx.promptVersion.findFirst({ where: { module: 'M2', operation: M2_DISCOVERY_OPERATION, status: 'active' } })
    if (!prompt) throw discoveryPromptUnavailable()
    const settings = await tx.aiSettings.findUnique({ where: { companyId }, select: { modelId: true, generationLanguage: true } })
    const model = settings?.modelId ?? config.openaiModel ?? AI_MODEL_ID
    if (provider.isConfigured && !provider.isConfigured(model)) throw aiNotConfigured()
    const searchedAt = new Date()
    const snapshot = buildSnapshot(input, resolved, searchedAt, prompt.id, model, settings?.generationLanguage ?? resolved.company.brand.preferredLanguage)
    const aiRequestId = randomUUID()
    const runId = randomUUID()
    await tx.aiRequestLog.create({
      data: {
        id: aiRequestId,
        companyId,
        contentId: null,
        variantId: null,
        requestedBy: actorId,
        promptVersionId: prompt.id,
        module: 'M2',
        operation: M2_DISCOVERY_OPERATION,
        provider: AI_PROVIDER,
        model,
        mode: 'real',
        language: settings?.generationLanguage ?? resolved.company.brand.preferredLanguage,
        editorialRevision: null,
        variantRevision: null,
        inputHash: requestHash(snapshot),
        inputSnapshot: toJson(snapshot),
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        costBasis: Prisma.DbNull,
        latencyMs: null,
        status: 'pending',
        errorCode: null,
        errorMessage: null,
        providerRequestId: null,
      },
    })
    await tx.topicDiscoveryRun.create({ data: { id: runId, companyId, productId: input.productId, market: input.market, timeframe: input.timeframe, focus: input.focus, status: 'pending', aiRequestLogId: aiRequestId, searchedAt } })
    await tx.requestIdempotency.create({
      data: {
        companyId,
        operation: M2_DISCOVERY_OPERATION,
        key: idempotencyKey,
        requestHash: hash,
        responseStatus: 202,
        responseBody: {},
        resourceId: runId,
        responseEtag: null,
        aiRequestId,
      },
    })
    return { runId, aiRequestId, model, userPrompt: renderM2DiscoveryPrompt({ request: snapshot.request, company: snapshot.company, product: snapshot.product }), searchedAt }
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error)) throw conflict('A discovery request with this idempotency key is already running.')
    throw error
  })

  const startedAt = Date.now()
  let providerResult: TopicDiscoveryProviderResult
  try {
    providerResult = await provider.discoverTopics({ model: prepared.model, systemPrompt: M2_DISCOVERY_SYSTEM_PROMPT, userPrompt: prepared.userPrompt, maxOutputTokens: config.topicDiscoveryMaxOutputTokens, timeoutMs: config.aiRequestTimeoutMs })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await finalizeDiscoveryFailure(prisma, prepared.runId, prepared.aiRequestId, failure, Date.now() - startedAt, error)
    throw failure
  }

  let topics: ValidatedTopic[]
  try {
    const validation = parseAndValidateTopicsWithDiagnostics(providerResult.text, providerResult.sources, prepared.searchedAt)
    topics = validation.topics
    if (config.nodeEnv === 'development') diagnosticsLogger?.({ ...validation.diagnostics, ...providerResult.sourceDiagnostics })
  } catch (error) {
    const failure = error instanceof AppError ? error : aiOutputInvalid()
    await finalizeDiscoveryFailure(prisma, prepared.runId, prepared.aiRequestId, failure, Date.now() - startedAt, providerResult)
    throw failure
  }

  return prisma.$transaction(async (tx) => {
    const run = await tx.topicDiscoveryRun.findFirst({ where: { id: prepared.runId, companyId }, select: { id: true } })
    if (!run) throw notFound()
    if (topics.length) {
      await tx.topicCandidate.createMany({ data: topics.map((topic, index) => ({ runId: prepared.runId, companyId, productId: input.productId, position: index + 1, title: topic.title, summary: topic.summary, whyCurrent: topic.whyCurrent, relevanceToCompany: topic.relevanceToCompany, contentAngle: topic.contentAngle, suggestedObjective: topic.suggestedObjective, suggestedPlatforms: topic.suggestedPlatforms, sourceEvidence: toJson(topic.sources) })) })
    }
    await tx.topicDiscoveryRun.update({ where: { id: prepared.runId }, data: { status: topics.length ? 'completed' : 'empty' } })
    await tx.aiRequestLog.update({ where: { id: prepared.aiRequestId }, data: { status: 'success', completedAt: new Date(), latencyMs: Date.now() - startedAt, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens, providerRequestId: providerResult.providerRequestId } })
    const body = { data: await readDiscoveryRun(tx, companyId, prepared.runId) }
    await tx.requestIdempotency.update({ where: { companyId_operation_key: { companyId, operation: M2_DISCOVERY_OPERATION, key: idempotencyKey } }, data: { responseStatus: 200, responseBody: toJson(body), resourceId: prepared.runId } })
    return { status: 200, body, etag: null, replay: false }
  })
}

export async function readDiscoveryRun(prisma: Db, companyId: string, runId: string) {
  const run = await prisma.topicDiscoveryRun.findFirst({ where: { id: runId, companyId }, include: { candidates: { orderBy: { position: 'asc' } } } })
  if (!run) throw notFound()
  return mapRun(run)
}

export async function readLatestDiscoveryRun(prisma: Db, companyId: string) {
  const run = await prisma.topicDiscoveryRun.findFirst({ where: { companyId, status: { in: ['completed', 'empty'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
  return run ? readDiscoveryRun(prisma, companyId, run.id) : null
}

export async function useDiscoveryCandidate(prisma: PrismaClient, companyId: string, actorId: string, candidateId: string, idempotencyKey: string) {
  return executeIdempotent(prisma, {
    companyId,
    operation: `topic-discovery-candidate.use:${candidateId}`,
    key: idempotencyKey,
    normalizedRequest: { actorId, candidateId },
    execute: async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "topic_candidates" WHERE "id" = CAST(${candidateId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID) FOR UPDATE`
      if (!rows[0]) throw notFound()
      const candidate = await tx.topicCandidate.findFirst({ where: { id: candidateId, companyId }, include: { run: true, product: { include: { profile: true } }, company: true } })
      if (!candidate) throw notFound()
      if (candidate.createdIdeaId) {
        const idea = await readIdea(tx, companyId, candidate.createdIdeaId)
        return { resourceId: idea.id, status: 200, body: { data: idea }, etag: null }
      }
      const ideaInput: IdeaInput = {
        title: candidate.title,
        contextType: candidate.productId ? 'product' : 'company',
        productId: candidate.productId,
        pillarCode: candidate.productId ? 'product' : 'industry',
        objective: candidate.suggestedObjective as IdeaInput['objective'],
        targetAudience: candidate.product?.profile ? [...candidate.product.profile.targetOrganizations, ...candidate.product.profile.targetUsers].join(', ') || 'Relevant B2B decision makers' : candidate.company.customerSegments.join(', ') || 'Relevant B2B decision makers',
        notes: `${candidate.summary}\n\nCurrent signal: ${candidate.whyCurrent}\n\nWhy it fits: ${candidate.relevanceToCompany}\n\nSuggested angle: ${candidate.contentAngle}\n\nSource evidence is preserved on the discovery candidate.`,
      }
      const idea = await createIdeaInTransaction(tx, companyId, actorId, ideaInput)
      await tx.topicCandidate.update({ where: { id: candidate.id }, data: { selectedAt: new Date(), createdIdeaId: idea.id } })
      return { resourceId: idea.id, status: 201, body: { data: idea }, etag: null }
    },
  })
}

function buildSnapshot(input: TopicDiscoveryInput, resolved: Awaited<ReturnType<typeof readResolvedContextFromDb>>, searchedAt: Date, promptVersionId: string, model: string, language: string) {
  const days = input.timeframe === 'last_7_days' ? 7 : 30
  return {
    request: { market: input.market, timeframe: input.timeframe, timeframeInstruction: `Prioritize sources published or updated within the previous ${days} days as of ${searchedAt.toISOString()}.`, focus: input.focus, resultCount: 6, searchContextSize: 'medium', userLocationCountry: 'ID', asOf: searchedAt.toISOString() },
    company: { name: resolved.company.profile.name, description: resolved.company.profile.description, industry: resolved.company.profile.industry, positioning: resolved.company.profile.positioning, valueProposition: resolved.company.profile.coreValueProposition, differentiators: resolved.company.profile.differentiators, customerSegments: resolved.company.profile.customerSegments, decisionMakers: resolved.company.profile.decisionMakers, painPoints: resolved.company.profile.painPoints },
    product: resolved.product ? { name: resolved.product.name, category: resolved.product.category, description: resolved.product.description, targetUsers: resolved.product.profile.targetUsers, targetOrganizations: resolved.product.profile.targetOrganizations, valueProposition: resolved.product.profile.valueProposition, positioning: resolved.product.profile.positioning, problemsAddressed: resolved.product.profile.problemsAddressed, differentiators: resolved.product.profile.differentiators } : null,
    ai: { module: 'M2', operation: M2_DISCOVERY_OPERATION, model, language, promptVersionId, outputSchemaVersion: M2_DISCOVERY_OUTPUT_SCHEMA_VERSION },
  }
}

export function parseAndValidateTopics(text: string, providerSources: TopicDiscoverySource[], observedAt: Date): ValidatedTopic[] {
  return parseAndValidateTopicsWithDiagnostics(text, providerSources, observedAt).topics
}

export function parseAndValidateTopicsWithDiagnostics(text: string, providerSources: TopicDiscoverySource[], observedAt: Date) {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw aiOutputInvalid() }
  if (!isRecord(parsed) || !Array.isArray(parsed.topics)) throw aiOutputInvalid()
  const diagnostics: TopicDiscoveryValidationDiagnostics = {
    webSearchCallCount: 0,
    actionSourceCount: 0,
    citationAnnotationCount: 0,
    deduplicatedProviderSourceCount: 0,
    providerStructuredTopicCount: parsed.topics.length,
    providerSourceCount: providerSources.length,
    validatedTopicCount: 0,
    rejected: {
      invalidCandidateShape: 0,
      missingRequiredText: 0,
      invalidObjective: 0,
      invalidPlatform: 0,
      duplicatePlatform: 0,
      invalidSourceUrl: 0,
      noValidatedSource: 0,
    },
  }
  const sourceMap = new Map(providerSources.flatMap((source) => {
    const url = canonicalUrl(source.url)
    return url ? [[url, source] as const] : []
  }))
  const topics: ValidatedTopic[] = []
  for (const value of parsed.topics.slice(0, 6)) {
    if (!isRecord(value)) {
      diagnostics.rejected.invalidCandidateShape += 1
      continue
    }
    const strings = ['title', 'summary', 'whyCurrent', 'relevanceToCompany', 'contentAngle']
    if (strings.some((key) => !nonBlankString(value[key]))) {
      diagnostics.rejected.missingRequiredText += 1
      continue
    }
    const objective = value.suggestedObjective
    if (!['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'].includes(String(objective))) {
      diagnostics.rejected.invalidObjective += 1
      continue
    }
    if (!Array.isArray(value.suggestedPlatforms) || value.suggestedPlatforms.length < 1 || value.suggestedPlatforms.length > 2 || value.suggestedPlatforms.some((platform) => platform !== 'instagram' && platform !== 'linkedin')) {
      diagnostics.rejected.invalidPlatform += 1
      continue
    }
    const platforms = value.suggestedPlatforms as Array<'instagram' | 'linkedin'>
    if (new Set(platforms).size !== platforms.length) {
      diagnostics.rejected.duplicatePlatform += 1
      continue
    }
    const rawSources = Array.isArray(value.sources) ? value.sources : []
    let hasInvalidSourceUrl = false
    const sources = rawSources.flatMap((raw) => {
      if (!isRecord(raw) || typeof raw.url !== 'string' || !canonicalUrl(raw.url)) {
        hasInvalidSourceUrl = true
        return []
      }
      const matched = sourceMap.get(canonicalUrl(raw.url))
      if (!matched) return []
      return [{ url: matched.url, title: matched.title ?? nonBlankString(raw.title) ?? matched.url, publisher: matched.publisher, publishedAt: matched.publishedAt, observedAt: observedAt.toISOString() }]
    })
    if (!sources.length) {
      diagnostics.rejected[hasInvalidSourceUrl ? 'invalidSourceUrl' : 'noValidatedSource'] += 1
      continue
    }
    topics.push({ title: String(value.title).trim(), summary: String(value.summary).trim(), whyCurrent: String(value.whyCurrent).trim(), relevanceToCompany: String(value.relevanceToCompany).trim(), contentAngle: String(value.contentAngle).trim(), suggestedObjective: objective as IdeaInput['objective'], suggestedPlatforms: platforms, sources })
  }
  diagnostics.validatedTopicCount = topics.length
  return { topics, diagnostics }
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch { return '' }
}

function mapRun(run: Prisma.TopicDiscoveryRunGetPayload<{ include: { candidates: true } }>) {
  return { id: run.id, companyId: run.companyId, productId: run.productId, market: run.market, timeframe: run.timeframe, focus: run.focus, status: run.status, searchedAt: run.searchedAt.toISOString(), createdAt: run.createdAt.toISOString(), candidates: run.candidates.map((candidate) => ({ id: candidate.id, position: candidate.position, title: candidate.title, summary: candidate.summary, whyCurrent: candidate.whyCurrent, relevanceToCompany: candidate.relevanceToCompany, contentAngle: candidate.contentAngle, suggestedObjective: candidate.suggestedObjective, suggestedPlatforms: candidate.suggestedPlatforms, sources: candidate.sourceEvidence, selectedAt: candidate.selectedAt?.toISOString() ?? null, createdIdeaId: candidate.createdIdeaId, createdAt: candidate.createdAt.toISOString() })) }
}

async function resolveExistingDiscovery(prisma: PrismaClient, existing: { requestHash: string; responseStatus: number; responseBody: Prisma.JsonValue; responseEtag: string | null; aiRequestId: string | null }, hash: string) {
  if (existing.requestHash !== hash) throw conflict('The Idempotency-Key was already used with a different discovery request.')
  const log = existing.aiRequestId ? await prisma.aiRequestLog.findUnique({ where: { id: existing.aiRequestId }, select: { status: true } }) : null
  if (log?.status === 'pending') throw conflict('A topic discovery request with this Idempotency-Key is already running.')
  if (log?.status === 'success' && isRecord(existing.responseBody) && 'data' in existing.responseBody) return { replay: true, status: existing.responseStatus, body: existing.responseBody as { data: ReturnType<typeof mapRun> }, etag: existing.responseEtag ?? null }
  throw conflict('This discovery request has already completed and cannot be replayed.')
}

async function finalizeDiscoveryFailure(prisma: PrismaClient, runId: string, aiRequestId: string, failure: { code: string; message: string }, latencyMs: number, providerResult: unknown) {
  const inputTokens = isRecord(providerResult) && typeof providerResult.inputTokens === 'number' ? providerResult.inputTokens : null
  const outputTokens = isRecord(providerResult) && typeof providerResult.outputTokens === 'number' ? providerResult.outputTokens : null
  const providerRequestId = isRecord(providerResult) && typeof providerResult.providerRequestId === 'string' ? providerResult.providerRequestId : null
  await prisma.$transaction([
    prisma.topicDiscoveryRun.update({ where: { id: runId }, data: { status: 'failed' } }),
    prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: { status: 'failed', completedAt: new Date(), latencyMs, inputTokens, outputTokens, providerRequestId, errorCode: failure.code, errorMessage: failure.message } }),
  ])
}

function toJson(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
function nonBlankString(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function isUniqueConstraint(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' }
