import { Prisma, type PrismaClient } from '@prisma/client'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import { aiNotConfigured, aiOutputInvalid, aiProviderError, aiTimeout, notFound, rateLimited, requestInProgress, validationError, AppError } from '../../shared/errors/AppError.js'
import { requestHash, type UnknownRecord } from '../context/normalize.js'
import type { AssetStorage } from '../assets/storage.js'
import { CREATIVE_REFERENCE_CONCEPT_OPERATION, CREATIVE_REFERENCE_IMAGE_OPERATION, CREATIVE_REFERENCE_MODULE, CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, CREATIVE_REFERENCE_PROMPT_REFERENCE, CREATIVE_REFERENCE_PROMPT_VERSION } from '../ai/constants.js'
import { AiProviderFailure, type AiImageProvider, type AiProvider } from '../ai/provider.js'

export const CREATIVE_REFERENCE_PLATFORMS = ['instagram', 'linkedin'] as const
export const CREATIVE_REFERENCE_STYLES = ['modern_minimal', 'corporate', 'editorial', 'bold_typography', 'product_ui_focused', 'abstract_technology'] as const
export const CREATIVE_REFERENCE_MOODS = ['professional', 'confident', 'approachable', 'innovative', 'clean'] as const
export const CREATIVE_REFERENCE_ASPECT_RATIOS = ['portrait_4_5', 'square_1_1', 'landscape'] as const
export type CreativeReferencePlatform = typeof CREATIVE_REFERENCE_PLATFORMS[number]
export type CreativeReferenceStyle = typeof CREATIVE_REFERENCE_STYLES[number]
export type CreativeReferenceMood = typeof CREATIVE_REFERENCE_MOODS[number]
export type CreativeReferenceAspectRatio = typeof CREATIVE_REFERENCE_ASPECT_RATIOS[number]

const SIZE_BY_ASPECT: Record<CreativeReferenceAspectRatio, '1024x1024' | '1024x1536' | '1536x1024'> = {
  portrait_4_5: '1024x1536',
  square_1_1: '1024x1024',
  landscape: '1536x1024',
}

const CONCEPT_SYSTEM_PROMPT = `You are the Shifd visual concept planner. Create exactly three meaningfully different visual reference concepts for a human designer. These are design references, not final creatives. Prefer different compositions such as workflow visualization, before-and-after, and product/interface-inspired layouts. Avoid fake logos, third-party brand assets, and long rendered typography. Return only the requested JSON schema.`

export interface CreativeReferenceInput {
  platform: CreativeReferencePlatform
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
}

interface Concept {
  conceptName: string
  rationale: string
  layoutNotes: string
  visualFocus: string
  typographyDirection: string
  imagePrompt: string
}

export interface CreativeReferenceDto {
  id: string
  conceptIndex: number
  conceptName: string
  rationale: string
  layoutNotes: string
  visualFocus: string
  typographyDirection: string
  imageUrl: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  selected: boolean
  selectedAt: string | null
  createdAt: string
}

export interface CreativeReferenceBatchDto {
  id: string
  contentId: string
  platform: CreativeReferencePlatform
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  requestedAspectRatio: CreativeReferenceAspectRatio
  actualGeneratedSize: string
  additionalInstruction: string | null
  status: string
  createdAt: string
  completedAt: string | null
  references: CreativeReferenceDto[]
}

type Db = PrismaClient | Prisma.TransactionClient

