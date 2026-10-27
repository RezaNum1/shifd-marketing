import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { M4_CHECK_LABELS } from './output.js'
import {
  CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION,
  M2_DISCOVERY_OUTPUT_SCHEMA_VERSION,
  M2_INDUSTRY_IDEATION_OUTPUT_SCHEMA_VERSION,
  M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION,
  M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION,
  M3_OUTPUT_SCHEMA_VERSION,
  M4_OUTPUT_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  PROSPECT_EMAIL_DRAFT_SCHEMA_VERSION,
  PROSPECT_RESEARCH_SCHEMA_VERSION,
  PUBLICATION_TIME_RECOMMENDATION_SCHEMA_VERSION,
} from './constants.js'
import type {
  AiImageProvider,
  AiImageProviderRequest,
  AiImageProviderResult,
  AiProvider,
  AiProviderRequest,
  AiProviderResult,
  ProspectResearchProvider,
  ProspectResearchProviderRequest,
  ProspectResearchProviderResult,
  TopicDiscoveryProvider,
  TopicDiscoveryProviderRequest,
  TopicDiscoveryProviderResult,
} from './provider.js'

/** Predictable local responses for development. This provider never makes network calls. */
export class MockAiProvider implements AiProvider, AiImageProvider, TopicDiscoveryProvider, ProspectResearchProvider {
  readonly providerId = 'mock'
  readonly modelId = 'deterministic-fixtures'
  readonly executionMode = 'demo' as const

