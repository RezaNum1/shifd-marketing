import { Prisma, type PrismaClient } from '@prisma/client'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { AppConfig } from '../../config/env.js'
import { aiNotConfigured, aiOutputInvalid, aiProviderError, aiTimeout, notFound, rateLimited, validationError, AppError } from '../../shared/errors/AppError.js'
import { requestHash, type UnknownRecord } from '../context/normalize.js'
import type { AssetStorage } from '../assets/storage.js'
import { CREATIVE_REFERENCE_CONCEPT_OPERATION, CREATIVE_REFERENCE_IMAGE_OPERATION, CREATIVE_REFERENCE_MODULE, CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, CREATIVE_REFERENCE_PROMPT_REFERENCE, CREATIVE_REFERENCE_PROMPT_VERSION } from '../ai/constants.js'
import { AiProviderFailure, type AiImageProvider, type AiProvider } from '../ai/provider.js'
import { aiExecution } from '../ai/provider.js'
import { normalizeAiText } from '../ai/output.js'

export const CREATIVE_REFERENCE_PLATFORMS = ['instagram', 'linkedin'] as const
export const CREATIVE_REFERENCE_STYLES = ['modern_minimal', 'corporate', 'editorial', 'bold_typography', 'product_ui_focused', 'abstract_technology'] as const
export const CREATIVE_REFERENCE_MOODS = ['professional', 'confident', 'approachable', 'innovative', 'clean'] as const
export const CREATIVE_REFERENCE_ASPECT_RATIOS = ['portrait_4_5', 'square_1_1', 'landscape'] as const
export const CREATIVE_REFERENCE_FORMATS = ['single_image', 'carousel'] as const
export type CreativeReferencePlatform = typeof CREATIVE_REFERENCE_PLATFORMS[number]
export type CreativeReferenceStyle = typeof CREATIVE_REFERENCE_STYLES[number]
export type CreativeReferenceMood = typeof CREATIVE_REFERENCE_MOODS[number]
export type CreativeReferenceAspectRatio = typeof CREATIVE_REFERENCE_ASPECT_RATIOS[number]
export type CreativeReferenceFormat = 'single_image' | 'carousel'
export const CREATIVE_REFERENCE_SLIDE_COUNT_RANGE = { min: 2, max: 10 } as const

