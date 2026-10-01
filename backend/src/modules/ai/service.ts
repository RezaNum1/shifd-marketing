import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { AppConfig } from '../../config/env.js'
import {
  aiNotConfigured, aiOutputInvalid, aiProviderError, aiTimeout, conflict, idempotencyConflict,
  inputChanged, inputNotReady, productContextIncomplete, rateLimited, requestInProgress,
  notFound, revisionConflict, validationError, AppError,
} from '../../shared/errors/AppError.js'
import { readCompanyContext, readProduct, readResolvedContextFromDb, type ContextDb } from '../context/service.js'
import { companyContextReadiness, productContextReadiness } from '../context/readiness.js'
import { requestHash } from '../context/normalize.js'
import { assertNoPublishedVariants, assertReviewUnlocked, getContentAggregate, readContentFromDb, mapContent } from '../content/service.js'
import { encodeCursor, etag } from '../context/service.js'
import type { AiMode, AiRequestStatus } from './constants.js'
import { AI_GENERATE_OPERATION, AI_LANGUAGES, AI_MODULE, AI_OPERATION, AI_PROVIDER, AI_PROVIDER_DISPLAY_NAME, OUTPUT_SCHEMA_VERSION } from './constants.js'
import { M2_PROMPT_REFERENCE, M2_SYSTEM_PROMPT, canonicalInputHash, renderM2DataPrompt } from './prompt.js'
import { parseM2Output, type M2Output } from './output.js'
import { AiProviderFailure, type AiProvider, type AiProviderResult } from './provider.js'

type Db = PrismaClient | Prisma.TransactionClient

