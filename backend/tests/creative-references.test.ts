import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppConfig } from '../src/config/env.js'
import { loadConfig } from '../src/config/env.js'
import { LocalAssetStorage } from '../src/modules/assets/storage.js'
import { createCreativeReferenceBatch, listCreativeReferenceBatches, openCreativeReference, selectCreativeReference } from '../src/modules/creative-references/service.js'
import { AiProviderFailure, type AiImageProvider, type AiImageProviderRequest, type AiImageProviderResult, type AiProvider, type AiProviderRequest, type AiProviderResult } from '../src/modules/ai/provider.js'
import { CREATIVE_REFERENCE_CONCEPT_OPERATION, CREATIVE_REFERENCE_MODULE, CREATIVE_REFERENCE_PROMPT_REFERENCE, CREATIVE_REFERENCE_PROMPT_VERSION } from '../src/modules/ai/constants.js'
import { provisionCompanyContext } from '../src/modules/context/service.js'
import { readCanvaDesignLink, removeCanvaDesignLink, saveCanvaDesignLink } from '../src/modules/content/service.js'
import { readContent } from '../src/modules/content/service.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for Creative Reference database tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const requiredTestDatabaseUrl = testDatabaseUrl ?? ''

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

class FakePlanner implements AiProvider {
  isConfigured() { return true }
  async generate(_request: AiProviderRequest): Promise<AiProviderResult> {
    return {
      text: JSON.stringify({ carouselOutline: [], concepts: [
        { conceptName: 'Workflow map', templateType: 'educational', rationale: 'Clarifies the operating flow.', layoutNotes: 'Three-step horizontal process.', visualFocus: 'Connected workflow nodes.', typographyDirection: 'Short bold labels with generous spacing.', canvaBrief: 'Place the headline above a simple flow.', assetSearchKeywords: ['workflow diagram', 'connected nodes', 'dot grid'], slideNumber: 0, slideCopy: '', imagePrompt: 'A workflow map with three connected stages.' },
        { conceptName: 'Before and after', templateType: 'product_showcase', rationale: 'Makes the transformation visible.', layoutNotes: 'Split composition with a clear center transition.', visualFocus: 'Contrast between fragmented and aligned work.', typographyDirection: 'Compact labels anchored to each side.', canvaBrief: 'Use a two-column comparison.', assetSearchKeywords: ['flowchart arrows', 'document line icon', 'mesh gradient'], slideNumber: 0, slideCopy: '', imagePrompt: 'A before-and-after workflow transformation.' },
        { conceptName: 'Interface lens', templateType: 'process_insight', rationale: 'Connects the idea to product behavior.', layoutNotes: 'Product-inspired frame with a focused central panel.', visualFocus: 'A calm interface-like operating view.', typographyDirection: 'Minimal interface labels and one focal heading.', canvaBrief: 'Keep one focal panel with short labels.', assetSearchKeywords: ['dashboard mockup', 'browser window', 'geometric outline'], slideNumber: 0, slideCopy: '', imagePrompt: 'A product interface-inspired workflow composition.' },
      ] }),
      inputTokens: 10,
      outputTokens: 20,
      providerRequestId: 'fake-planner',
    }
  }
}

class FakeImageProvider implements AiImageProvider {
  constructor(private readonly failAt: number | null = null) {}
  calls = 0
  requests: AiImageProviderRequest[] = []
  isConfigured() { return true }
  async generateImage(request: AiImageProviderRequest): Promise<AiImageProviderResult> {
    this.calls += 1
    this.requests.push(request)
    if (this.failAt === 0 || this.failAt === this.calls) throw new AiProviderFailure('provider', 'fake image failure', `fake-image-${this.calls}`)
    return { base64: pngBase64, providerRequestId: `fake-image-${this.calls}`, inputTokens: null, outputTokens: null }
  }
}