const SIZE_BY_ASPECT: Record<CreativeReferenceAspectRatio, '1024x1024' | '1024x1536' | '1536x1024'> = {
  portrait_4_5: '1024x1536',
  square_1_1: '1024x1024',
  landscape: '1536x1024',
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CONCEPT_SYSTEM_PROMPT = `You are the Shifd Labs Canva design director. Follow Shifd Labs' modern minimalist tech-corporate direction: professional B2B SaaS, clear message hierarchy, generous whitespace, bold readable typography, consistent margins/alignment, restrained tech accents, and one relevant focal asset. Brand: Shifd Labs, tagline "Prepare for the next shift." Palette: #1363DF primary blue, #3279E7 secondary blue, #E2EDFF light blue, #FFFFFF white, #151B2D dark navy. Use Inter for headlines/body/UI; DM Serif Text only for an optional editorial accent. Suggest Canva asset search terms and concrete manually reproducible design steps. Keep supporting assets around 30% of each slide as a flexible guide. Avoid generic corporate illustrations, cartoons, robot imagery, clutter, fake logos, third-party brands, invented features, testimonials, metrics, and long text rendered into images. For product showcases, use an authentic product screenshot only if supplied; never invent product UI. Use only facts and message content in the provided context. Do not use the em dash punctuation mark (Unicode U+2014) in any generated text. Use commas, periods, colons, parentheses, or a regular hyphen instead. Return only the requested JSON schema.`

export interface CreativeReferenceInput {
  platform: CreativeReferencePlatform
  format: CreativeReferenceFormat
  slideCount: number
  style: CreativeReferenceStyle
  mood: CreativeReferenceMood
  aspectRatio: CreativeReferenceAspectRatio
  additionalInstruction: string | null
}

interface Concept {
  conceptName: string
  templateType: 'educational' | 'product_showcase' | 'process_insight' | 'process_carousel'
  rationale: string
  layoutNotes: string
  visualFocus: string
  typographyDirection: string
  canvaBrief: string
  assetSearchKeywords: string[]
  carouselOutline: string[]
  slideNumber: number
  slideCopy: string
  imagePrompt: string
}

export interface CreativeReferenceDto {
  id: string
  conceptIndex: number
  conceptName: string
  templateType: Concept['templateType'] | null
  slideNumber: number | null
  slideCopy: string | null
  rationale: string
  layoutNotes: string
  visualFocus: string
  typographyDirection: string
  canvaBrief: string | null
  assetSearchKeywords: string[]
  carouselOutline: string[]
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
  creativeFormat: CreativeReferenceFormat
  expectedReferenceCount: number
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
  onImageFailure?: (details: { batchId: string; slideNumber: number | null; stage: string; errorType: string; errorMessage: string; providerRequestId: string | null }) => void,
  onBatchFailure?: (details: { batchId: string; errorType: string; errorCode: string; errorMessage: string }) => void,
) {
  const operation = `creative-references.create:${contentId}`
  const existing = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } } })
  if (existing) {
    if (existing.responseStatus === 202) {
      const batch = await readBatch(prisma, companyId, contentId, existing.resourceId)
      return { status: 202, body: { data: { batch } } }
    }
    return { status: existing.responseStatus, body: existing.responseBody as unknown as { data: { batch: CreativeReferenceBatchDto } } }
  }

  const content = await loadPlannerContext(prisma, companyId, contentId)
  const settings = await prisma.aiSettings.findUnique({ where: { companyId } })
  if (!settings) throw aiNotConfigured()
  const textModel = aiExecution(provider, settings.modelId ?? config.openaiModel ?? '').model
  if (!textModel || (provider.isConfigured && !provider.isConfigured(textModel))) throw aiNotConfigured()
  const imageModel = aiExecution(imageProvider, config.openaiImageModel ?? 'gpt-image-2.5-sunburst').model
  if (imageProvider.isConfigured && !imageProvider.isConfigured(imageModel)) throw aiNotConfigured()
  const size = SIZE_BY_ASPECT[input.aspectRatio]
  const expectedReferenceCount = input.format === 'carousel' ? input.slideCount : 3
  const snapshot = buildSnapshot(content, input)
  const inputHash = requestHash(snapshot)
  const promptVersion = await ensurePromptVersion(prisma, requestHash(CONCEPT_SYSTEM_PROMPT))
  const batchId = randomUUID()
  const plannerLogId = randomUUID()

  try {
    await prisma.$transaction(async (tx) => {
      await tx.aiRequestLog.create({ data: aiLogData({ id: plannerLogId, companyId, contentId, actorId, promptVersionId: promptVersion.id, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, provider: provider.providerId ?? 'openai', model: textModel, mode: provider.executionMode ?? settings.mode, language: settings.generationLanguage, inputHash, snapshot }) })
      await tx.creativeReferenceBatch.create({
        data: { id: batchId, contentId, companyId, platform: input.platform, style: input.style, mood: input.mood, requestedAspectRatio: input.aspectRatio, actualGeneratedSize: size, creativeFormat: input.format, expectedReferenceCount, additionalInstruction: input.additionalInstruction, status: 'pending', conceptPlannerAiRequestLogId: plannerLogId },
      })
      await tx.requestIdempotency.create({
        data: { companyId, operation, key: idempotencyKey, requestHash: requestHash({ input, contentId }), responseStatus: 202, responseBody: {}, resourceId: batchId },
      })
    })
  } catch (error) {
    if (isUnique(error)) {
      const raced = await prisma.requestIdempotency.findUnique({ where: { companyId_operation_key: { companyId, operation, key: idempotencyKey } } })
      if (raced?.responseStatus === 202) {
        const batch = await readBatch(prisma, companyId, contentId, raced.resourceId)
        return { status: 202, body: { data: { batch } } }
      }
    }
    throw error
  }

  // Accept the request once the durable batch row exists. AI generation runs
  // after the HTTP response so reverse proxies do not have to hold a request
  // open for several image generations.
  const initialBatch = await readBatch(prisma, companyId, contentId, batchId)
  const processing = runCreativeReferenceBatch(prisma, config, provider, imageProvider, storage, companyId, actorId, contentId, input, idempotencyKey, operation, batchId, plannerLogId, content, settings, textModel, imageModel, size, expectedReferenceCount, snapshot, promptVersion, onImageFailure)
  void processing.catch(async (error) => {
    const failure = mapProviderFailure(error)
    const errorMessage = safeImageErrorMessage(error)
    try {
      onBatchFailure?.({ batchId, errorType: error instanceof Error ? error.name : typeof error, errorCode: failure.code, errorMessage })
    } catch {
      // Diagnostics must not prevent the worker state from being finalized.
    }
    const completedAt = new Date()
    await Promise.all([
      prisma.aiRequestLog.updateMany({
        where: { id: plannerLogId, status: 'pending' },
        data: { status: 'failed', errorCode: failure.code, errorMessage, completedAt },
      }).catch(() => undefined),
      prisma.creativeReferenceBatch.updateMany({
        where: { id: batchId, status: { in: ['pending', 'processing'] } },
        data: { status: 'failed', completedAt },
      }).catch(() => undefined),
    ])
  })
  return { status: 202, body: { data: { batch: initialBatch } } }
}