export interface AiRequestDto {
  id: string
  module: string
  operation: string
  contentId: string | null
  variantId: string | null
  promptVersion: PromptVersionDto
  provider: string
  model: string
  generationLanguage: string
  mode: string
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostUsd: string | null
  latencyMs: number | null
  status: AiRequestStatus
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface PromptVersionDto {
  id: string
  module: string
  operation: string
  version: string
  status: string
  templateReference: string
  templateDigest: string
  outputSchemaVersion: string
  createdAt: string
  updatedAt: string
}

interface GenerateBody {
  data: {
    content: ReturnType<typeof mapContent>
    request: AiRequestDto
  }
}

interface ExistingAiRecord {
  requestHash: string
  responseStatus: number
  responseBody: Prisma.JsonValue
  responseEtag: string | null
  aiRequestId: string | null
}

interface PreparedGeneration {
  aiRequestId: string
  contentId: string
  contentVersion: number
  editorialRevision: number
  masterRevision: number
  companyContextVersion: number
  productId: string | null
  productVersion: number | null
  settingsVersion: number
  promptVersionId: string
  promptVersion: PromptVersionDto
  provider: string
  model: string
  mode: AiMode
  language: string
  snapshot: Record<string, unknown>
  inputHash: string
  idempotencyHash: string
  userPrompt: string
  rate: RateSelection | null
}

export interface RateSelection {
  id: string
  version: string
  inputUsdPerMillion: string
  outputUsdPerMillion: string
}

interface GenerationOutcome {
  status: number
  body: GenerateBody
  etag: string
  replay: boolean
}

export async function generateContent(
  prisma: PrismaClient,
  config: AppConfig,
  provider: AiProvider,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  idempotencyKey: string,
  requestId: string,
) {
  const operation = `${AI_GENERATE_OPERATION}:${contentId}`
  const existing = await prisma.requestIdempotency.findUnique({
    where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
  })
  if (existing) return resolveExisting(prisma, existing, { companyId, actorId, contentId, expectedVersion, operation })

  let prepared: PreparedGeneration
  try {
    prepared = await prisma.$transaction(async (tx) => {
      const locked = await lockContentForGeneration(tx, companyId, contentId, expectedVersion)
      const unlocked = await assertReviewUnlocked(tx, companyId, contentId, config)
      assertNoPublishedVariants(unlocked)
      const input = await buildGenerationInput(tx, config, provider, companyId, actorId, contentId, expectedVersion, idempotencyKey, locked)
      const raced = await tx.requestIdempotency.findUnique({
        where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      })
      if (raced) {
        const resolved = await resolveExistingInTransaction(tx, raced, { companyId, actorId, contentId, expectedVersion, operation }, input.idempotencyHash)
        if (resolved) throw new ExistingGenerationReplay(resolved)
      }

      const aiRequestId = randomUUID()
      await tx.aiRequestLog.create({
        data: {
          id: aiRequestId,
          companyId,
          contentId,
          variantId: null,
          requestedBy: actorId,
          promptVersionId: input.promptVersionId,
          module: AI_MODULE,
          operation: AI_OPERATION,
          provider: AI_PROVIDER,
          model: input.model,
          mode: input.mode,
          language: input.language,
          editorialRevision: input.editorialRevision,
          variantRevision: null,
          inputHash: input.inputHash,
          inputSnapshot: toJson(input.snapshot),
          inputTokens: null,
          outputTokens: null,
          estimatedCostUsd: null,
          costBasis: input.rate ? toJson(input.rate) : Prisma.DbNull,
          latencyMs: null,
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          providerRequestId: null,
        },
      })
      await tx.requestIdempotency.create({
        data: {
          companyId,
          operation,
          key: idempotencyKey,
          requestHash: requestHash({
            companyId,
            actorId,
            operation,
            path: `/api/contents/${contentId}/generate`,
            body: {},
            ifMatch: expectedVersion,
            inputHash: input.inputHash,
            promptVersionId: input.promptVersionId,
            model: input.model,
            language: input.language,
            mode: input.mode,
          }),
          responseStatus: 202,
          responseBody: {},
          resourceId: aiRequestId,
          responseEtag: null,
          aiRequestId,
        },
      })
      return { ...input, aiRequestId }
    })
  } catch (error) {
    if (error instanceof ExistingGenerationReplay) return error.result
    if (isUniqueConstraint(error)) {
      const raced = await prisma.requestIdempotency.findUnique({
        where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      })
      if (raced) return resolveExisting(prisma, raced, { companyId, actorId, contentId, expectedVersion, operation })
    }
    throw error
  }

  let providerResult: AiProviderResult
  const startedAt = Date.now()
  try {
    providerResult = await provider.generate({
      model: prepared.model,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      systemPrompt: M2_SYSTEM_PROMPT,
      userPrompt: prepared.userPrompt,
      maxOutputTokens: config.aiMaxOutputTokens,
      timeoutMs: config.aiRequestTimeoutMs,
    })
  } catch (error) {
    const failure = mapProviderFailure(error)
    const latencyMs = elapsedMs(startedAt)
    await finalizeFailedRequest(prisma, prepared.aiRequestId, failure, latencyMs, null, error instanceof AiProviderFailure ? error.providerRequestId : null)
    throw failure
  }

  const latencyMs = elapsedMs(startedAt)
  let output: M2Output
  try {
    output = parseM2Output(providerResult.text)
  } catch (error) {
    const failure = error instanceof AppError && error.code === 'AI_OUTPUT_INVALID' ? error : aiOutputInvalid()
    await finalizeFailedRequest(prisma, prepared.aiRequestId, failure, latencyMs, providerResult)
    throw failure
  }

  const final = await finalizeSuccessfulRequest(prisma, prepared, output, providerResult, latencyMs, companyId, actorId, requestId, idempotencyKey, config)
  if (final.stale) throw inputChanged(prepared.aiRequestId)
  return final.result
}

async function buildGenerationInput(
  tx: Prisma.TransactionClient,
  config: AppConfig,
  provider: AiProvider,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  idempotencyKey: string,
  locked: { version: number },
): Promise<Omit<PreparedGeneration, 'aiRequestId'>> {
  const content = await tx.content.findFirst({
    where: { id: contentId, companyId },
    select: {
      id: true, contextType: true, productId: true, version: true, editorialRevision: true, masterRevision: true, editorialStage: true, designStatus: true,
      archivedAt: true, brief: true, variants: { select: { platform: true, enabled: true }, orderBy: { platform: 'asc' } },
    },
  })
  if (!content) throw notFound()
  if (locked.version !== content.version) throw revisionConflict()
  if (content.archivedAt) throw conflict('Archived Content cannot be generated.')
  if (!content.brief) throw inputNotReady(['brief'])
  if (!['company', 'product'].includes(content.contextType)) throw inputNotReady(['content.contextType'])
  if (content.contextType === 'company' && content.productId !== null) throw inputNotReady(['content.productId'])
  if (content.contextType === 'product' && !content.productId) throw inputNotReady(['content.productId'])
  await assertBriefReady(tx, content.contextType, content.productId, content.brief.pillarCode, content.brief.objective, content.brief.targetAudience, content.brief.topic)

  const resolved = await readResolvedContextFromDb(tx, companyId, content.productId ?? undefined)
  const companyReady = companyContextReadiness({
    name: resolved.company.profile.name,
    description: resolved.company.profile.description,
    brandVoice: resolved.company.brand.brandVoice,
  })
  if (!companyReady.ready) throw inputNotReady(companyReady.missing)
  if (content.contextType === 'product') {
    if (!resolved.product) throw inputNotReady(['product'])
    const productReady = productContextReadiness(resolved.product.profile)
    if (!productReady.ready) throw productContextIncomplete(productReady.missing)
  }

  const settings = await tx.aiSettings.findUnique({ where: { companyId } })
  if (!settings) throw aiNotConfigured()
  const prompt = await tx.promptVersion.findFirst({ where: { module: AI_MODULE, operation: AI_OPERATION, status: 'active' } })
  if (!prompt) throw inputNotReady(['promptVersion'])
  const configuredModel = settings.modelId ?? config.openaiModel ?? undefined
  const model = configuredModel ?? settings.modelDisplayName
  const mode = settings.mode as AiMode
  const language = settings.generationLanguage
  if (provider.isConfigured && !provider.isConfigured(configuredModel)) throw aiNotConfigured()
  const rate = await selectRate(tx, model)
  const snapshot: Record<string, unknown> = {
    request: { actorId, contentId, path: `/api/contents/${contentId}/generate`, ifMatch: expectedVersion, body: {} },
    content: {
      id: content.id,
      version: content.version,
      editorialRevision: content.editorialRevision,
      masterRevision: content.masterRevision,
      editorialStage: content.editorialStage,
      designStatus: content.designStatus,
      enabledPlatforms: content.variants.filter((variant) => variant.enabled).map((variant) => variant.platform),
    },
    brief: {
      contextType: content.contextType,
      productId: content.productId,
      pillarCode: content.brief.pillarCode,
      objective: content.brief.objective,
      targetAudience: content.brief.targetAudience,
      topic: content.brief.topic,
      angle: content.brief.angle,
      additionalInstructions: content.brief.additionalInstructions,
    },
    company: resolved.company,
    product: resolved.product,
    resolvedBrand: resolved.resolvedBrand,
    contextVersions: { company: resolved.versions.company, product: resolved.versions.product },
    ai: {
      provider: AI_PROVIDER,
      model,
      mode,
      generationLanguage: language,
      settingsVersion: settings.version,
      promptVersion: mapPromptVersion(prompt),
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    },
  }
  const inputHash = canonicalInputHash(snapshot)
  const idempotencyHash = requestHash({
    companyId,
    actorId,
    operation: `${AI_GENERATE_OPERATION}:${contentId}`,
    path: `/api/contents/${contentId}/generate`,
    body: {},
    ifMatch: expectedVersion,
    inputHash,
    promptVersionId: prompt.id,
    model,
    language,
    mode,
  })
  return {
    contentId,
    contentVersion: content.version,
    editorialRevision: content.editorialRevision,
    masterRevision: content.masterRevision,
    companyContextVersion: resolved.versions.company,
    productId: content.productId,
    productVersion: resolved.versions.product,
    settingsVersion: settings.version,
    promptVersionId: prompt.id,
    promptVersion: mapPromptVersion(prompt),
    provider: AI_PROVIDER,
    model,
    mode,
    language,
    snapshot,
    inputHash,
    idempotencyHash,
    userPrompt: renderM2DataPrompt({ company: resolved.company, product: resolved.product, brief: snapshot.brief, execution: snapshot.ai }),
    rate,
  }
}

async function finalizeSuccessfulRequest(
  prisma: PrismaClient,
  prepared: PreparedGeneration,
  output: M2Output,
  providerResult: AiProviderResult,
  latencyMs: number,
  companyId: string,
  actorId: string,
  requestId: string,
  idempotencyKey: string,
  config: AppConfig,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ version: number; editorialRevision: number; masterRevision: number; contextType: string; productId: string | null }>>`
      SELECT "version", "editorial_revision" AS "editorialRevision", "master_revision" AS "masterRevision", "context_type" AS "contextType", "product_id" AS "productId"
      FROM "contents" WHERE "id" = CAST(${prepared.contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID) FOR UPDATE
    `
    const current = rows[0]
    const aggregate = current ? await getContentAggregate(tx, companyId, prepared.contentId) : null
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { contextVersion: true } })
    const product = prepared.productId ? await tx.product.findFirst({ where: { id: prepared.productId, companyId }, select: { id: true, version: true } }) : null
    const settings = await tx.aiSettings.findUnique({ where: { companyId }, select: { version: true } })
    const prompt = await tx.promptVersion.findFirst({ where: { module: AI_MODULE, operation: AI_OPERATION, status: 'active' }, select: { id: true } })
    const stale = !current || !aggregate || aggregate.variants.some((variant) => variant.publication) || !company || current.version !== prepared.contentVersion || current.editorialRevision !== prepared.editorialRevision || current.masterRevision !== prepared.masterRevision || current.contextType !== (prepared.productId ? 'product' : 'company') || current.productId !== prepared.productId || company.contextVersion !== prepared.companyContextVersion || (prepared.productId !== null && (!product || product.version !== prepared.productVersion)) || !settings || settings.version !== prepared.settingsVersion || !prompt || prompt.id !== prepared.promptVersionId
    const usage = usageForDb(providerResult)
    if (stale) {
      await tx.aiRequestLog.update({ where: { id: prepared.aiRequestId }, data: {
        status: 'stale', completedAt: new Date(), latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        providerRequestId: providerResult.providerRequestId,
        errorCode: 'INPUT_CHANGED',
        errorMessage: 'The saved context changed while the AI request was running.',
      } })
      return { stale: true as const, result: null }
    }

    await tx.content.update({ where: { id: prepared.contentId }, data: {
      masterContent: toJson(output.master),
      visualDirection: toJson(output.visualDirection),
      editorialStage: 'generated',
      version: { increment: 1 },
      editorialRevision: { increment: 1 },
      masterRevision: { increment: 1 },
    } })
    await tx.contentEvent.create({
      data: {
        contentId: prepared.contentId,
        variantId: null,
        actorId,
        actorKind: 'user',
        eventType: 'ai_generated',
        metadata: toJson({ aiRequestId: prepared.aiRequestId, promptVersionId: prepared.promptVersionId, module: AI_MODULE, operation: AI_OPERATION }),
        requestId,
      },
    })
    const estimatedCost = calculateCost(usage, prepared.rate)
    await tx.aiRequestLog.update({ where: { id: prepared.aiRequestId }, data: {
      status: 'success', completedAt: new Date(), latencyMs,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      estimatedCostUsd: estimatedCost,
      providerRequestId: providerResult.providerRequestId,
    } })
    const content = await readContentFromDb(tx, companyId, prepared.contentId, { openaiModel: config.openaiModel })
    const log = await tx.aiRequestLog.findUnique({ where: { id: prepared.aiRequestId }, include: { promptVersion: true } })
    if (!log) throw conflict('AI request evidence could not be finalized.')
    const request = mapAiRequest(log)
    const body: GenerateBody = { data: { content, request } }
    const operation = `${AI_GENERATE_OPERATION}:${prepared.contentId}`
    await tx.requestIdempotency.update({
      where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      data: { responseStatus: 200, responseBody: toJson(body), resourceId: prepared.contentId, responseEtag: etag(content.version) },
    })
    return { stale: false as const, result: { status: 200, body, etag: etag(content.version), replay: false } }
  })
}

