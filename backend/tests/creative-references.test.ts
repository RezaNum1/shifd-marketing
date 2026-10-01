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

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for Creative Reference database tests.')
const runIntegration = process.env.REQUIRE_DATABASE === '1' ? describe : describe.skip
const requiredTestDatabaseUrl = testDatabaseUrl ?? ''

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

class FakePlanner implements AiProvider {
  isConfigured() { return true }
  async generate(_request: AiProviderRequest): Promise<AiProviderResult> {
    return {
      text: JSON.stringify({ concepts: [
        { conceptName: 'Workflow map', rationale: 'Clarifies the operating flow.', layoutNotes: 'Three-step horizontal process.', visualFocus: 'Connected workflow nodes.', typographyDirection: 'Short bold labels with generous spacing.', imagePrompt: 'A workflow map with three connected stages.' },
        { conceptName: 'Before and after', rationale: 'Makes the transformation visible.', layoutNotes: 'Split composition with a clear center transition.', visualFocus: 'Contrast between fragmented and aligned work.', typographyDirection: 'Compact labels anchored to each side.', imagePrompt: 'A before-and-after workflow transformation.' },
        { conceptName: 'Interface lens', rationale: 'Connects the idea to product behavior.', layoutNotes: 'Product-inspired frame with a focused central panel.', visualFocus: 'A calm interface-like operating view.', typographyDirection: 'Minimal interface labels and one focal heading.', imagePrompt: 'A product interface-inspired workflow composition.' },
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
  isConfigured() { return true }
  async generateImage(_request: AiImageProviderRequest): Promise<AiImageProviderResult> {
    this.calls += 1
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
  let pillarCode = ''
  const input = { platform: 'instagram' as const, style: 'modern_minimal' as const, mood: 'professional' as const, aspectRatio: 'square_1_1' as const, additionalInstruction: null }

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
    const pillar = await prisma.contentPillar.upsert({ where: { code: 'creative-reference-test' }, update: {}, create: { code: 'creative-reference-test', label: 'Creative Reference Test', sortOrder: 999, active: true } })
    pillarCode = pillar.code
    const company = await prisma.company.create({ data: { name: `Creative Reference Test ${Date.now()}`, description: 'Integration fixture', positioning: 'Workflow clarity', coreValueProposition: 'Clear operations', differentiators: ['Focused'], customerSegments: ['B2B teams'], decisionMakers: ['Operators'], painPoints: ['Fragmented work'], brandProfile: { create: { brandVoice: 'Clear', toneDescription: 'Calm and useful' } }, aiSettings: { create: { provider: 'openai', modelId: 'gpt-5.6-luna', modelDisplayName: 'GPT-5.6 Luna', mode: 'real', generationLanguage: 'English' } } } })
    companyId = company.id
    const user = await prisma.user.create({ data: { companyId, name: 'Creative Reference Test User', email: `creative-reference-${Date.now()}@example.test`, passwordHash: 'test-only-hash' } })
    actorId = user.id
    const product = await prisma.product.create({ data: { companyId, name: 'Test Product', slug: `creative-reference-${Date.now()}`, description: 'A workflow product', status: 'active', profile: { create: { targetUsers: ['Operators'], targetOrganizations: ['B2B teams'], valueProposition: 'Clear operations' } } } })
    const content = await prisma.content.create({ data: { companyId, createdBy: actorId, productId: product.id, contextType: 'product', editorialStage: 'draft', designStatus: 'not_started', masterContent: { title: 'Test campaign' }, visualDirection: { concept: 'Workflow clarity' }, brief: { create: { pillarCode, objective: 'education', targetAudience: 'B2B operators', topic: 'Workflow clarity' } }, variants: { create: [{ platform: 'instagram', enabled: true, copy: 'Test Instagram copy' }, { platform: 'linkedin', enabled: true, copy: 'Test LinkedIn copy' }] } } })
    contentId = content.id
    const other = await prisma.company.create({ data: { name: `Other Creative Reference ${Date.now()}`, description: 'Other fixture' } })
    otherCompanyId = other.id
  })

  afterAll(async () => {
    if (companyId) {
      await prisma.requestIdempotency.deleteMany({ where: { companyId } })
      await prisma.creativeReferenceBatch.deleteMany({ where: { companyId } })
      await prisma.aiRequestLog.deleteMany({ where: { companyId } })
      if (contentId) {
        await prisma.contentBrief.deleteMany({ where: { contentId } })
        await prisma.platformVariant.deleteMany({ where: { contentId } })
        await prisma.content.deleteMany({ where: { id: contentId } })
      }
      await prisma.productProfile.deleteMany({ where: { product: { companyId } } })
      await prisma.product.deleteMany({ where: { companyId } })
      await prisma.aiSettings.deleteMany({ where: { companyId } })
      await prisma.brandProfile.deleteMany({ where: { companyId } })
      await prisma.user.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } })
    if (pillarCode) await prisma.contentPillar.delete({ where: { code: pillarCode } }).catch(() => undefined)
    await prisma.$disconnect()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
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

    const partial = await createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(2), storage, companyId, actorId, contentId!, input, 'batch-partial')
    expect(partial.body.data.batch.status).toBe('partial')
    expect(partial.body.data.batch.references).toHaveLength(2)

    await expect(createCreativeReferenceBatch(prisma, config, new FakePlanner(), new FakeImageProvider(0), storage, companyId, actorId, contentId!, input, 'batch-failed')).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' })
    const failed = await prisma.creativeReferenceBatch.findFirstOrThrow({ where: { contentId: contentId!, status: 'failed' }, orderBy: { createdAt: 'desc' } })
    expect(await prisma.creativeReference.count({ where: { batchId: failed.id } })).toBe(0)
    expect(await listCreativeReferenceBatches(prisma, companyId, contentId!)).toHaveLength(4)
  })
})
