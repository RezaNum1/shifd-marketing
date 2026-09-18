import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { AppConfig } from '../../config/env.js'
import {
  aiNotConfigured, aiOutputInvalid, conflict, idempotencyConflict, inputChanged,
  inputNotReady, productContextIncomplete, requestInProgress, notFound,
  revisionConflict, AppError,
} from '../../shared/errors/AppError.js'
import { requestHash } from '../context/normalize.js'
import { readResolvedContextFromDb } from '../context/service.js'
import { companyContextReadiness, productContextReadiness } from '../context/readiness.js'
import { approvalIsCurrent, assessmentFreshness, assertReviewUnlocked, assertVariantNotPublished, getContentAggregate, readContentFromDb } from '../content/service.js'
import { hasCompleteVariantCopy } from '../content/lifecycle.js'
import type { PlatformCode } from '../content/constants.js'
import { brandRelevantInputHash, type BrandHashParts } from './brand-hash.js'
import {
  AI_PROVIDER, M4_BRAND_CHECK_OPERATION, M4_MODULE, M4_OPERATION, M4_OUTPUT_SCHEMA_VERSION,
  type AiMode,
} from './constants.js'
import { M4_SYSTEM_PROMPT, renderM4DataPrompt } from './prompt.js'
import { parseM4Output, type M4Output } from './output.js'
import {
  calculateCost, mapAiRequest, mapPromptVersion, mapProviderFailure, usageForDb,
  type AiRequestDto, type PromptVersionDto, type RateSelection,
} from './service.js'
import { AiProviderFailure, type AiProvider, type AiProviderResult } from './provider.js'