async function finalizeFailedRequest(prisma: PrismaClient, aiRequestId: string, failure: AppError, latencyMs: number, providerResult: AiProviderResult | null, providerRequestId: string | null = null) {
  const usage = providerResult ? usageForDb(providerResult) : { inputTokens: null, outputTokens: null }
  await prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: {
    status: 'failed', completedAt: new Date(), errorCode: failure.code, errorMessage: failure.message,
    latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    providerRequestId: providerRequestId ?? providerResult?.providerRequestId ?? null,
  } })
}

export function mapProviderFailure(error: unknown): AppError {
  if (error instanceof AiProviderFailure) {
    const mapped = error.kind === 'not_configured'
      ? aiNotConfigured()
      : error.kind === 'timeout'
        ? aiTimeout()
        : error.kind === 'rate_limit'
          ? rateLimited('The AI provider rate limit was reached.')
          : error.kind === 'invalid_response'
            ? aiOutputInvalid()
            : aiProviderError()
    if (error.providerRequestId || error.diagnostics || error.responseDiagnostics) {
      Object.defineProperty(mapped, 'providerDiagnostics', {
        value: { requestId: error.providerRequestId, ...(error.diagnostics ?? {}), ...(error.responseDiagnostics ?? {}) },
        enumerable: false,
      })
    }
    return mapped
  }
  return aiProviderError()
}