runIntegration('Creative Reference database integration', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requiredTestDatabaseUrl } } })
  let storage: LocalAssetStorage
  let storageRoot = ''
  let config: AppConfig
  let companyId = ''
  let otherCompanyId = ''
  let actorId = ''
  let contentId: string | null = null
  const pillarCode = 'educational'
  const input = { platform: 'instagram' as const, format: 'single_image' as const, slideCount: 5, style: 'modern_minimal' as const, mood: 'professional' as const, aspectRatio: 'square_1_1' as const, additionalInstruction: null }

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'shifd-creative-references-'))
    storage = new LocalAssetStorage(storageRoot)
    await storage.initialize()
    config = loadConfig({
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3000', DATABASE_URL: requiredTestDatabaseUrl,
      ALLOWED_ORIGIN: 'http://localhost:5173', OPENAI_MODEL: 'gpt-5.6-luna', OPENAI_IMAGE_MODEL: 'gpt-image-2', OPENAI_IMAGE_QUALITY: 'medium',
      ASSET_STORAGE_ROOT: storageRoot,
    })
    await prisma.$connect()
    const company = await prisma.company.create({ data: { name: `Creative Reference Test ${Date.now()}`, description: 'Integration fixture', positioning: 'Workflow clarity', coreValueProposition: 'Clear operations', differentiators: ['Focused'], customerSegments: ['B2B teams'], decisionMakers: ['Operators'], painPoints: ['Fragmented work'], brandProfile: { create: { brandVoice: 'Clear', toneDescription: 'Calm and useful' } }, aiSettings: { create: { provider: 'openai', modelId: 'gpt-5.6-luna', modelDisplayName: 'GPT-5.6 Luna', mode: 'real', generationLanguage: 'English' } } } })
    companyId = company.id
    await provisionCompanyContext(prisma, companyId)
    const user = await prisma.user.create({ data: { companyId, name: 'Creative Reference Test User', email: `creative-reference-${Date.now()}@example.test`, passwordHash: 'test-only-hash' } })
    actorId = user.id
    const product = await prisma.product.create({ data: { companyId, name: 'Test Product', slug: `creative-reference-${Date.now()}`, description: 'A workflow product', status: 'active', profile: { create: { targetUsers: ['Operators'], targetOrganizations: ['B2B teams'], valueProposition: 'Clear operations' } } } })
    const content = await prisma.content.create({ data: { companyId, createdBy: actorId, productId: product.id, contextType: 'product', editorialStage: 'draft', designStatus: 'not_started', masterContent: { title: 'Test campaign' }, visualDirection: { concept: 'Workflow clarity' }, brief: { create: { pillarCode, objective: 'education', targetAudience: 'B2B operators', topic: 'Workflow clarity' } }, variants: { create: [{ platform: 'instagram', enabled: true, copy: 'Test Instagram copy' }, { platform: 'linkedin', enabled: true, copy: 'Test LinkedIn copy' }] } } })
    contentId = content.id
    const other = await prisma.company.create({ data: { name: `Other Creative Reference ${Date.now()}`, description: 'Other fixture' } })
    otherCompanyId = other.id
    await provisionCompanyContext(prisma, otherCompanyId)
  })

  afterAll(async () => {
    const cleanupErrors: unknown[] = []
    try {
      for (const fixtureCompanyId of [...new Set([companyId, otherCompanyId].filter(Boolean))]) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.requestIdempotency.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.creativeReferenceBatch.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.aiRequestLog.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.contentBrief.deleteMany({ where: { content: { companyId: fixtureCompanyId } } })
            await tx.variantAsset.deleteMany({ where: { asset: { companyId: fixtureCompanyId } } })
            await tx.creativeAsset.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.platformVariant.deleteMany({ where: { content: { companyId: fixtureCompanyId } } })
            await tx.content.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.productProfile.deleteMany({ where: { product: { companyId: fixtureCompanyId } } })
            await tx.product.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.bmcBlock.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.brandProfile.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.aiSettings.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.user.deleteMany({ where: { companyId: fixtureCompanyId } })
            await tx.company.delete({ where: { id: fixtureCompanyId } })
          })
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    } finally {
      try { await prisma.$disconnect() } catch (error) { cleanupErrors.push(error) }
      if (storageRoot) {
        try { await rm(storageRoot, { recursive: true, force: true }) } catch (error) { cleanupErrors.push(error) }
      }
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Creative Reference test fixture cleanup failed.')
  })

  it('persists three private references, enforces ownership, selects transactionally, and preserves Content state', async () => {
    const before = await prisma.content.findUniqueOrThrow({ where: { id: contentId! }, select: { editorialStage: true, editorialRevision: true, designStatus: true, currentApprovalId: true } })
    const result = await createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(), storage, companyId, actorId, contentId!, input, 'batch-one')
    expect(result.status).toBe(201)
    const batch = result.body.data.batch
    expect(batch.status).toBe('completed')
    expect(batch.references).toHaveLength(3)
    const rows = await prisma.creativeReference.findMany({ where: { batchId: batch.id }, orderBy: { conceptIndex: 'asc' } })
    expect(rows).toHaveLength(3)
    const persistedBatch = await prisma.creativeReferenceBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { conceptPlannerAiRequest: true } })
    expect(persistedBatch.conceptPlannerAiRequestLogId).toBe(persistedBatch.conceptPlannerAiRequest?.id)
    expect(persistedBatch.conceptPlannerAiRequest).toMatchObject({ module: 'M2', operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, status: 'success' })
    const imageLogIds = rows.map((row) => row.imageAiRequestLogId)
    expect(imageLogIds.every((id): id is string => Boolean(id))).toBe(true)
    expect(await prisma.aiRequestLog.count({ where: { id: { in: imageLogIds.filter((id): id is string => Boolean(id)) } } })).toBe(3)
    const prompt = await prisma.promptVersion.findUniqueOrThrow({ where: { module_version: { module: CREATIVE_REFERENCE_MODULE, version: CREATIVE_REFERENCE_PROMPT_VERSION } } })
    expect(prompt).toMatchObject({ module: 'M2', operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, version: CREATIVE_REFERENCE_PROMPT_VERSION, templateReference: CREATIVE_REFERENCE_PROMPT_REFERENCE, status: 'active' })
    expect(prompt.module).not.toBe('M6')
    expect(rows.every((row) => row.mimeType === 'image/png' && row.storageKey !== row.imagePrompt && !row.storageKey.includes('base64'))).toBe(true)
    expect(await storage.exists(rows[0]!.storageKey)).toBe(true)
    await expect(openCreativeReference(prisma, storage, otherCompanyId, contentId!, rows[0]!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await selectCreativeReference(prisma, companyId, contentId!, rows[0]!.id)
    await selectCreativeReference(prisma, companyId, contentId!, rows[1]!.id)
    const selected = await prisma.creativeReference.findMany({ where: { batch: { companyId, contentId: contentId!, platform: 'instagram' }, selectedAt: { not: null } } })
    expect(selected).toHaveLength(1)
    expect(selected[0]!.id).toBe(rows[1]!.id)
    const after = await prisma.content.findUniqueOrThrow({ where: { id: contentId! }, select: { editorialStage: true, editorialRevision: true, designStatus: true, currentApprovalId: true } })
    expect(after).toEqual(before)
    expect(await prisma.creativeAsset.count({ where: { companyId } })).toBe(0)
  })

  it('keeps regenerated batches, partial batches, and failed batches distinct', async () => {
    const regenerated = await createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(), storage, companyId, actorId, contentId!, input, 'batch-two')
    expect(regenerated.status).toBe(201)
    expect(regenerated.body.data.batch.references).toHaveLength(3)
    expect(await prisma.creativeReferenceBatch.count({ where: { contentId: contentId! } })).toBe(2)
    expect(await prisma.promptVersion.count({ where: { module: 'M2', operation: CREATIVE_REFERENCE_CONCEPT_OPERATION, version: CREATIVE_REFERENCE_PROMPT_VERSION } })).toBe(1)

    const canvaReadyImages = new FakeImageProvider()
    const canvaReady = await createCreativeReferenceBatch(prisma, config, new FakePlanner(), canvaReadyImages, storage, companyId, actorId, contentId!, { ...input, generationMode: 'canva_ready' }, 'batch-canva-ready')
    expect(canvaReady.body.data.batch).toMatchObject({ generationMode: 'canva_ready', status: 'completed' })
    expect(canvaReadyImages.calls).toBe(3)
    expect(canvaReadyImages.requests.every((request) => request.background === 'transparent' && request.outputFormat === 'png')).toBe(true)

    const partial = await createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(2), storage, companyId, actorId, contentId!, input, 'batch-partial')
    expect(partial.body.data.batch.status).toBe('partial')
    expect(partial.body.data.batch.references).toHaveLength(2)

    await expect(createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(0), storage, companyId, actorId, contentId!, input, 'batch-failed')).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' })
    const failed = await prisma.creativeReferenceBatch.findFirstOrThrow({ where: { contentId: contentId!, status: 'failed' }, orderBy: { createdAt: 'desc' } })
    expect(await prisma.creativeReference.count({ where: { batchId: failed.id } })).toBe(0)
    expect(await listCreativeReferenceBatches(prisma, companyId, contentId!)).toHaveLength(5)
  })

  it('persists one audited Canva link per Content, supports update and removal, and enforces company ownership', async () => {
    const editorialState = await prisma.content.findUniqueOrThrow({ where: { id: contentId! }, select: { version: true, editorialStage: true, editorialRevision: true, designStatus: true, currentApprovalId: true } })
    expect(await readCanvaDesignLink(prisma, companyId, contentId!)).toBeNull()
    const firstUrl = 'https://www.canva.com/design/DAGfirst/view'
    const first = await saveCanvaDesignLink(prisma, companyId, contentId!, actorId, firstUrl)
    expect(first).toMatchObject({ contentId, companyId, url: firstUrl, createdBy: { id: actorId }, updatedBy: { id: actorId } })
    expect(first?.createdAt).toBeTruthy()
    expect(first?.updatedAt).toBeTruthy()
    expect(await readCanvaDesignLink(prisma, companyId, contentId!)).toEqual(first)

    const variant = await prisma.platformVariant.findFirstOrThrow({ where: { contentId: contentId!, platform: 'instagram' } })
    const asset = await prisma.creativeAsset.create({ data: { companyId, uploadedBy: actorId, purpose: 'creative', fileName: 'final.png', storageKey: `canva-link-final-${Date.now()}`, mimeType: 'image/png', sizeBytes: BigInt(100), width: 10, height: 10, checksumSha256: 'a'.repeat(64) } })
    await prisma.variantAsset.create({ data: { variantId: variant.id, assetId: asset.id, sortOrder: 0 } })

    const secondUrl = 'https://www.canva.com/design/DAGsecond/edit?utm_content=campaign'
    const updated = await saveCanvaDesignLink(prisma, companyId, contentId!, actorId, secondUrl)
    expect(updated?.url).toBe(secondUrl)
    expect(updated?.createdAt).toBe(first?.createdAt)
    const content = await readContent(prisma, companyId, contentId!, config)
    expect(content.canvaDesignLink?.url).toBe(secondUrl)
    expect(content.variants.find((item) => item.platform === 'instagram')?.ownAssets.map((item) => item.asset.id)).toContain(asset.id)
    expect(content.designStatus).toBe('not_started')

    await expect(readCanvaDesignLink(prisma, otherCompanyId, contentId!)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(saveCanvaDesignLink(prisma, otherCompanyId, contentId!, actorId, firstUrl)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const removed = await removeCanvaDesignLink(prisma, companyId, contentId!, actorId)
    expect(removed?.url).toBeNull()
    expect(removed?.updatedBy.id).toBe(actorId)
    expect(await readCanvaDesignLink(prisma, companyId, contentId!)).toEqual(removed)
    expect(await prisma.creativeAsset.count({ where: { id: asset.id, companyId } })).toBe(1)
    expect(await prisma.variantAsset.count({ where: { assetId: asset.id, variantId: variant.id } })).toBe(1)
    expect(await prisma.content.findUniqueOrThrow({ where: { id: contentId! }, select: { version: true, editorialStage: true, editorialRevision: true, designStatus: true, currentApprovalId: true } })).toEqual(editorialState)
  })
})
