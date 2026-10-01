import { describe, expect, it } from 'vitest'
import { createCreativeReferenceBatch, parseCreativeReferenceConcepts } from '../src/modules/creative-references/service.js'
import type { AiImageProvider, AiProvider } from '../src/modules/ai/provider.js'
import type { AppConfig } from '../src/config/env.js'
import { CREATIVE_REFERENCE_CONCEPT_OPERATION, CREATIVE_REFERENCE_MODULE, CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, CREATIVE_REFERENCE_PROMPT_REFERENCE, CREATIVE_REFERENCE_PROMPT_VERSION } from '../src/modules/ai/constants.js'

const concept = (name: string) => ({
  conceptName: name,
  rationale: `${name} rationale`,
  layoutNotes: `${name} layout`,
  visualFocus: `${name} focus`,
  typographyDirection: `${name} typography`,
  imagePrompt: `${name} image prompt`,
})

describe('AI visual reference concept validation', () => {
  it('uses the M2 prompt identity and never the M6 Performance module', () => {
    expect(CREATIVE_REFERENCE_MODULE).toBe('M2')
    expect(CREATIVE_REFERENCE_MODULE).not.toBe('M6')
    expect(CREATIVE_REFERENCE_CONCEPT_OPERATION).toBe('creative_reference.concepts')
    expect(CREATIVE_REFERENCE_PROMPT_VERSION).toBe('creative-reference-v1')
    expect(CREATIVE_REFERENCE_PROMPT_REFERENCE).toBe('m2.creative_reference_concepts.v1')
    expect(CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION).toBe('m2.creative_reference_concepts.v1')
  })

  it('accepts exactly three distinct structured concepts', () => {
    expect(parseCreativeReferenceConcepts(JSON.stringify({ concepts: [concept('Workflow'), concept('Before and After'), concept('Product Interface')] }))).toHaveLength(3)
  })

  it.each([
    JSON.stringify({ concepts: [concept('A'), concept('B')] }),
    JSON.stringify({ concepts: [concept('A'), concept('A'), concept('B')] }),
    JSON.stringify({ concepts: [concept('A'), { ...concept('B'), imagePrompt: '' }, concept('C')] }),
    '{not-json}',
  ])('rejects invalid planner output', (value) => {
    expect(() => parseCreativeReferenceConcepts(value)).toThrow()
  })

  it('persists the planner log before the batch FK and never calls the provider after pre-provider persistence fails', async () => {
    const order: string[] = []
    let plannerCalls = 0
    const companyId = '00000000-0000-0000-0000-000000000001'
    const actorId = '00000000-0000-0000-0000-000000000002'
    const contentId = '00000000-0000-0000-0000-000000000003'
    const promptVersion = {
      id: '00000000-0000-0000-0000-000000000004',
      module: 'M2',
      operation: CREATIVE_REFERENCE_CONCEPT_OPERATION,
      version: CREATIVE_REFERENCE_PROMPT_VERSION,
      status: 'active',
      templateReference: CREATIVE_REFERENCE_PROMPT_REFERENCE,
      templateDigest: 'digest',
      outputSchemaVersion: CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION,
    }
    const tx = {
      aiRequestLog: { create: async () => { order.push('ai-log') } },
      creativeReferenceBatch: { create: async () => { order.push('batch'); throw new Error('simulated persistence failure') } },
      requestIdempotency: { create: async () => { order.push('idempotency') } },
    }
    const prisma = {
      requestIdempotency: { findUnique: async () => null },
      content: { findFirst: async () => ({
        id: contentId,
        companyId,
        company: { name: 'Shifd Labs', positioning: null, coreValueProposition: null, differentiators: [], customerSegments: [], decisionMakers: [], painPoints: [], brandProfile: null },
        product: null,
        brief: { topic: 'Workflow clarity' },
        masterContent: {},
        visualDirection: {},
        variants: [],
      }) },
      aiSettings: { findUnique: async () => ({ modelId: 'gpt-5.6-luna', mode: 'real', generationLanguage: 'English' }) },
      promptVersion: { findUnique: async () => null, create: async () => promptVersion },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    } as any
    const provider = {
      isConfigured: () => true,
      generate: async () => { plannerCalls += 1; throw new Error('provider must not be called') },
    } as unknown as AiProvider
    const imageProvider = { isConfigured: () => true } as unknown as AiImageProvider
    const config = {
      openaiModel: 'gpt-5.6-luna',
      openaiImageModel: 'gpt-image-2',
      openaiImageQuality: 'medium',
      aiMaxOutputTokens: 1000,
      topicDiscoveryMaxOutputTokens: 4_096,
      aiRequestTimeoutMs: 1000,
      assetMaxBytes: 1_000_000,
    } as AppConfig

    await expect(createCreativeReferenceBatch(
      prisma,
      config,
      provider,
      imageProvider,
      {} as any,
      companyId,
      actorId,
      contentId,
      { platform: 'instagram', style: 'modern_minimal', mood: 'professional', aspectRatio: 'square_1_1', additionalInstruction: null },
      'fk-order-regression',
    )).rejects.toThrow('simulated persistence failure')

    expect(order).toEqual(['ai-log', 'batch'])
    expect(plannerCalls).toBe(0)
  })
})