  isConfigured() { return true }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    let output: unknown
    switch (request.outputSchemaVersion) {
      case OUTPUT_SCHEMA_VERSION:
        output = { master: { title: 'Development draft: a clearer workflow', coreMessage: 'A clear workflow helps teams coordinate their work.', hook: 'Make the next step clear.', body: 'Use this predictable sample to develop and review the content workflow. Replace it with a live model response when needed.', cta: 'Explore a clearer workflow.' }, visualDirection: { format: 'Single image', concept: 'Show the main workflow benefit with one clear focal point.', structure: ['Headline, central visual, and CTA in one composition'], notes: 'Development mock response. Review and replace before publication.' } }
        break
      case M3_OUTPUT_SCHEMA_VERSION:
        output = { copy: 'Development mock adaptation for this platform.', cta: 'Explore the next step.', hashtags: '#Development #Workflow', visualRecommendation: 'Use a clear, readable visual that supports the main message.' }
        break
      case M4_OUTPUT_SCHEMA_VERSION:
        output = { score: 100, status: 'aligned', recommendation: 'Development mock assessment. This result does not evaluate the content.', checks: M4_CHECK_LABELS.map((label) => ({ label, status: 'pass' })) }
        break
      case M2_INDUSTRY_IDEATION_OUTPUT_SCHEMA_VERSION:
        output = { ideas: Array.from({ length: 4 }, (_, index) => ({ title: `Development idea ${index + 1}`, angle: 'Explain a practical workflow improvement.', hook: 'Where does work slow down?', targetAudience: 'Indonesian B2B teams', talkingPoints: ['Describe a common process challenge.', 'Offer a practical next step.'], industryRelevance: 'Illustrative development content only.', capability: 'Workflow digitalization', format: 'LinkedIn text post', platform: 'LinkedIn', softCta: 'Explore the workflow.', evidence: [] })) }
        break
      case CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION:
        output = mockConcepts(request.userPrompt)
        break
      case PROSPECT_EMAIL_DRAFT_SCHEMA_VERSION:
        output = { subject: 'Development mock: a clearer workflow', body: 'This is a development-only sample email. Replace it with a live generation before use.' }
        break
      case M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION:
        output = { reply: 'Development mock reply. Share a content idea and I can help shape it.' }
        break
      case M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION:
        output = { title: 'Development mock idea', summary: 'A practical workflow improvement idea.', targetAudience: 'Indonesian B2B teams', contentAngle: 'Explain a simple process improvement.', contentPillarCode: 'industry', objective: 'education', conversationSummary: 'Development-only mock summary.' }
        break
      default:
        output = { subject: 'Development mock response', body: 'This response is generated locally without an AI API.' }
    }
    return { text: JSON.stringify(output), inputTokens: null, outputTokens: null, providerRequestId: `mock-${randomUUID()}` }
  }

  async discoverTopics(_request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult> {
    const sources = [{ url: 'https://example.com/development-mock', title: 'Development fixture, not a current source', publisher: 'Example', publishedAt: null }]
    const topic = { title: 'Development mock topic', summary: 'Illustrative topic returned by the local development provider.', whyCurrent: 'No live search was performed in development mode.', relevanceToCompany: 'Use this fixture to build and review the discovery workflow.', contentAngle: 'Discuss a practical workflow improvement.', suggestedObjective: 'education', suggestedPlatforms: ['linkedin'], sources }
    return { text: JSON.stringify({ topics: [topic] }), sources, sourceDiagnostics: { webSearchCallCount: 0, actionSourceCount: 0, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 1 }, inputTokens: null, outputTokens: null, providerRequestId: `mock-${randomUUID()}` }
  }

  async recommendPublicationTimes(_request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult> {
    const sources = [{ url: 'https://example.com/development-mock', title: 'Development fixture, not a current source', publisher: 'Example', publishedAt: null }]
    return { text: JSON.stringify({ recommendations: [{ platform: 'linkedin', date: '2026-01-05', time: '09:00', rationale: 'Development fixture only. No performance data or live search was used.', sources: [{ title: sources[0]!.title!, url: sources[0]!.url }] }] }), sources, sourceDiagnostics: { webSearchCallCount: 0, actionSourceCount: 0, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 1 }, inputTokens: null, outputTokens: null, providerRequestId: `mock-${randomUUID()}` }
  }

  async researchProspect(_request: ProspectResearchProviderRequest): Promise<ProspectResearchProviderResult> {
    return { text: JSON.stringify({ summary: 'No source-backed company facts could be validated in this development mock.', identityStatus: 'needs_confirmation', identityExplanation: 'Development mode does not perform web research.', limitations: ['This is a local fixture, not prospect research.'], claims: [] }), sources: [], sourceDiagnostics: { webSearchCallCount: 0, actionSourceCount: 0, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 0 }, inputTokens: null, outputTokens: null, providerRequestId: `mock-${randomUUID()}` }
  }

  async generateImage(request: AiImageProviderRequest): Promise<AiImageProviderResult> {
    const [width, height] = request.size.split('x').map(Number) as [number, number]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#E2EDFF"/><rect x="8%" y="8%" width="84%" height="84%" rx="36" fill="#FFFFFF"/><circle cx="72%" cy="34%" r="17%" fill="#3279E7" opacity=".2"/><rect x="16%" y="20%" width="50%" height="5%" rx="18" fill="#1363DF"/><rect x="16%" y="31%" width="58%" height="2%" rx="8" fill="#151B2D" opacity=".7"/><rect x="16%" y="37%" width="48%" height="2%" rx="8" fill="#151B2D" opacity=".35"/><rect x="16%" y="55%" width="20%" height="18%" rx="20" fill="#1363DF" opacity=".85"/><rect x="42%" y="55%" width="20%" height="18%" rx="20" fill="#3279E7" opacity=".55"/><rect x="68%" y="55%" width="16%" height="18%" rx="20" fill="#151B2D" opacity=".12"/><text x="16%" y="84%" font-family="Arial, sans-serif" font-size="${Math.max(18, Math.round(width * 0.025))}" font-weight="700" fill="#151B2D">DEVELOPMENT MOCK</text></svg>`
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return { base64: png.toString('base64'), providerRequestId: `mock-${randomUUID()}`, inputTokens: null, outputTokens: null }
  }
}

function mockConcepts(prompt: string) {
  const carousel = prompt.startsWith('Create exactly ') && prompt.includes('ordered slide concepts for one coherent carousel storyboard')
  const requestedCount = Number(prompt.match(/exactly (\d+) ordered slide concepts/)?.[1] ?? 0)
  const count = carousel && requestedCount >= 2 && requestedCount <= 10 ? requestedCount : 1
  return {
    carouselOutline: carousel ? Array.from({ length: count }, (_, index) => `Development mock slide ${index + 1}`) : [],
    concepts: Array.from({ length: count }, (_, index) => ({
      conceptName: carousel ? `Development mock slide ${index + 1}` : 'Development mock single image',
      templateType: carousel ? 'process_carousel' : 'educational',
      rationale: 'Development fixture for the creative reference workflow.',
      layoutNotes: `Development mock layout ${index + 1}, clear headline and whitespace.`,
      visualFocus: `Development mock visual focus ${index + 1}, a simple process illustration.`,
      typographyDirection: 'Use a readable sans serif with clear hierarchy.',
      canvaBrief: 'Development-only mock. Do not publish this generated reference.',
      assetSearchKeywords: ['workflow', 'team', 'process'],
      slideNumber: carousel ? index + 1 : 0,
      slideCopy: carousel ? `Development mock slide ${index + 1}.` : '',
      imagePrompt: 'Create a simple abstract blue workflow illustration for development preview.',
    })),
  }
}