export async function createCreativeReferenceBatch(
  prisma: PrismaClient,
  config: AppConfig,
  provider: AiProvider,
  imageProvider: AiImageProvider,
  storage: AssetStorage,
  companyId: string,
  actorId: string,
  contentId: string,
  input: CreativeReferenceInput,
  idempotencyKey: string,
) {
  const operation = `creative-references.create:${contentId}`
  const existing = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } } })
  if (existing) {
    if (existing.responseStatus === 202) throw requestInProgress(existing.resourceId)
    return { status: existing.responseStatus, body: existing.responseBody as unknown as { data: { batch: CreativeReferenceBatchDto } } }
  }

  const content = await loadPlannerContext(prisma, companyId, contentId)
  const settings = await prisma.aiSettings.findUnique({ where: { companyId } })
  if (!settings) throw aiNotConfigured()
  const textModel = settings.modelId ?? config.openaiModel
  if (!textModel || (provider.isConfigured && !provider.isConfigured(textModel))) throw aiNotConfigured()
  const imageModel = config.openaiImageModel ?? 'gpt-image-2'
  if (imageProvider.isConfigured && !imageProvider.isConfigured(imageModel)) throw aiNotConfigured()
  const size = SIZE_BY_ASPECT[input.aspectRatio]
  const snapshot = buildSnapshot(content, input)
  const inputHash = requestHash(snapshot)
  const promptVersion = await ensurePromptVersion(prisma, requestHash(CONCEPT_SYSTEM_PROMPT))
  const batchId = randomUUID()
  const plannerLogId = randomUUID()

  try {
    await prisma.$transaction(async (tx) => {
      await tx.aiRequestLog.create({ data: aiLogData({ id: plannerLogId, companyId, contentId, actorId, promptVersionId: promptVersion.id, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, model: textModel, mode: settings.mode, language: settings.generationLanguage, inputHash, snapshot }) })
      await tx.creativeReferenceBatch.create({
        data: { id: batchId, contentId, companyId, platform: input.platform, style: input.style, mood: input.mood, requestedAspectRatio: input.aspectRatio, actualGeneratedSize: size, additionalInstruction: input.additionalInstruction, status: 'pending', conceptPlannerAiRequestLogId: plannerLogId },
      })
      await tx.requestIdempotency.create({
        data: { companyId, operation, key: idempotencyKey, requestHash: requestHash({ input, contentId }), responseStatus: 202, responseBody: {}, resourceId: batchId },
      })
    })
  } catch (error) {
    if (isUnique(error)) {
      const raced = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } } })
      if (raced?.responseStatus === 202) throw requestInProgress(raced.resourceId)
    }
    throw error
  }

  let concepts: Concept[]
  const plannerStarted = Date.now()
  try {
    const result = await provider.generate({ model: textModel, outputSchemaVersion: CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, systemPrompt: CONCEPT_SYSTEM_PROMPT, userPrompt: renderPlannerPrompt(snapshot), maxOutputTokens: config.aiMaxOutputTokens, timeoutMs: config.aiRequestTimeoutMs })
    concepts = parseCreativeReferenceConcepts(result.text)
    await prisma.aiRequestLog.update({ where: { id: plannerLogId }, data: { inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null, latencyMs: Date.now() - plannerStarted, status: 'success', providerRequestId: result.providerRequestId, completedAt: new Date() } })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await markFailed(prisma, batchId, plannerLogId, failure, Date.now() - plannerStarted)
    await prisma.requestIdempotency.deleteMany({ where: { companyId, operation, key: idempotencyKey } })
    throw failure
  }

  const references: CreativeReferenceDto[] = []
  for (const [conceptIndex, concept] of concepts.entries()) {
    const imageLogId = randomUUID()
    const imageSnapshot = { batchId, contentId, platform: input.platform, style: input.style, mood: input.mood, aspectRatio: input.aspectRatio, size, conceptIndex, conceptName: concept.conceptName, imagePrompt: concept.imagePrompt }
    await prisma.aiRequestLog.create({ data: aiLogData({ id: imageLogId, companyId, contentId, actorId, promptVersionId: promptVersion.id, operation: CREATIVE_REFERENCE_IMAGE_OPERATION, model: imageModel, mode: settings.mode, language: settings.generationLanguage, inputHash: requestHash(imageSnapshot), snapshot: imageSnapshot }) })
    const started = Date.now()
    try {
      const result = await imageProvider.generateImage({ model: imageModel, prompt: buildImagePrompt(concept, content, input), quality: config.openaiImageQuality ?? 'medium', size, outputFormat: 'png', timeoutMs: config.aiRequestTimeoutMs })
      const buffer = decodeImage(result.base64)
      const temp = await storage.writeTemp(Readable.from(buffer), config.assetMaxBytes)
      let storageKey: string | null = null
      try {
        const inspected = await storage.inspectImage(temp.key)
        if (inspected.mimeType !== 'image/png') throw new Error('Generated reference is not PNG.')
        storageKey = await storage.promote(temp.key)
        const row = await prisma.creativeReference.create({ data: { id: randomUUID(), batchId, conceptIndex, conceptName: concept.conceptName, rationale: concept.rationale, layoutNotes: concept.layoutNotes, visualFocus: concept.visualFocus, typographyDirection: concept.typographyDirection, imagePrompt: concept.imagePrompt, storageKey, mimeType: inspected.mimeType, fileSize: BigInt(buffer.byteLength), width: inspected.width, height: inspected.height, imageAiRequestLogId: imageLogId } })
        references.push(mapReference(row, contentId, input.platform))
        storageKey = null
        await prisma.aiRequestLog.update({ where: { id: imageLogId }, data: { inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null, latencyMs: Date.now() - started, status: 'success', providerRequestId: result.providerRequestId, completedAt: new Date() } })
      } finally {
        await storage.discardTemp(temp.key).catch(() => undefined)
        if (storageKey) await storage.delete(storageKey).catch(() => undefined)
      }
    } catch (error) {
      const failure = mapProviderFailure(error)
      await prisma.aiRequestLog.update({ where: { id: imageLogId }, data: { latencyMs: Date.now() - started, status: 'failed', errorCode: failure.code, errorMessage: failure.message, providerRequestId: error instanceof AiProviderFailure ? error.providerRequestId : null, completedAt: new Date() } }).catch(() => undefined)
    }
  }

  const status = references.length === 3 ? 'completed' : references.length > 0 ? 'partial' : 'failed'
  const completedAt = new Date()
  await prisma.creativeReferenceBatch.update({ where: { id: batchId }, data: { status, completedAt } })
  if (status === 'failed') {
    await prisma.requestIdempotency.deleteMany({ where: { companyId, operation, key: idempotencyKey } })
    throw aiProviderError()
  }
  const dto = await readBatch(prisma, companyId, contentId, batchId)
  const body = { data: { batch: dto } }
  await prisma.requestIdempotency.update({ where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } }, data: { responseStatus: 201, responseBody: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue, resourceId: batchId } })
  return { status: 201, body }
}