async function runCreativeReferenceBatch(
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
  operation: string,
  batchId: string,
  plannerLogId: string,
  content: any,
  settings: any,
  textModel: string,
  imageModel: string,
  size: '1024x1024' | '1024x1536' | '1536x1024',
  expectedReferenceCount: number,
  snapshot: Record<string, unknown>,
  promptVersion: any,
  onImageFailure?: (details: { batchId: string; slideNumber: number | null; stage: string; errorType: string; errorMessage: string; providerRequestId: string | null }) => void,
) {
  await prisma.creativeReferenceBatch.update({ where: { id: batchId }, data: { status: 'processing' } })

  let concepts: Concept[]
  const plannerStarted = Date.now()
  try {
    const result = await provider.generate({ model: textModel, outputSchemaVersion: CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, systemPrompt: CONCEPT_SYSTEM_PROMPT, userPrompt: renderPlannerPrompt(snapshot), maxOutputTokens: input.format === 'carousel' ? config.topicDiscoveryMaxOutputTokens : config.aiMaxOutputTokens, timeoutMs: config.aiRequestTimeoutMs })
    concepts = parseCreativeReferenceConcepts(result.text, input)
    await prisma.aiRequestLog.update({ where: { id: plannerLogId }, data: { inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null, latencyMs: Date.now() - plannerStarted, status: 'success', providerRequestId: result.providerRequestId, completedAt: new Date() } })
  } catch (error) {
    const failure = mapProviderFailure(error)
    await markFailed(prisma, batchId, plannerLogId, failure, Date.now() - plannerStarted)
    await prisma.requestIdempotency.deleteMany({ where: { companyId, operation, key: idempotencyKey } })
    throw failure
  }

  const references: CreativeReferenceDto[] = []
  let lastImageFailure: AppError | null = null
  for (const [conceptIndex, concept] of concepts.entries()) {
    const imageLogId = randomUUID()
    const imageSnapshot = { batchId, contentId, platform: input.platform, format: input.format, slideNumber: concept.slideNumber || null, slideCopy: concept.slideCopy, style: input.style, mood: input.mood, aspectRatio: input.aspectRatio, size, conceptIndex, conceptName: concept.conceptName, imagePrompt: concept.imagePrompt }
    await prisma.aiRequestLog.create({ data: aiLogData({ id: imageLogId, companyId, contentId, actorId, promptVersionId: promptVersion.id, operation: CREATIVE_REFERENCE_IMAGE_OPERATION, provider: imageProvider.providerId ?? 'openai', model: imageModel, mode: imageProvider.executionMode ?? settings.mode, language: settings.generationLanguage, inputHash: requestHash(imageSnapshot), snapshot: imageSnapshot }) })
    const started = Date.now()
    let stage = 'image generation'
      let generatedRequestId: string | null = null
    try {
      stage = 'request and validate image'
      const { result, buffer: rawBuffer } = await generateValidImageWithRetry(imageProvider, { model: imageModel, prompt: buildImagePrompt(concept, content, input), quality: config.openaiImageQuality ?? 'medium', size, outputFormat: 'png', timeoutMs: config.aiRequestTimeoutMs })
      generatedRequestId = result.providerRequestId
      stage = 'resize image'
      const buffer = input.aspectRatio === 'portrait_4_5'
        ? await sharp(rawBuffer).resize(1080, 1350, { fit: 'contain', background: '#FFFFFF' }).png().toBuffer()
        : rawBuffer
      stage = 'write image to temporary storage'
      const temp = await storage.writeTemp(Readable.from(buffer), config.assetMaxBytes)
      let storageKey: string | null = null
      try {
        stage = 'inspect generated image'
        const inspected = await storage.inspectImage(temp.key)
        if (inspected.mimeType !== 'image/png') throw new Error('Generated reference is not PNG.')
        stage = 'promote generated image to storage'
        storageKey = await storage.promote(temp.key)
        stage = 'save generated image metadata'
        const row = await prisma.creativeReference.create({ data: { id: randomUUID(), batchId, conceptIndex, conceptName: concept.conceptName, templateType: concept.templateType, slideNumber: concept.slideNumber || null, slideCopy: concept.slideCopy || null, rationale: concept.rationale, layoutNotes: concept.layoutNotes, visualFocus: concept.visualFocus, typographyDirection: concept.typographyDirection, canvaBrief: concept.canvaBrief, assetSearchKeywords: concept.assetSearchKeywords, carouselOutline: concept.carouselOutline, imagePrompt: concept.imagePrompt, storageKey, mimeType: inspected.mimeType, fileSize: BigInt(buffer.byteLength), width: inspected.width, height: inspected.height, imageAiRequestLogId: imageLogId } })
        references.push(mapReference(row, contentId, input.platform))
        storageKey = null
        await prisma.aiRequestLog.update({ where: { id: imageLogId }, data: { inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null, latencyMs: Date.now() - started, status: 'success', providerRequestId: result.providerRequestId, completedAt: new Date() } })
      } finally {
        await storage.discardTemp(temp.key).catch(() => undefined)
        if (storageKey) await storage.delete(storageKey).catch(() => undefined)
      }
    } catch (error) {
      const failure = mapProviderFailure(error)
      lastImageFailure = failure
      const safeErrorMessage = safeImageErrorMessage(error)
      const errorType = error instanceof Error ? error.name : typeof error
      Object.defineProperty(failure, 'creativeReferenceDiagnostics', {
        value: { stage, errorType, errorMessage: safeErrorMessage, providerRequestId: error instanceof AiProviderFailure ? error.providerRequestId : generatedRequestId },
        enumerable: false,
      })
      onImageFailure?.({ batchId, slideNumber: concept.slideNumber || null, stage, errorType, errorMessage: safeErrorMessage, providerRequestId: error instanceof AiProviderFailure ? error.providerRequestId : generatedRequestId })
      await prisma.aiRequestLog.update({ where: { id: imageLogId }, data: { latencyMs: Date.now() - started, status: 'failed', errorCode: failure.code, errorMessage: `${stage}: ${safeErrorMessage}`, providerRequestId: error instanceof AiProviderFailure ? error.providerRequestId : generatedRequestId, completedAt: new Date() } }).catch(() => undefined)
    }
  }

  const status = references.length === expectedReferenceCount ? 'completed' : references.length > 0 ? 'partial' : 'failed'
  const completedAt = new Date()
  await prisma.creativeReferenceBatch.update({ where: { id: batchId }, data: { status, completedAt } })
  if (status === 'failed') {
    await prisma.requestIdempotency.deleteMany({ where: { companyId, operation, key: idempotencyKey } })
    throw lastImageFailure ?? aiProviderError()
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

export async function recoverInterruptedCreativeReferenceBatches(prisma: PrismaClient) {
  const interrupted = await prisma.creativeReferenceBatch.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: { id: true, conceptPlannerAiRequestLogId: true },
  })
  if (!interrupted.length) return
  const completedAt = new Date()
  await prisma.$transaction([
    prisma.creativeReferenceBatch.updateMany({
      where: { id: { in: interrupted.map((batch) => batch.id) }, status: { in: ['pending', 'processing'] } },
      data: { status: 'failed', completedAt },
    }),
    prisma.aiRequestLog.updateMany({
      where: { id: { in: interrupted.flatMap((batch) => batch.conceptPlannerAiRequestLogId ? [batch.conceptPlannerAiRequestLogId] : []) }, status: 'pending' },
      data: { status: 'failed', errorCode: 'WORKER_INTERRUPTED', errorMessage: 'Generation was interrupted by an application restart.', completedAt },
    }),
  ])
}