async function resolveExisting(prisma: PrismaClient, existing: ExistingAiRecord, intent: { companyId: string; actorId: string; contentId: string; expectedVersion: number; operation: string }) {
  const log = existing.aiRequestId ? await prisma.aiRequestLog.findUnique({ where: { id: existing.aiRequestId }, include: { promptVersion: true } }) : null
  if (!log || !sameIntent(log.inputSnapshot, intent)) throw idempotencyConflict()
  if (log.status === 'pending') throw requestInProgress(log.id)
  if (log.status === 'success' && isResponseBody(existing.responseBody)) {
    return { replay: true as const, status: existing.responseStatus, body: existing.responseBody as GenerateBody, etag: existing.responseEtag }
  }
  throw idempotencyConflict()
}

async function resolveExistingInTransaction(tx: Prisma.TransactionClient, existing: ExistingAiRecord, intent: { companyId: string; actorId: string; contentId: string; expectedVersion: number; operation: string }, expectedHash: string) {
  if (existing.requestHash !== expectedHash) throw idempotencyConflict()
  const log = existing.aiRequestId ? await tx.aiRequestLog.findUnique({ where: { id: existing.aiRequestId }, include: { promptVersion: true } }) : null
  if (!log || !sameIntent(log.inputSnapshot, intent)) throw idempotencyConflict()
  if (log.status === 'pending') throw requestInProgress(log.id)
  if (log.status === 'success' && isResponseBody(existing.responseBody)) return { replay: true as const, status: existing.responseStatus, body: existing.responseBody as GenerateBody, etag: existing.responseEtag }
  throw idempotencyConflict()
}