export async function listCreativeReferenceBatches(prisma: PrismaClient, companyId: string, contentId: string) {
  await assertContent(prisma, companyId, contentId)
  const rows = await prisma.creativeReferenceBatch.findMany({ where: { companyId, contentId }, include: { references: { orderBy: { conceptIndex: 'asc' } } }, orderBy: { createdAt: 'desc' } })
  return rows.map((row) => mapBatch(row, contentId))
}

export async function selectCreativeReference(prisma: PrismaClient, companyId: string, contentId: string, referenceId: string) {
  const target = await prisma.creativeReference.findFirst({ where: { id: referenceId, batch: { companyId, contentId } }, include: { batch: true } })
  if (!target) throw notFound()
  await prisma.$transaction(async (tx) => {
    await tx.creativeReference.updateMany({ where: { batch: { companyId, contentId, platform: target.batch.platform } }, data: { selectedAt: null } })
    await tx.creativeReference.update({ where: { id: referenceId }, data: { selectedAt: new Date() } })
  })
  return readBatch(prisma, companyId, contentId, target.batchId)
}

export async function openCreativeReference(prisma: PrismaClient, storage: AssetStorage, companyId: string, contentId: string, referenceId: string) {
  const row = await prisma.creativeReference.findFirst({ where: { id: referenceId, batch: { companyId, contentId } } })
  if (!row) throw notFound()
  return { row, stream: await storage.read(row.storageKey) }
}

async function readBatch(prisma: PrismaClient, companyId: string, contentId: string, batchId: string) {
  const row = await prisma.creativeReferenceBatch.findFirst({ where: { id: batchId, companyId, contentId }, include: { references: { orderBy: { conceptIndex: 'asc' } } } })
  if (!row) throw notFound()
  return mapBatch(row, contentId)
}

function mapBatch(row: any, contentId: string): CreativeReferenceBatchDto {
  return { id: row.id, contentId, platform: row.platform, style: row.style, mood: row.mood, requestedAspectRatio: row.requestedAspectRatio, actualGeneratedSize: row.actualGeneratedSize, additionalInstruction: row.additionalInstruction, status: row.status, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, references: row.references.map((reference: any) => mapReference(reference, contentId, row.platform)) }
}