export async function selectCreativeReference(prisma: PrismaClient, companyId: string, contentId: string, referenceId: string) {
  const target = await prisma.creativeReference.findFirst({ where: { id: referenceId, batch: { companyId, contentId } }, include: { batch: true } })
  if (!target) throw notFound()
  await prisma.$transaction(async (tx) => {
    await tx.creativeReference.updateMany({ where: { batch: { companyId, contentId, platform: target.batch.platform } }, data: { selectedAt: null } })
    if (target.batch.creativeFormat === 'carousel') {
      await tx.creativeReference.updateMany({ where: { batchId: target.batchId }, data: { selectedAt: new Date() } })
    } else {
      await tx.creativeReference.update({ where: { id: referenceId }, data: { selectedAt: new Date() } })
    }
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
  return { id: row.id, contentId, platform: row.platform, style: row.style, mood: row.mood, requestedAspectRatio: row.requestedAspectRatio, actualGeneratedSize: row.actualGeneratedSize, creativeFormat: row.creativeFormat ?? 'single_image', expectedReferenceCount: row.expectedReferenceCount ?? 3, additionalInstruction: row.additionalInstruction, status: row.status, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, references: row.references.map((reference: any) => mapReference(reference, contentId, row.platform)) }
}

function mapReference(row: any, contentId: string, platform: string): CreativeReferenceDto {
  return { id: row.id, conceptIndex: row.conceptIndex, conceptName: row.conceptName, templateType: row.templateType ?? null, slideNumber: row.slideNumber ?? null, slideCopy: row.slideCopy ?? null, rationale: row.rationale, layoutNotes: row.layoutNotes, visualFocus: row.visualFocus, typographyDirection: row.typographyDirection, canvaBrief: row.canvaBrief ?? null, assetSearchKeywords: row.assetSearchKeywords ?? [], carouselOutline: row.carouselOutline ?? [], imageUrl: `/api/contents/${contentId}/creative-references/${row.id}/image`, mimeType: row.mimeType, fileSize: Number(row.fileSize), width: row.width, height: row.height, selected: Boolean(row.selectedAt), selectedAt: row.selectedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }
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
  return { company: { name: company.name, positioning: company.positioning, valueProposition: company.coreValueProposition, differentiators: company.differentiators, customerSegments: company.customerSegments, decisionMakers: company.decisionMakers, painPoints: company.painPoints, brandVoice: company.brandProfile?.brandVoice, tone: company.brandProfile?.toneDescription }, product: product ? { name: product.name, description: product.description, valueProposition: product.profile?.valueProposition, positioning: product.profile?.positioning, targetUsers: product.profile?.targetUsers, targetOrganizations: product.profile?.targetOrganizations } : null, campaign: { brief: content.brief, master: content.masterContent, visualDirection: content.visualDirection, platform: input.platform, variant, creativeFormat: input.format, slideCount: input.format === 'carousel' ? input.slideCount : null, style: input.style, mood: input.mood, aspectRatio: input.aspectRatio, additionalInstruction: input.additionalInstruction } }
}

function renderPlannerPrompt(snapshot: UnknownRecord) {
  const campaign = snapshot.campaign as Record<string, unknown>
  if (campaign.creativeFormat === 'carousel') {
    return `Create exactly ${campaign.slideCount} ordered slide concepts for one coherent carousel storyboard. Return one concept per slide, with slideNumber from 1 to ${campaign.slideCount}. Use one shared design system across every slide (same grid, margins, palette, typography, recurring marker and illustration style), while varying the focal visual to match each slide's message. Derive the slide sequence from the actual master and platform variant copy in the context; preserve its message and do not add unsupported claims. Use only the supplied campaign copy and context. Put one complete ordered outline of ${campaign.slideCount} concise slide roles in the root carouselOutline field. Each conceptName should identify its slide and role. slideCopy should be a concise source-grounded message for that slide. Each canvaBrief should explain practical placement and recreation for that specific slide. Keep every image prompt focused on a single slide, never a contact sheet. Do not return alternate design directions.\n${JSON.stringify(snapshot)}`
  }
  return `Create exactly three alternative single-image concepts: educational, product_showcase, and process_insight (a single-slide diagram/insight, not a carousel). Put an empty array in the root carouselOutline field. Return slideNumber 0 and empty slideCopy for every concept. Each concept needs practical Canva steps, asset search keywords, a clear headline area, a mobile-readable layout, and a brand-consistent color/type plan. Use only the supplied campaign copy and context. Do not add externally sourced claims or statistics.\n${JSON.stringify(snapshot)}`
}

function buildImagePrompt(concept: Concept, content: any, input: CreativeReferenceInput) {
  const sequence = input.format === 'carousel' ? `Carousel slide ${concept.slideNumber} of ${input.slideCount}. Keep its visual system consistent with the other slides in this batch, but use this slide's own focal visual. Message: ${concept.slideCopy}.` : 'Single-image post direction.'
  return `Design reference mockup for ${input.platform}, ${input.style} style, ${input.mood} mood, ${input.aspectRatio} format. ${sequence} Layout: ${concept.layoutNotes} Visual focus: ${concept.visualFocus} Typography: ${concept.typographyDirection} ${concept.imagePrompt} Campaign context: ${content.brief?.topic ?? 'B2B campaign'} for Shifd Labs. Shifd brand palette: #1363DF, #3279E7, #E2EDFF, #FFFFFF, #151B2D. Modern minimalist tech corporate. Keep approximately 70% of the layout for messaging and whitespace, with one relevant supporting asset; this is flexible. Use clear hierarchy, ample margins, mobile readable type, and short placeholder-like typography only. Never render the em dash character in image text. Do not invent dashboard UI, product screenshots, features, metrics, testimonials, or long copy. Do not create a logo or use third-party brand assets. This is an inspiration reference to recreate manually in Canva, not a final publication asset.`
}

export function parseCreativeReferenceConcepts(text: string, input: CreativeReferenceInput): Concept[] {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw aiOutputInvalid() }
  const expectedCount = input.format === 'carousel' ? input.slideCount : 3
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as any).concepts) || (value as any).concepts.length !== expectedCount) throw aiOutputInvalid(`The visual concept planner must return exactly ${expectedCount} concepts for this format.`)
  const outline = (value as any).carouselOutline
  if (!Array.isArray(outline) || outline.some((slide) => typeof slide !== 'string' || !slide.trim())) throw aiOutputInvalid()
  if (outline.length !== (input.format === 'carousel' ? input.slideCount : 0)) throw aiOutputInvalid('The storyboard outline must match the requested content format and slide count.')
  const concepts = (value as { concepts: unknown[] }).concepts.map((raw: unknown, conceptIndex): Concept => {
    const concept = raw as Record<string, unknown>
    const required = ['conceptName', 'rationale', 'layoutNotes', 'visualFocus', 'typographyDirection', 'canvaBrief', 'imagePrompt']
    if (!concept || typeof concept !== 'object' || required.some((key) => typeof concept[key] !== 'string' || !(concept[key] as string).trim())) throw aiOutputInvalid()
    if (!['educational', 'product_showcase', 'process_insight', 'process_carousel'].includes(String(concept.templateType))) throw aiOutputInvalid()
    if (!Array.isArray(concept.assetSearchKeywords) || concept.assetSearchKeywords.length < 3 || concept.assetSearchKeywords.length > 8 || concept.assetSearchKeywords.some((keyword) => typeof keyword !== 'string' || !keyword.trim())) throw aiOutputInvalid()
    if (!Number.isInteger(concept.slideNumber) || typeof concept.slideCopy !== 'string') throw aiOutputInvalid()
    if (input.format === 'single_image' && (concept.templateType === 'process_carousel' || concept.slideNumber !== 0 || concept.slideCopy !== '')) throw aiOutputInvalid()
    return {
      ...Object.fromEntries(required.map((key) => [key, normalizeAiText(concept[key] as string)])),
      // The array order is the storyboard order. Set carousel metadata from
      // that canonical position so a semantically correct plan is not
      // discarded because the model mislabeled its slide index or template.
      templateType: (input.format === 'carousel' ? 'process_carousel' : concept.templateType) as Concept['templateType'],
      assetSearchKeywords: concept.assetSearchKeywords.map((item: string) => normalizeAiText(item)),
      carouselOutline: outline.map((item: string) => normalizeAiText(item)),
      slideNumber: input.format === 'carousel' ? conceptIndex + 1 : concept.slideNumber as number,
      slideCopy: normalizeAiText(concept.slideCopy as string),
    } as Concept
  })
  if (input.format === 'carousel') {
    const firstOutline = JSON.stringify(concepts[0]?.carouselOutline)
    if (concepts.some((concept) => JSON.stringify(concept.carouselOutline) !== firstOutline)) throw aiOutputInvalid('Carousel slide concepts must share the same ordered outline.')
  } else if (new Set(concepts.map((concept) => concept.templateType)).size !== 3) throw aiOutputInvalid('The single-image concepts must cover all three Shifd Labs templates.')
  const names = new Set(concepts.map((concept) => concept.conceptName.toLowerCase()))
  const compositions = new Set(concepts.map((concept) => `${concept.layoutNotes.toLowerCase()}|${concept.visualFocus.toLowerCase()}`))
  if (names.size !== concepts.length || compositions.size !== concepts.length) throw aiOutputInvalid('The visual concepts must be meaningfully different.')
  return concepts
}