class ExistingGenerationReplay extends Error {
  constructor(public readonly result: { replay: boolean; status: number; body: GenerateBody; etag: string | null }) {
    super('Existing AI generation request.')
  }
}

async function assertBriefReady(db: Db, contextType: string, productId: string | null, pillarCode: string, objective: string, targetAudience: string, topic: string) {
  if (!targetAudience.trim()) throw inputNotReady(['brief.targetAudience'])
  if (!topic.trim()) throw inputNotReady(['brief.topic'])
  if (!['company', 'product'].includes(contextType)) throw inputNotReady(['brief.contextType'])
  if (contextType === 'company' && productId !== null) throw inputNotReady(['brief.productId'])
  if (contextType === 'product' && !productId) throw inputNotReady(['brief.productId'])
  const pillar = await db.contentPillar.findFirst({ where: { code: pillarCode, active: true }, select: { code: true } })
  if (!pillar) throw inputNotReady(['brief.pillarCode'])
  if (!['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'].includes(objective)) throw inputNotReady(['brief.objective'])
}

async function lockContentForGeneration(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version" FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const row = rows[0]
  if (!row) throw notFound()
  if (row.version !== expectedVersion) throw revisionConflict()
  return row
}

async function selectRate(tx: Prisma.TransactionClient, model: string): Promise<RateSelection | null> {
  const row = await tx.aiRateVersion.findFirst({ where: { provider: AI_PROVIDER, model, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' } })
  if (!row) return null
  return { id: row.id, version: row.version, inputUsdPerMillion: row.inputUsdPerMillion.toString(), outputUsdPerMillion: row.outputUsdPerMillion.toString() }
}

export function usageForDb(result: AiProviderResult) {
  return {
    inputTokens: Number.isSafeInteger(result.inputTokens) && result.inputTokens !== null ? BigInt(result.inputTokens) : null,
    outputTokens: Number.isSafeInteger(result.outputTokens) && result.outputTokens !== null ? BigInt(result.outputTokens) : null,
  }
}

export function calculateCost(usage: { inputTokens: bigint | null; outputTokens: bigint | null }, rate: RateSelection | null): string | null {
  if (!rate || usage.inputTokens === null || usage.outputTokens === null) return null
  const input = Number(usage.inputTokens) / 1_000_000 * Number(rate.inputUsdPerMillion)
  const output = Number(usage.outputTokens) / 1_000_000 * Number(rate.outputUsdPerMillion)
  if (!Number.isFinite(input + output)) return null
  return (input + output).toFixed(8)
}

export async function readAiSettings(prisma: PrismaClient, config: AppConfig, companyId: string) {
  const settings = await prisma.aiSettings.findUnique({ where: { companyId } })
  if (!settings) throw conflict('AI settings provisioning is incomplete. Run the approved setup path.')
  return mapAiSettings(settings, config, await hasActivePrompt(prisma))
}

export async function updateAiSettings(prisma: PrismaClient, config: AppConfig, companyId: string, expectedVersion: number, generationLanguage: string) {
  if (!AI_LANGUAGES.includes(generationLanguage as typeof AI_LANGUAGES[number])) throw validationError('The generation language is invalid.', { generationLanguage: 'Choose English or Indonesian.' })
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ version: number }>>`SELECT "version" FROM "ai_settings" WHERE "company_id" = CAST(${companyId} AS UUID) FOR UPDATE`
    const row = rows[0]
    if (!row) throw conflict('AI settings provisioning is incomplete. Run the approved setup path.')
    if (row.version !== expectedVersion) throw revisionConflict()
    const updated = await tx.aiSettings.update({ where: { companyId }, data: { generationLanguage, version: { increment: 1 } } })
    const prompt = await tx.promptVersion.findFirst({ where: { module: AI_MODULE, operation: AI_OPERATION, status: 'active' }, select: { id: true } })
    return mapAiSettings(updated, config, Boolean(prompt))
  })
}