function mapReference(row: any, contentId: string, platform: string): CreativeReferenceDto {
  return { id: row.id, conceptIndex: row.conceptIndex, conceptName: row.conceptName, rationale: row.rationale, layoutNotes: row.layoutNotes, visualFocus: row.visualFocus, typographyDirection: row.typographyDirection, imageUrl: `/api/contents/${contentId}/creative-references/${row.id}/image`, mimeType: row.mimeType, fileSize: Number(row.fileSize), width: row.width, height: row.height, selected: Boolean(row.selectedAt), selectedAt: row.selectedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }
}

async function assertContent(prisma: PrismaClient, companyId: string, contentId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, companyId }, select: { id: true } })
  if (!content) throw notFound()
}

async function loadPlannerContext(prisma: PrismaClient, companyId: string, contentId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, companyId }, include: { brief: true, variants: { select: { platform: true, enabled: true, copy: true, cta: true, hashtags: true, visualRecommendation: true } }, product: { include: { profile: true } }, company: { include: { brandProfile: true } } } })
  if (!content) throw notFound()
  return content
}

function buildSnapshot(content: any, input: CreativeReferenceInput) {
  const company = content.company
  const product = content.product
  const variant = content.variants.find((item: any) => item.platform === input.platform)
  return { company: { name: company.name, positioning: company.positioning, valueProposition: company.coreValueProposition, differentiators: company.differentiators, customerSegments: company.customerSegments, decisionMakers: company.decisionMakers, painPoints: company.painPoints, brandVoice: company.brandProfile?.brandVoice, tone: company.brandProfile?.toneDescription }, product: product ? { name: product.name, description: product.description, valueProposition: product.profile?.valueProposition, positioning: product.profile?.positioning, targetUsers: product.profile?.targetUsers, targetOrganizations: product.profile?.targetOrganizations } : null, campaign: { brief: content.brief, master: content.masterContent, visualDirection: content.visualDirection, platform: input.platform, variant, style: input.style, mood: input.mood, aspectRatio: input.aspectRatio, additionalInstruction: input.additionalInstruction } }
}

function renderPlannerPrompt(snapshot: UnknownRecord) {
  return `Create exactly three distinct visual concepts from this concise canonical context. Every concept must be usable as a Canva reference and must differ in composition or idea, not just color.\n${JSON.stringify(snapshot)}`
}

function buildImagePrompt(concept: Concept, content: any, input: CreativeReferenceInput) {
  return `Design reference mockup for ${input.platform}, ${input.style} style, ${input.mood} mood, ${input.aspectRatio} format. ${concept.imagePrompt} Campaign context: ${content.brief?.topic ?? 'B2B campaign'} for ${content.company.name}. Use clear hierarchy, generous whitespace, professional B2B composition, and short placeholder-like typography only. Do not render long copy, do not create a logo, and do not use third-party brand assets. This is an inspiration reference for a founder to recreate manually in Canva, not a final publication asset.`
}

export function parseCreativeReferenceConcepts(text: string): Concept[] {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw aiOutputInvalid() }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as any).concepts) || (value as any).concepts.length !== 3) throw aiOutputInvalid('The visual concept planner must return exactly three concepts.')
  const concepts = (value as { concepts: unknown[] }).concepts.map((raw: unknown): Concept => {
    const concept = raw as Record<string, unknown>
    const required = ['conceptName', 'rationale', 'layoutNotes', 'visualFocus', 'typographyDirection', 'imagePrompt']
    if (!concept || typeof concept !== 'object' || required.some((key) => typeof concept[key] !== 'string' || !(concept[key] as string).trim())) throw aiOutputInvalid()
    return Object.fromEntries(required.map((key) => [key, (concept[key] as string).trim()])) as unknown as Concept
  })
  const names = new Set(concepts.map((concept) => concept.conceptName.toLowerCase()))
  const compositions = new Set(concepts.map((concept) => `${concept.layoutNotes.toLowerCase()}|${concept.visualFocus.toLowerCase()}`))
  if (names.size !== 3 || compositions.size !== 3) throw aiOutputInvalid('The visual concepts must be meaningfully different.')
  return concepts
}