async function ensurePromptVersion(prisma: PrismaClient, digest: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.promptVersion.findUnique({ where: { module_version: { module: CREATIVE_REFERENCE_MODULE, version: CREATIVE_REFERENCE_PROMPT_VERSION } } })
      if (existing && (existing.operation !== CREATIVE_REFERENCE_CONCEPT_OPERATION || existing.module !== CREATIVE_REFERENCE_MODULE || existing.version !== CREATIVE_REFERENCE_PROMPT_VERSION || existing.templateReference !== CREATIVE_REFERENCE_PROMPT_REFERENCE || existing.templateDigest !== digest || existing.outputSchemaVersion !== CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION)) {
        throw new Error('The existing Creative Reference prompt metadata does not match the canonical M2 prompt identity.')
      }

      // The active prompt index is scoped to module + operation. Retire the
      // previous Creative Reference version before inserting/reactivating v3.
      await tx.promptVersion.updateMany({
        where: { module: CREATIVE_REFERENCE_MODULE, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, status: 'active', ...(existing ? { id: { not: existing.id } } : {}) },
        data: { status: 'retired' },
      })
      if (!existing) {
        return tx.promptVersion.create({ data: { module: CREATIVE_REFERENCE_MODULE, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, version: CREATIVE_REFERENCE_PROMPT_VERSION, status: 'active', templateReference: CREATIVE_REFERENCE_PROMPT_REFERENCE, templateDigest: digest, outputSchemaVersion: CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION } })
      }
      return existing.status === 'active' ? existing : tx.promptVersion.update({ where: { id: existing.id }, data: { status: 'active' } })
    })
  } catch (error) {
    if (isUnique(error)) {
      const raced = await prisma.promptVersion.findUnique({ where: { module_version: { module: CREATIVE_REFERENCE_MODULE, version: CREATIVE_REFERENCE_PROMPT_VERSION } } })
      // A unique conflict can come from an older active prompt version, not
      // from a concurrent insert of this exact version. Preserve that original
      // error instead of masking it with Prisma's P2025 from findUniqueOrThrow.
      if (!raced) throw error
      if (raced.operation !== CREATIVE_REFERENCE_CONCEPT_OPERATION || raced.templateReference !== CREATIVE_REFERENCE_PROMPT_REFERENCE || raced.templateDigest !== digest || raced.outputSchemaVersion !== CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION) throw new Error('The concurrent Creative Reference prompt metadata does not match the canonical M2 prompt identity.')
      if (raced.status === 'active') return raced
      return prisma.$transaction(async (tx) => {
        await tx.promptVersion.updateMany({ where: { module: CREATIVE_REFERENCE_MODULE, operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, status: 'active', id: { not: raced.id } }, data: { status: 'retired' } })
        return tx.promptVersion.update({ where: { id: raced.id }, data: { status: 'active' } })
      })
    }
    throw error
  }
}