async function hasActivePrompt(prisma: PrismaClient) {
  return Boolean(await prisma.promptVersion.findFirst({ where: { module: AI_MODULE, operation: AI_OPERATION, status: 'active' }, select: { id: true } }))
}

function mapAiSettings(settings: { provider: string; modelId: string | null; modelDisplayName: string; generationLanguage: string; mode: string; version: number }, config: AppConfig, promptConfigured: boolean) {
  const hasProvider = Boolean(config.openaiApiKey && (settings.modelId || config.openaiModel))
  return {
    provider: AI_PROVIDER_DISPLAY_NAME,
    model: settings.modelDisplayName,
    generationLanguage: settings.generationLanguage,
    mode: settings.mode,
    status: hasProvider && promptConfigured ? 'configured' : 'not_configured',
    systemStatus: {
      contextEngine: 'configured',
      promptConfiguration: promptConfigured ? 'configured' : 'not_configured',
      aiConfiguration: hasProvider ? 'configured' : 'not_configured',
    },
    version: settings.version,
  }
}

export async function listPromptVersions(prisma: PrismaClient, options: { module?: string; status?: string; limit: number; cursor?: { createdAt: Date; id: string } }) {
  const filters: Prisma.PromptVersionWhereInput[] = []
  if (options.module) filters.push({ module: options.module })
  if (options.status) filters.push({ status: options.status })
  if (options.cursor) filters.push({ OR: [{ createdAt: { lt: options.cursor.createdAt } }, { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const query = filters.length ? { AND: filters } : {}
  const rows = await prisma.promptVersion.findMany({ where: query, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: options.limit + 1 })
  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  return { data: pageRows.map(mapPromptVersion), nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null }
}

export async function readPromptVersion(prisma: PrismaClient, id: string) {
  const row = await prisma.promptVersion.findUnique({ where: { id } })
  if (!row) throw notFound()
  return mapPromptVersion(row)
}

export interface AiRequestListOptions {
  contentId?: string
  module?: string
  status?: AiRequestStatus
  mode?: AiMode
  limit: number
  cursor?: { createdAt: Date; id: string }
}

export async function listAiRequests(prisma: PrismaClient, companyId: string, options: AiRequestListOptions) {
  const filters: Prisma.AiRequestLogWhereInput[] = [{ companyId }]
  if (options.contentId) filters.push({ contentId: options.contentId })
  if (options.module) filters.push({ module: options.module })
  if (options.status) filters.push({ status: options.status })
  if (options.mode) filters.push({ mode: options.mode })
  if (options.cursor) filters.push({ OR: [{ createdAt: { lt: options.cursor.createdAt } }, { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }] })
  const rows = await prisma.aiRequestLog.findMany({ where: { AND: filters }, include: { promptVersion: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: options.limit + 1 })
  const pageRows = rows.slice(0, options.limit)
  const last = pageRows.at(-1)
  return { data: pageRows.map(mapAiRequest), nextCursor: rows.length > options.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null }
}

export async function readAiRequest(prisma: PrismaClient, companyId: string, id: string) {
  const row = await prisma.aiRequestLog.findFirst({ where: { id, companyId }, include: { promptVersion: true } })
  if (!row) throw notFound()
  return mapAiRequest(row)
}

export async function readAiUsage(prisma: PrismaClient, companyId: string, mode: AiMode, start: Date, end: Date) {
  const where: Prisma.AiRequestLogWhereInput = { companyId, mode, createdAt: { gte: start, lt: end } }
  const [count, totals, unknownUsage, unknownCost] = await Promise.all([
    prisma.aiRequestLog.count({ where }),
    prisma.aiRequestLog.aggregate({ where, _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true } }),
    prisma.aiRequestLog.count({ where: { ...where, OR: [{ inputTokens: null }, { outputTokens: null }] } }),
    prisma.aiRequestLog.count({ where: { ...where, estimatedCostUsd: null } }),
  ])
  return {
    mode,
    period: { start: start.toISOString(), end: end.toISOString() },
    requests: count,
    inputTokens: totals._sum.inputTokens === null ? 0 : Number(totals._sum.inputTokens),
    outputTokens: totals._sum.outputTokens === null ? 0 : Number(totals._sum.outputTokens),
    estimatedCostUsd: totals._sum.estimatedCostUsd === null ? null : totals._sum.estimatedCostUsd.toFixed(8),
    unknownUsageRequests: unknownUsage,
    unknownCostRequests: unknownCost,
    currency: 'USD' as const,
  }
}

export function mapPromptVersion(row: { id: string; module: string; operation: string; version: string; status: string; templateReference: string; templateDigest: string; outputSchemaVersion: string; createdAt: Date; updatedAt: Date }): PromptVersionDto {
  return {
    id: row.id, module: row.module, operation: row.operation, version: row.version, status: row.status,
    templateReference: row.templateReference, templateDigest: row.templateDigest, outputSchemaVersion: row.outputSchemaVersion,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapAiRequest(row: {
  id: string; module: string; operation: string; contentId: string | null; variantId: string | null; provider: string; model: string;
  language: string; mode: string; inputTokens: bigint | null; outputTokens: bigint | null; estimatedCostUsd: Prisma.Decimal | null;
  latencyMs: number | null; status: string; errorCode: string | null; errorMessage: string | null; createdAt: Date; completedAt: Date | null;
  promptVersion: { id: string; module: string; operation: string; version: string; status: string; templateReference: string; templateDigest: string; outputSchemaVersion: string; createdAt: Date; updatedAt: Date }
}): AiRequestDto {
  return {
    id: row.id, module: row.module, operation: row.operation, contentId: row.contentId, variantId: row.variantId,
    promptVersion: mapPromptVersion(row.promptVersion), provider: row.provider === 'anthropic' ? 'Claude' : row.provider === AI_PROVIDER ? AI_PROVIDER_DISPLAY_NAME : row.provider,
    model: row.model, generationLanguage: row.language, mode: row.mode,
    inputTokens: row.inputTokens === null ? null : Number(row.inputTokens), outputTokens: row.outputTokens === null ? null : Number(row.outputTokens),
    estimatedCostUsd: row.estimatedCostUsd === null ? null : row.estimatedCostUsd.toFixed(8), latencyMs: row.latencyMs,
    status: row.status as AiRequestStatus, errorCode: row.errorCode, errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
  }
}

function sameIntent(snapshot: unknown, intent: { actorId: string; contentId: string; expectedVersion: number }) {
  if (!isRecord(snapshot) || !isRecord(snapshot.request)) return false
  const request = snapshot.request
  return request.actorId === intent.actorId && request.contentId === intent.contentId && request.ifMatch === intent.expectedVersion && isRecord(request.body) && Object.keys(request.body).length === 0
}

function isResponseBody(value: unknown): value is { data: { content: unknown; request: AiRequestDto } } {
  return isRecord(value) && isRecord(value.data) && isRecord(value.data.content) && isRecord(value.data.request)
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt)
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
