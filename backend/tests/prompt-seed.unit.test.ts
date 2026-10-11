import { describe, expect, it } from 'vitest'
import { PROSPECT_RESEARCH_OPERATION, PROSPECT_RESEARCH_PROMPT_REFERENCE, PROSPECT_RESEARCH_PROMPT_VERSION, PROSPECT_RESEARCH_SCHEMA_VERSION } from '../src/modules/ai/constants.js'
import { PROSPECT_RESEARCH_METADATA, prospectResearchPromptDigest } from '../src/modules/ai/prospect-research-prompt.js'
import { promptSeedRegistry } from '../src/modules/ai/seed.js'

describe('AI prompt seed registry', () => {
  it('registers the Phase 02 research prompt exactly once with matching immutable metadata', () => {
    const registry = promptSeedRegistry()
    const entries = registry.filter((entry) => entry.metadata.operation === PROSPECT_RESEARCH_OPERATION)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      key: 'prospectResearch',
      metadata: {
        module: 'M2', operation: PROSPECT_RESEARCH_OPERATION, version: PROSPECT_RESEARCH_PROMPT_VERSION,
        status: 'active', templateReference: PROSPECT_RESEARCH_PROMPT_REFERENCE, outputSchemaVersion: PROSPECT_RESEARCH_SCHEMA_VERSION,
      },
      reference: PROSPECT_RESEARCH_PROMPT_REFERENCE,
      digest: prospectResearchPromptDigest(),
    })
    expect(PROSPECT_RESEARCH_METADATA.operation).toBe(PROSPECT_RESEARCH_OPERATION)
    expect(entries[0]?.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('retains every existing M2/M3/M4 prompt seed operation without speculative additions', () => {
    expect(promptSeedRegistry().map((entry) => `${entry.metadata.module}:${entry.metadata.operation}`)).toEqual([
      'M2:generate', 'M2:idea.discovery.web_search', 'M3:adapt', 'M4:brand_check',
      'M2:prospect.company.research', 'M2:telegram.ideation.chat', 'M2:telegram.ideation.structure',
    ])
  })
})