function aiLogData(input: { id: string; companyId: string; contentId: string; actorId: string; promptVersionId: string; operation: string; provider: string; model: string; mode: string; language: string; inputHash: string; snapshot: unknown }) {
  return { id: input.id, companyId: input.companyId, contentId: input.contentId, variantId: null, requestedBy: input.actorId, promptVersionId: input.promptVersionId, module: CREATIVE_REFERENCE_MODULE, operation: input.operation, provider: input.provider, model: input.model, mode: input.mode, language: input.language, editorialRevision: null, variantRevision: null, inputHash: input.inputHash, inputSnapshot: input.snapshot as Prisma.InputJsonValue, inputTokens: null, outputTokens: null, estimatedCostUsd: null, costBasis: Prisma.DbNull, latencyMs: null, status: 'pending', errorCode: null, errorMessage: null, providerRequestId: null }
}

async function markFailed(prisma: PrismaClient, batchId: string, logId: string, failure: AppError, latencyMs: number) {
  await prisma.aiRequestLog.update({ where: { id: logId }, data: { latencyMs, status: 'failed', errorCode: failure.code, errorMessage: failure.message, completedAt: new Date() } }).catch(() => undefined)
  await prisma.creativeReferenceBatch.update({ where: { id: batchId }, data: { status: 'failed', completedAt: new Date() } }).catch(() => undefined)
}