async function ensurePromptVersion(prisma: PrismaClient, digest: string) {
  const existing = await prisma.promptVersion.findUnique({ where: { module_version: { module: CREATIVE_REFERENCE_MODULE, version: CREATIVE_REFERENCE_PROMPT_VERSION } } })
  if (existing) {
    if (existing.operation !== CREATIVE_REFERENCE_CONCEPT_OPERATION || existing.module !== CREATIVE_REFERENCE_MODULE || existing.version !== CREATIVE_REFERENCE_PROMPT_VERSION || existing.templateReference !== CREATIVE_REFERENCE_PROMPT_REFERENCE || existing.templateDigest !== digest || existing.outputSchemaVersion !== CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION) {
      throw new Error('The existing Creative Reference prompt metadata does not match the canonical M2 prompt identity.')
    }
    if (existing.status !== 'active') return prisma.promptVersion.update({ where: { id: existing.id }, data: { status: 'active' } })
    return existing
  }
  try {
    return await prisma.promptVersion.create({ data: { module: CREATIVE_REFERENCE_MODULE, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, version: CREATIVE_REFERENCE_PROMPT_VERSION, status: 'active', templateReference: CREATIVE_REFERENCE_PROMPT_REFERENCE, templateDigest: digest, outputSchemaVersion: CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION } })
  } catch (error) {
    if (isUnique(error)) {
      const raced = await prisma.promptVersion.findUniqueOrThrow({ where: { module_version: { module: CREATIVE_REFERENCE_MODULE, version: CREATIVE_REFERENCE_PROMPT_VERSION } } })
      if (raced.operation !== CREATIVE_REFERENCE_CONCEPT_OPERATION || raced.templateReference !== CREATIVE_REFERENCE_PROMPT_REFERENCE || raced.templateDigest !== digest || raced.outputSchemaVersion !== CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION) throw new Error('The concurrent Creative Reference prompt metadata does not match the canonical M2 prompt identity.')
      return raced.status === 'active' ? raced : prisma.promptVersion.update({ where: { id: raced.id }, data: { status: 'active' } })
    }
    throw error
  }
}

function aiLogData(input: { id: string; companyId: string; contentId: string; actorId: string; promptVersionId: string; operation: string; model: string; mode: string; language: string; inputHash: string; snapshot: unknown }) {
  return { id: input.id, companyId: input.companyId, contentId: input.contentId, variantId: null, requestedBy: input.actorId, promptVersionId: input.promptVersionId, module: CREATIVE_REFERENCE_MODULE, operation: input.operation, provider: 'openai', model: input.model, mode: input.mode, language: input.language, editorialRevision: null, variantRevision: null, inputHash: input.inputHash, inputSnapshot: input.snapshot as Prisma.InputJsonValue, inputTokens: null, outputTokens: null, estimatedCostUsd: null, costBasis: Prisma.DbNull, latencyMs: null, status: 'pending', errorCode: null, errorMessage: null, providerRequestId: null }
}

async function markFailed(prisma: PrismaClient, batchId: string, logId: string, failure: AppError, latencyMs: number) {
  await prisma.aiRequestLog.update({ where: { id: logId }, data: { latencyMs, status: 'failed', errorCode: failure.code, errorMessage: failure.message, completedAt: new Date() } }).catch(() => undefined)
  await prisma.creativeReferenceBatch.update({ where: { id: batchId }, data: { status: 'failed', completedAt: new Date() } }).catch(() => undefined)
}

function decodeImage(base64: string) {
  const normalized = base64.replace(/^data:image\/png;base64,/, '')
  const buffer = Buffer.from(normalized, 'base64')
  if (!buffer.length) throw aiOutputInvalid('The image provider returned invalid image data.')
  return buffer
}

function mapProviderFailure(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof AiProviderFailure) {
    if (error.kind === 'not_configured') return aiNotConfigured()
    if (error.kind === 'timeout') return aiTimeout()
    if (error.kind === 'rate_limit') return rateLimited('The AI provider rate limit was reached. Try again intentionally later.')
    if (error.kind === 'invalid_response') return aiOutputInvalid()
  }
  return aiProviderError()
}

function isUnique(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' }