interface PreparedBrandCheck {
  aiRequestId: string
  contentId: string
  targetVariantId: string
  targetVariantRevision: number
  platform: PlatformCode
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

interface BrandCheckResponse {
  data: {
    content: Awaited<ReturnType<typeof readContentFromDb>>
    request: AiRequestDto
  }
}

interface ExistingBrandCheckRecord {
  requestHash: string
  responseStatus: number
  responseBody: Prisma.JsonValue
  responseEtag: string | null
  aiRequestId: string | null
}

interface BrandCheckIntent {
  actorId: string
  contentId: string
  platform: PlatformCode
  expectedVersion: number
}

export async function brandCheckContent(
  prisma: PrismaClient,
  config: AppConfig,
  provider: AiProvider,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  platform: PlatformCode,
  idempotencyKey: string,
  requestId: string,
) {
  const operation = `${M4_BRAND_CHECK_OPERATION}:${contentId}`
  const intent: BrandCheckIntent = { actorId, contentId, platform, expectedVersion }
  const existing = await prisma.requestIdempotency.findUnique({
    where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
  })
  if (existing) return resolveExisting(prisma, existing, intent, config, provider)

  let prepared: PreparedBrandCheck
  try {
    prepared = await prisma.$transaction(async (tx) => {
      await lockContent(tx, companyId, contentId, expectedVersion)
      const unlocked = await assertReviewUnlocked(tx, companyId, contentId, config)
      const unlockedTarget = unlocked.variants.find((variant) => variant.platform === platform)
      if (unlockedTarget) assertVariantNotPublished(unlockedTarget)
      const input = await buildBrandCheckInput(tx, config, provider, companyId, actorId, contentId, expectedVersion, platform, false)
      const raced = await tx.requestIdempotency.findUnique({
        where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      })
      if (raced) {
        const resolved = await resolveExistingInTransaction(tx, raced, intent, input.idempotencyHash)
        throw new ExistingBrandCheckReplay(resolved)
      }

      const aiRequestId = randomUUID()
      await tx.aiRequestLog.create({
        data: {
          id: aiRequestId,
          companyId,
          contentId,
          variantId: input.targetVariantId,
          requestedBy: actorId,
          promptVersionId: input.promptVersionId,
          module: M4_MODULE,
          operation: M4_OPERATION,
          provider: AI_PROVIDER,
          model: input.model,
          mode: input.mode,
          language: input.language,
          editorialRevision: input.editorialRevision,
          variantRevision: input.targetVariantRevision,
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
          requestHash: input.idempotencyHash,
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
    if (error instanceof ExistingBrandCheckReplay) return error.result
    if (isUniqueConstraint(error)) {
      const raced = await prisma.requestIdempotency.findUnique({
        where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      })
      if (raced) return resolveExisting(prisma, raced, intent, config, provider)
    }
    throw error
  }

  let providerResult: AiProviderResult
  const startedAt = Date.now()
  try {
    providerResult = await provider.generate({
      model: prepared.model,
      outputSchemaVersion: M4_OUTPUT_SCHEMA_VERSION,
      systemPrompt: M4_SYSTEM_PROMPT,
      userPrompt: prepared.userPrompt,
      maxOutputTokens: config.aiMaxOutputTokens,
      timeoutMs: config.aiRequestTimeoutMs,
    })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await finalizeFailedRequest(prisma, prepared.aiRequestId, failure, elapsedMs(startedAt), null, error instanceof AiProviderFailure ? error.providerRequestId : null)
    throw failure
  }

  const latencyMs = elapsedMs(startedAt)
  let output: M4Output
  try {
    output = parseM4Output(providerResult.text)
  } catch (error) {
    const failure = error instanceof AppError && error.code === 'AI_OUTPUT_INVALID' ? error : aiOutputInvalid()
    await finalizeFailedRequest(prisma, prepared.aiRequestId, failure, latencyMs, providerResult)
    throw failure
  }

  const final = await finalizeBrandCheck(prisma, prepared, output, providerResult, latencyMs, companyId, actorId, requestId, idempotencyKey, config, provider)
  if (final.stale) throw inputChanged(prepared.aiRequestId)
  return final.result
}

async function buildBrandCheckInput(
  tx: Prisma.TransactionClient,
  config: AppConfig,
  provider: AiProvider,
  companyId: string,
  actorId: string,
  contentId: string,
  expectedVersion: number,
  platform: PlatformCode,
  comparisonOnly: boolean,
) {
  const content = await tx.content.findFirst({
    where: { id: contentId, companyId },
    select: {
      id: true, companyId: true, contextType: true, productId: true, version: true,
      editorialRevision: true, masterRevision: true, editorialStage: true, designStatus: true,
      archivedAt: true, masterContent: true, visualDirection: true, brief: true,
      variants: {
        select: {
          id: true, platform: true, enabled: true, revision: true,
          copy: true, cta: true, hashtags: true, visualRecommendation: true,
          adaptedFromMasterRevision: true,
        },
        orderBy: { platform: 'asc' },
      },
    },
  })
  if (!content) throw notFound()
  if (!comparisonOnly && content.archivedAt) throw conflict('Archived Content cannot be brand checked.')
  if (!content.brief) throw inputNotReady(['brief'])
  if (!['company', 'product'].includes(content.contextType)) throw inputNotReady(['content.contextType'])
  if (content.contextType === 'company' && content.productId !== null) throw inputNotReady(['content.productId'])
  if (content.contextType === 'product' && !content.productId) throw inputNotReady(['content.productId'])
  if (!['instagram', 'linkedin'].includes(platform)) throw inputNotReady(['platform'])
  if (!comparisonOnly) await assertBriefReady(tx, content.contextType, content.productId, content.brief)

  const target = content.variants.find((variant) => variant.platform === platform)
  if (!target) throw notFound()
  if (!comparisonOnly && !target.enabled) throw inputNotReady(['variant.enabled'])

  const master = parseMaster(content.masterContent)
  if (!comparisonOnly && !master) throw inputNotReady(['master'])
  const visualDirection = parseVisualDirection(content.visualDirection)
  if (!comparisonOnly && !visualDirection && content.visualDirection !== null) throw inputNotReady(['visualDirection'])
  if (!comparisonOnly && (!hasCompleteVariantCopy(target) || target.adaptedFromMasterRevision !== content.masterRevision || !target.enabled)) {
    throw inputNotReady(['variant'])
  }

  const resolved = await readResolvedContextFromDb(tx, companyId, content.productId ?? undefined)
  const companyReady = companyContextReadiness({
    name: resolved.company.profile.name,
    description: resolved.company.profile.description,
    brandVoice: resolved.company.brand.brandVoice,
  })
  if (!companyReady.ready && !comparisonOnly) throw inputNotReady(companyReady.missing)
  if (content.contextType === 'product') {
    if (!resolved.product) throw inputNotReady(['product'])
    const productReady = productContextReadiness(resolved.product.profile)
    if (!productReady.ready && !comparisonOnly) throw productContextIncomplete(productReady.missing)
  }

  const settings = await tx.aiSettings.findUnique({ where: { companyId } })
  if (!settings) throw aiNotConfigured()
  const prompt = await tx.promptVersion.findFirst({ where: { module: M4_MODULE, operation: M4_OPERATION, status: 'active' } })
  if (!prompt) throw inputNotReady(['promptVersion'])
  const configuredModel = settings.modelId ?? config.openaiModel ?? undefined
  const model = configuredModel ?? settings.modelDisplayName
  const mode = settings.mode as AiMode
  const language = settings.generationLanguage
  if (!comparisonOnly && provider.isConfigured && !provider.isConfigured(configuredModel)) throw aiNotConfigured()

  const brief = {
    contextType: content.contextType,
    productId: content.productId,
    pillarCode: content.brief.pillarCode,
    objective: content.brief.objective,
    targetAudience: content.brief.targetAudience,
    topic: content.brief.topic,
    angle: content.brief.angle,
    additionalInstructions: content.brief.additionalInstructions,
  }
  const targetVariant = {
    id: target.id,
    platform: target.platform,
    enabled: target.enabled,
    revision: target.revision,
    copy: target.copy,
    cta: target.cta,
    hashtags: target.hashtags,
    visualRecommendation: target.visualRecommendation,
    adaptedFromMasterRevision: target.adaptedFromMasterRevision,
  }
  const execution = {
    provider: AI_PROVIDER,
    model,
    mode,
    generationLanguage: language,
    settingsVersion: settings.version,
    promptVersion: mapPromptVersion(prompt),
    outputSchemaVersion: M4_OUTPUT_SCHEMA_VERSION,
  }
  const relevantSnapshot: BrandHashParts = {
    content: {
      id: content.id,
      contextType: content.contextType,
      productId: content.productId,
      masterRevision: content.masterRevision,
      master,
      visualDirection,
    },
    brief,
    variant: targetVariant,
    company: resolved.company,
    product: resolved.product,
    brand: resolved.company.brand,
    resolvedBrand: resolved.resolvedBrand,
    contextVersions: { company: resolved.versions.company, product: resolved.versions.product },
    ai: execution,
  }
  const inputHash = brandRelevantInputHash(relevantSnapshot)
  const snapshot: Record<string, unknown> = {
    request: { actorId, contentId, path: `/api/contents/${contentId}/brand-check`, ifMatch: expectedVersion, body: { platform } },
    content: {
      id: content.id,
      version: content.version,
      editorialRevision: content.editorialRevision,
      masterRevision: content.masterRevision,
      editorialStage: content.editorialStage,
      designStatus: content.designStatus,
    },
    brief,
    master,
    visualDirection,
    variant: targetVariant,
    company: resolved.company,
    product: resolved.product,
    brand: resolved.company.brand,
    resolvedBrand: resolved.resolvedBrand,
    contextVersions: { company: resolved.versions.company, product: resolved.versions.product },
    ai: execution,
  }
  const idempotencyHash = requestHash({
    companyId,
    actorId,
    operation: M4_BRAND_CHECK_OPERATION,
    path: `/api/contents/${contentId}/brand-check`,
    contentId,
    platform,
    targetVariantId: target.id,
    body: { platform },
    ifMatch: expectedVersion,
    inputHash,
    promptVersionId: prompt.id,
    model,
    language,
    mode,
  })
  const rate = await selectRate(tx, model)
  return {
    aiRequestId: '',
    contentId,
    targetVariantId: target.id,
    targetVariantRevision: target.revision,
    platform,
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
    userPrompt: comparisonOnly ? '' : renderM4DataPrompt({
      company: resolved.company,
      product: resolved.product,
      brand: resolved.company.brand,
      brief,
      master,
      visualDirection,
      variant: targetVariant,
      platform: { code: platform },
      execution,
    }),
    rate,
  }
}

async function finalizeBrandCheck(
  prisma: PrismaClient,
  prepared: PreparedBrandCheck,
  output: M4Output,
  providerResult: AiProviderResult,
  latencyMs: number,
  companyId: string,
  actorId: string,
  requestId: string,
  idempotencyKey: string,
  config: AppConfig,
  provider: AiProvider,
) {
  return prisma.$transaction(async (tx) => {
    await lockContent(tx, companyId, prepared.contentId)
    const aggregate = await getContentAggregate(tx, companyId, prepared.contentId)
    const reviewFreshness = await assessmentFreshness(tx, companyId, aggregate, config)
    const reviewLocked = await approvalIsCurrent(tx, companyId, aggregate, reviewFreshness)
    const target = await tx.platformVariant.findFirst({ where: { id: prepared.targetVariantId, contentId: prepared.contentId } })
    const aggregateTarget = aggregate.variants.find((variant) => variant.id === prepared.targetVariantId)
    const currentInput = target
      ? await buildBrandCheckInput(tx, config, provider, companyId, actorId, prepared.contentId, prepared.contentVersion, prepared.platform, true).catch(() => null)
      : null
    // Approval can be accepted while an already-prepared M4 call is in flight.
    // Treat that review lock as input drift so the late assessment cannot
    // replace the evidence the approval was bound to.
    const stale = reviewLocked || Boolean(aggregateTarget?.publication) || !target || !currentInput || currentInput.inputHash !== prepared.inputHash
    const usage = usageForDb(providerResult)
    if (stale) {
      await tx.aiRequestLog.update({ where: { id: prepared.aiRequestId }, data: {
        status: 'stale', completedAt: new Date(), latencyMs,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        providerRequestId: providerResult.providerRequestId,
        errorCode: 'INPUT_CHANGED', errorMessage: 'The relevant brand-check inputs changed while the AI request was running.',
      } })
      return { stale: true as const, result: null }
    }

    const assessment = await tx.brandAssessment.create({
      data: {
        variantId: target.id,
        variantRevision: target.revision,
        inputHash: prepared.inputHash,
        aiRequestId: prepared.aiRequestId,
        score: output.score,
        result: output.status,
        recommendation: output.recommendation,
        checks: toJson(output.checks),
      },
    })
    await tx.platformVariant.update({ where: { id: target.id }, data: { currentAssessmentId: assessment.id } })
    await tx.content.update({ where: { id: prepared.contentId }, data: { version: { increment: 1 } } })
    await tx.contentEvent.create({
      data: {
        contentId: prepared.contentId,
        variantId: target.id,
        actorId,
        actorKind: 'user',
        eventType: 'ai_brand_checked',
        metadata: toJson({
          aiRequestId: prepared.aiRequestId,
          assessmentId: assessment.id,
          promptVersionId: prepared.promptVersionId,
          platform: prepared.platform,
          variantId: target.id,
          score: output.score,
          result: output.status,
          module: M4_MODULE,
          operation: M4_OPERATION,
        }),
        requestId,
      },
    })
    const estimatedCost = calculateCost(usage, prepared.rate)
    await tx.aiRequestLog.update({ where: { id: prepared.aiRequestId }, data: {
      status: 'success', completedAt: new Date(), latencyMs,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      estimatedCostUsd: estimatedCost, providerRequestId: providerResult.providerRequestId,
    } })
    const content = await readContentFromDb(tx, companyId, prepared.contentId, config)
    const log = await tx.aiRequestLog.findUnique({ where: { id: prepared.aiRequestId }, include: { promptVersion: true } })
    if (!log) throw conflict('AI request evidence could not be finalized.')
    const body: BrandCheckResponse = { data: { content, request: mapAiRequest(log) } }
    const operation = `${M4_BRAND_CHECK_OPERATION}:${prepared.contentId}`
    await tx.requestIdempotency.update({
      where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } },
      data: { responseStatus: 200, responseBody: toJson(body), resourceId: prepared.contentId, responseEtag: `"${content.version}"` },
    })
    return { stale: false as const, result: { status: 200, body, etag: `"${content.version}"`, replay: false } }
  })
}

async function finalizeFailedRequest(
  prisma: PrismaClient,
  aiRequestId: string,
  failure: { code: string; message: string },
  latencyMs: number,
  providerResult: AiProviderResult | null,
  providerRequestId: string | null = null,
) {
  const usage = providerResult ? usageForDb(providerResult) : { inputTokens: null, outputTokens: null }
  await prisma.aiRequestLog.update({ where: { id: aiRequestId }, data: {
    status: 'failed', completedAt: new Date(), errorCode: failure.code, errorMessage: failure.message,
    latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    providerRequestId: providerRequestId ?? providerResult?.providerRequestId ?? null,
  } })
}

async function resolveExisting(prisma: PrismaClient, existing: ExistingBrandCheckRecord, intent: BrandCheckIntent, config: AppConfig, provider: AiProvider) {
  const log = existing.aiRequestId ? await prisma.aiRequestLog.findUnique({ where: { id: existing.aiRequestId } }) : null
  if (!log || !sameIntent(log.inputSnapshot, intent)) throw idempotencyConflict()
  if (log.status === 'pending') throw requestInProgress(log.id)
  if (log.status === 'success' && isResponseBody(existing.responseBody)) {
    const current = await buildBrandCheckInput(prisma, config, provider, log.companyId, intent.actorId, intent.contentId, intent.expectedVersion, intent.platform, true)
    if (current.idempotencyHash !== existing.requestHash) throw idempotencyConflict()
    return { replay: true as const, status: existing.responseStatus, body: existing.responseBody as BrandCheckResponse, etag: existing.responseEtag }
  }
  throw idempotencyConflict()
}

async function resolveExistingInTransaction(tx: Prisma.TransactionClient, existing: ExistingBrandCheckRecord, intent: BrandCheckIntent, expectedHash: string) {
  if (existing.requestHash !== expectedHash) throw idempotencyConflict()
  const log = existing.aiRequestId ? await tx.aiRequestLog.findUnique({ where: { id: existing.aiRequestId } }) : null
  if (!log || !sameIntent(log.inputSnapshot, intent)) throw idempotencyConflict()
  if (log.status === 'pending') throw requestInProgress(log.id)
  if (log.status === 'success' && isResponseBody(existing.responseBody)) {
    return { replay: true as const, status: existing.responseStatus, body: existing.responseBody as BrandCheckResponse, etag: existing.responseEtag }
  }
  throw idempotencyConflict()
}

class ExistingBrandCheckReplay extends Error {
  constructor(public readonly result: { replay: boolean; status: number; body: BrandCheckResponse; etag: string | null }) {
    super('Existing M4 brand-check request.')
  }
}

async function lockContent(tx: Prisma.TransactionClient, companyId: string, contentId: string, expectedVersion?: number) {
  const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT "id", "version" FROM "contents"
    WHERE "id" = CAST(${contentId} AS UUID) AND "company_id" = CAST(${companyId} AS UUID)
    FOR UPDATE
  `
  const row = rows[0]
  if (!row) throw notFound()
  if (expectedVersion !== undefined && row.version !== expectedVersion) throw revisionConflict()
  return row
}

async function selectRate(tx: Prisma.TransactionClient, model: string): Promise<RateSelection | null> {
  const row = await tx.aiRateVersion.findFirst({ where: { provider: AI_PROVIDER, model, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' } })
  if (!row) return null
  return { id: row.id, version: row.version, inputUsdPerMillion: row.inputUsdPerMillion.toString(), outputUsdPerMillion: row.outputUsdPerMillion.toString() }
}

async function assertBriefReady(tx: Prisma.TransactionClient, contextType: string, productId: string | null, brief: { pillarCode: string; objective: string; targetAudience: string; topic: string }) {
  if (!brief.targetAudience.trim()) throw inputNotReady(['brief.targetAudience'])
  if (!brief.topic.trim()) throw inputNotReady(['brief.topic'])
  const pillar = await tx.contentPillar.findFirst({ where: { code: brief.pillarCode, active: true }, select: { code: true } })
  if (!pillar) throw inputNotReady(['brief.pillarCode'])
  if (!['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'].includes(brief.objective)) throw inputNotReady(['brief.objective'])
  if (contextType === 'company' && productId !== null) throw inputNotReady(['brief.productId'])
  if (contextType === 'product' && !productId) throw inputNotReady(['brief.productId'])
}

function parseMaster(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['body', 'coreMessage', 'cta', 'hook', 'title'])) return null
  const fields = ['title', 'coreMessage', 'hook', 'body', 'cta'] as const
  if (!fields.every((field) => typeof record[field] === 'string' && Boolean((record[field] as string).trim()))) return null
  return { title: record.title as string, coreMessage: record.coreMessage as string, hook: record.hook as string, body: record.body as string, cta: record.cta as string }
}

function parseVisualDirection(value: Prisma.JsonValue | null) {
  if (value === null) return null
  if (!isRecord(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['concept', 'format', 'notes', 'structure'])) return null
  if (typeof record.format !== 'string' || typeof record.concept !== 'string' || typeof record.notes !== 'string' || !Array.isArray(record.structure) || record.structure.some((item) => typeof item !== 'string')) return null
  return { format: record.format, concept: record.concept, structure: record.structure as string[], notes: record.notes }
}

function sameIntent(snapshot: unknown, intent: BrandCheckIntent) {
  if (!isRecord(snapshot) || !isRecord(snapshot.request)) return false
  const request = snapshot.request
  if (request.actorId !== intent.actorId || request.contentId !== intent.contentId || request.ifMatch !== intent.expectedVersion) return false
  if (!isRecord(request.body)) return false
  return request.body.platform === intent.platform && Object.keys(request.body).length === 1
}

function isResponseBody(value: unknown): value is BrandCheckResponse {
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