function decodeImage(base64: string) {
  const normalized = base64.replace(/^data:image\/png;base64,/, '')
  const buffer = Buffer.from(normalized, 'base64')
  if (!buffer.length) throw new AiProviderFailure('invalid_response', 'The image provider returned invalid image data.')
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new AiProviderFailure('invalid_response', 'The image provider returned data that is not a PNG image.')
  return buffer
}

function safeImageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|authorization|cookie|session(?:[_-]?id)?)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function isRetryableImageFailure(error: unknown) {
  if (!(error instanceof AiProviderFailure)) return false
  if (error.kind === 'timeout' || error.kind === 'rate_limit' || error.kind === 'invalid_response') return true
  if (error.kind !== 'provider') return false
  const status = error.diagnostics?.httpStatus
  return status == null || status === 408 || status === 409 || status >= 500
}

async function generateValidImageWithRetry(imageProvider: AiImageProvider, request: Parameters<AiImageProvider['generateImage']>[0]) {
  const retryDelays = [1_000, 3_000, 7_000]
  for (let attempt = 0; ; attempt += 1) {
    throwIfCancelled(request.signal)
    try {
      const result = await imageProvider.generateImage(request)
      return { result, buffer: decodeImage(result.base64) }
    } catch (error) {
      if (request.signal?.aborted) throw abortError()
      if (attempt >= retryDelays.length || !isRetryableImageFailure(error)) throw error
      await waitForRetry(retryDelays[attempt]!, request.signal)
    }
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

function abortError() {
  const error = new Error('Generation cancelled by user.')
  error.name = 'AbortError'
  return error
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  throwIfCancelled(signal)
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function mapProviderFailure(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof AiProviderFailure) {
    const failure = error.kind === 'not_configured'
      ? aiNotConfigured()
      : error.kind === 'timeout'
        ? aiTimeout()
        : error.kind === 'rate_limit'
          ? rateLimited('The AI provider rate limit was reached. Try again intentionally later.')
          : error.kind === 'invalid_response'
            ? aiOutputInvalid()
            : aiProviderError()
    if (error.providerRequestId || error.diagnostics) {
      Object.defineProperty(failure, 'providerDiagnostics', {
        value: { requestId: error.providerRequestId, ...(error.diagnostics ?? {}) },
        enumerable: false,
      })
    }
    return failure
  }
  return aiProviderError()
}

function isUnique(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' }
