import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai'
import type { AppConfig } from '../../config/env.js'
import { M4_CHECK_LABELS } from './output.js'
import { CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION, M2_DISCOVERY_OUTPUT_SCHEMA_VERSION, M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION, M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION, M3_OUTPUT_SCHEMA_VERSION, M4_OUTPUT_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSION } from './constants.js'
import { AiProviderFailure, type AiImageProvider, type AiImageProviderRequest, type AiImageProviderResult, type AiProvider, type AiProviderDiagnostics, type AiProviderRequest, type AiProviderResponseDiagnostics, type AiProviderResult, type TopicDiscoveryProvider, type TopicDiscoveryProviderRequest, type TopicDiscoveryProviderResult, type TopicDiscoverySource, type TopicDiscoverySourceDiagnostics } from './provider.js'

type JsonSchema = Record<string, unknown>

const OUTPUT_FORMATS: Record<string, { name: string; schema: JsonSchema }> = {
  [OUTPUT_SCHEMA_VERSION]: {
    name: 'm2_generate_v1',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        master: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            coreMessage: { type: 'string' },
            hook: { type: 'string' },
            body: { type: 'string' },
            cta: { type: 'string' },
          },
          required: ['title', 'coreMessage', 'hook', 'body', 'cta'],
        },
        visualDirection: {
          type: 'object',
          additionalProperties: false,
          properties: {
            format: { type: 'string' },
            concept: { type: 'string' },
            structure: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          required: ['format', 'concept', 'structure', 'notes'],
        },
      },
      required: ['master', 'visualDirection'],
    },
  },
  [M3_OUTPUT_SCHEMA_VERSION]: {
    name: 'm3_adapt_v1',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        copy: { type: 'string' },
        cta: { type: 'string' },
        hashtags: { type: 'string' },
        visualRecommendation: { type: 'string' },
      },
      required: ['copy', 'cta', 'hashtags', 'visualRecommendation'],
    },
  },
  [M4_OUTPUT_SCHEMA_VERSION]: {
    name: 'm4_brand_check_v1',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        score: { type: 'integer' },
        status: { type: 'string', enum: ['aligned', 'needs_attention'] },
        recommendation: { type: 'string' },
        checks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string', enum: [...M4_CHECK_LABELS] },
              status: { type: 'string', enum: ['pass', 'warning'] },
            },
            required: ['label', 'status'],
          },
        },
      },
      required: ['score', 'status', 'recommendation', 'checks'],
    },
  },
  [CREATIVE_REFERENCE_OUTPUT_SCHEMA_VERSION]: {
    name: 'm2_creative_reference_concepts_v1',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        concepts: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              conceptName: { type: 'string' },
              rationale: { type: 'string' },
              layoutNotes: { type: 'string' },
              visualFocus: { type: 'string' },
              typographyDirection: { type: 'string' },
              imagePrompt: { type: 'string' },
            },
            required: ['conceptName', 'rationale', 'layoutNotes', 'visualFocus', 'typographyDirection', 'imagePrompt'],
          },
        },
      },
      required: ['concepts'],
    },
  },
  [M2_DISCOVERY_OUTPUT_SCHEMA_VERSION]: {
    name: 'm2_idea_discovery_web_search_v1',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topics: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              whyCurrent: { type: 'string' },
              relevanceToCompany: { type: 'string' },
              contentAngle: { type: 'string' },
              suggestedObjective: { type: 'string', enum: ['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'] },
              suggestedPlatforms: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['instagram', 'linkedin'] } },
              sources: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    url: { type: 'string' },
                    title: { type: 'string' },
                    publisher: { type: ['string', 'null'] },
                    publishedAt: { type: ['string', 'null'] },
                  },
                  required: ['url', 'title', 'publisher', 'publishedAt'],
                },
              },
            },
            required: ['title', 'summary', 'whyCurrent', 'relevanceToCompany', 'contentAngle', 'suggestedObjective', 'suggestedPlatforms', 'sources'],
          },
        },
      },
      required: ['topics'],
    },
  },
  [M2_TELEGRAM_CHAT_OUTPUT_SCHEMA_VERSION]: {
    name: 'm2_telegram_ideation_chat_v1',
    schema: {
      type: 'object', additionalProperties: false,
      properties: { reply: { type: 'string' } },
      required: ['reply'],
    },
  },
  [M2_TELEGRAM_STRUCTURE_OUTPUT_SCHEMA_VERSION]: {
    name: 'm2_telegram_ideation_structure_v1',
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string' }, summary: { type: 'string' }, targetAudience: { type: 'string' },
        contentAngle: { type: 'string' }, contentPillarCode: { type: 'string' },
        objective: { type: 'string', enum: ['awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery'] },
        conversationSummary: { type: 'string' },
      },
      required: ['title', 'summary', 'targetAudience', 'contentAngle', 'contentPillarCode', 'objective', 'conversationSummary'],
    },
  },
}

export class OpenAiAiProvider implements AiProvider, AiImageProvider, TopicDiscoveryProvider {
  private readonly client: OpenAI | null

  constructor(private readonly config: Pick<AppConfig, 'openaiApiKey' | 'openaiModel' | 'aiRequestTimeoutMs'>) {
    this.client = config.openaiApiKey
      ? new OpenAI({ apiKey: config.openaiApiKey, timeout: config.aiRequestTimeoutMs, maxRetries: 0 })
      : null
  }

  isConfigured(model = this.config.openaiModel ?? undefined) {
    return Boolean(this.client && typeof model === 'string' && model.trim())
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    if (!this.client || !request.model.trim()) {
      throw new AiProviderFailure('not_configured', 'The OpenAI provider is not configured.')
    }
    const outputFormat = OUTPUT_FORMATS[request.outputSchemaVersion]
    if (!outputFormat) {
      throw new AiProviderFailure('invalid_response', 'The provider output contract is unsupported.')
    }

    try {
      const { data: response, request_id: sdkRequestId } = await this.client.responses.create({
        model: request.model,
        instructions: request.systemPrompt,
        input: [{ role: 'user', content: [{ type: 'input_text', text: request.userPrompt }] }],
        max_output_tokens: request.maxOutputTokens,
        reasoning: { effort: 'low' },
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: outputFormat.name,
            strict: true,
            schema: outputFormat.schema,
          },
        },
      }, { timeout: request.timeoutMs, maxRetries: 0 }).withResponse()

      const providerRequestId = getProviderRequestId(sdkRequestId, response)
      if (response.status !== 'completed' || !Array.isArray(response.output) || response.output.length === 0 || hasRefusal(response.output)) {
        throw new AiProviderFailure('invalid_response', 'The provider returned an incomplete or unsupported response.', providerRequestId)
      }
      const text = response.output_text
      if (typeof text !== 'string' || !text.trim()) {
        throw new AiProviderFailure('invalid_response', 'The provider returned an empty structured response.', providerRequestId)
      }
      try {
        const parsed: unknown = JSON.parse(text)
        if (!isRecord(parsed)) throw new Error('Structured output must be a JSON object.')
      } catch {
        throw new AiProviderFailure('invalid_response', 'The provider returned invalid structured output.', providerRequestId)
      }

      return {
        text,
        inputTokens: safeTokenCount(response.usage?.input_tokens),
        outputTokens: safeTokenCount(response.usage?.output_tokens),
        providerRequestId,
      }
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error
      if (error instanceof APIConnectionTimeoutError) {
        throw new AiProviderFailure('timeout', 'The OpenAI provider request timed out.')
      }
      if (error instanceof APIError && error.status === 429) {
        throw new AiProviderFailure('rate_limit', 'The OpenAI provider rate limit was reached.', safeRequestId(error.requestID), safeDiagnostics(error))
      }
      const requestId = error instanceof APIError ? safeRequestId(error.requestID) : null
      throw new AiProviderFailure('provider', 'The OpenAI provider request failed.', requestId, error instanceof APIError ? safeDiagnostics(error) : null)
    }
  }

  async discoverTopics(request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult> {
    if (!this.client || !request.model.trim()) {
      throw new AiProviderFailure('not_configured', 'The OpenAI provider is not configured.')
    }
    const outputFormat = OUTPUT_FORMATS[M2_DISCOVERY_OUTPUT_SCHEMA_VERSION]
    if (!outputFormat) throw new AiProviderFailure('invalid_response', 'The provider output contract is unsupported.')
    try {
      const { data: response, request_id: sdkRequestId } = await this.client.responses.create({
        model: request.model,
        instructions: request.systemPrompt,
        input: [{ role: 'user', content: [{ type: 'input_text', text: request.userPrompt }] }],
        tools: [{ type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', country: 'ID' } }],
        include: ['web_search_call.action.sources'],
        max_output_tokens: request.maxOutputTokens,
        reasoning: { effort: 'low' },
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: outputFormat.name,
            strict: true,
            schema: outputFormat.schema,
          },
        },
      }, { timeout: request.timeoutMs, maxRetries: 0 }).withResponse()
      const providerRequestId = getProviderRequestId(sdkRequestId, response)
      const responseDiagnostics = topicResponseDiagnostics(response, 'not_attempted')
      if (response.status !== 'completed' || !Array.isArray(response.output) || response.output.length === 0 || responseDiagnostics.refusalDetected) {
        throw new AiProviderFailure('invalid_response', 'The provider returned an incomplete or unsupported topic discovery response.', providerRequestId, null, responseDiagnostics)
      }
      const text = response.output_text
      if (typeof text !== 'string' || !text.trim()) throw new AiProviderFailure('invalid_response', 'The provider returned an empty topic discovery response.', providerRequestId, null, responseDiagnostics)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new AiProviderFailure('invalid_response', 'The provider returned invalid topic discovery output.', providerRequestId, null, topicResponseDiagnostics(response, 'failed'))
      }
      if (!isRecord(parsed) || !Array.isArray(parsed.topics)) throw new AiProviderFailure('invalid_response', 'The provider returned invalid topic discovery output.', providerRequestId, null, topicResponseDiagnostics(response, 'invalid_shape'))
      const sourceExtraction = collectSources(response)
      return {
        text,
        sources: sourceExtraction.sources,
        sourceDiagnostics: sourceExtraction.diagnostics,
        inputTokens: safeTokenCount(response.usage?.input_tokens),
        outputTokens: safeTokenCount(response.usage?.output_tokens),
        providerRequestId,
      }
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error
      if (error instanceof APIConnectionTimeoutError) throw new AiProviderFailure('timeout', 'The OpenAI provider request timed out.')
      if (error instanceof APIError && error.status === 429) throw new AiProviderFailure('rate_limit', 'The OpenAI provider rate limit was reached.', safeRequestId(error.requestID), safeDiagnostics(error))
      const requestId = error instanceof APIError ? safeRequestId(error.requestID) : null
      throw new AiProviderFailure('provider', 'The OpenAI provider request failed.', requestId, error instanceof APIError ? safeDiagnostics(error) : null)
    }
  }

  async generateImage(request: AiImageProviderRequest): Promise<AiImageProviderResult> {
    if (!this.client || !request.model.trim()) {
      throw new AiProviderFailure('not_configured', 'The OpenAI provider is not configured.')
    }
    try {
      const { data: response, request_id: sdkRequestId } = await this.client.images.generate({
        model: request.model,
        prompt: request.prompt,
        quality: request.quality,
        size: request.size,
        output_format: request.outputFormat,
        n: 1,
      }, { timeout: request.timeoutMs, maxRetries: 0 }).withResponse()
      const providerRequestId = nonBlankString(sdkRequestId)
      const base64 = response.data?.[0]?.b64_json
      if (typeof base64 !== 'string' || !base64.trim()) {
        throw new AiProviderFailure('invalid_response', 'The provider returned no image data.', providerRequestId)
      }
      return {
        base64,
        providerRequestId,
        inputTokens: safeTokenCount(response.usage?.input_tokens),
        outputTokens: safeTokenCount(response.usage?.output_tokens),
      }
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error
      if (error instanceof APIConnectionTimeoutError) throw new AiProviderFailure('timeout', 'The OpenAI image provider request timed out.')
      if (error instanceof APIError && error.status === 429) throw new AiProviderFailure('rate_limit', 'The OpenAI image provider rate limit was reached.', safeRequestId(error.requestID), safeDiagnostics(error))
      const requestId = error instanceof APIError ? safeRequestId(error.requestID) : null
      throw new AiProviderFailure('provider', 'The OpenAI image provider request failed.', requestId, error instanceof APIError ? safeDiagnostics(error) : null)
    }
  }
}

function getProviderRequestId(sdkRequestId: unknown, response: { id?: unknown; _request_id?: unknown }) {
  return nonBlankString(sdkRequestId) ?? nonBlankString(response._request_id) ?? nonBlankString(response.id)
}

function safeTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function hasRefusal(output: unknown[]) {
  return output.some((item) => isRecord(item) && item.type === 'message' && Array.isArray(item.content)
    && item.content.some((content) => isRecord(content) && content.type === 'refusal'))
}

function collectSources(response: unknown): { sources: TopicDiscoverySource[]; diagnostics: TopicDiscoverySourceDiagnostics } {
  const sourceMap = new Map<string, TopicDiscoverySource>()
  let webSearchCallCount = 0
  let actionSourceCount = 0
  let citationAnnotationCount = 0
  const output = isRecord(response) && Array.isArray(response.output) ? response.output : []

  const addSource = (value: Record<string, unknown>) => {
    const url = typeof value.url === 'string' ? safeUrl(value.url) : null
    if (!url) return
    const candidate: TopicDiscoverySource = {
      url,
      title: nonBlankString(value.title),
      publisher: nonBlankString(value.publisher),
      publishedAt: nonBlankString(value.published_at) ?? nonBlankString(value.publishedAt),
    }
    const existing = sourceMap.get(url)
    if (!existing) {
      sourceMap.set(url, candidate)
      return
    }
    sourceMap.set(url, {
      url,
      title: existing.title ?? candidate.title,
      publisher: existing.publisher ?? candidate.publisher,
      publishedAt: existing.publishedAt ?? candidate.publishedAt,
    })
  }

  for (const item of output) {
    if (!isRecord(item)) continue
    if (item.type === 'web_search_call') {
      webSearchCallCount += 1
      const action = isRecord(item.action) ? item.action : null
      const actionSources = action?.type === 'search' && Array.isArray(action.sources) ? action.sources : []
      actionSourceCount += actionSources.length
      for (const source of actionSources) {
        if (isRecord(source)) addSource(source)
      }
      continue
    }
    if (item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!isRecord(content) || content.type !== 'output_text' || !Array.isArray(content.annotations)) continue
      for (const annotation of content.annotations) {
        if (!isRecord(annotation) || annotation.type !== 'url_citation') continue
        citationAnnotationCount += 1
        addSource(annotation)
      }
    }
  }

  const sources = [...sourceMap.values()]
  return {
    sources,
    diagnostics: { webSearchCallCount, actionSourceCount, citationAnnotationCount, deduplicatedProviderSourceCount: sources.length },
  }
}

function safeUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch { return null }
}

function nonBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function safeRequestId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : null
}

function safeDiagnosticLabel(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : null
}

function safeDiagnostics(error: APIError): AiProviderDiagnostics {
  return {
    httpStatus: typeof error.status === 'number' && Number.isInteger(error.status) ? error.status : null,
    errorType: safeDiagnosticLabel(error.type),
    errorCode: safeDiagnosticLabel(error.code),
    errorParam: safeDiagnosticLabel(error.param),
    providerMessage: safeProviderMessage(error),
  }
}

function topicResponseDiagnostics(response: { status?: unknown; incomplete_details?: unknown; output?: unknown; output_text?: unknown }, jsonParse: AiProviderResponseDiagnostics['jsonParse']): AiProviderResponseDiagnostics {
  const output = response.output
  const outputItems = Array.isArray(output) ? output : []
  return {
    responseStatus: safeDiagnosticLabel(response.status),
    incompleteReason: isRecord(response.incomplete_details) ? safeDiagnosticLabel(response.incomplete_details.reason) : null,
    outputExists: output !== undefined && output !== null,
    outputItemTypes: outputItems.map((item) => isRecord(item) ? safeDiagnosticLabel(item.type) ?? 'unknown' : 'unknown').slice(0, 20),
    refusalDetected: Array.isArray(output) && hasRefusal(output),
    outputTextExists: response.output_text !== undefined && response.output_text !== null,
    outputTextLength: typeof response.output_text === 'string' ? response.output_text.length : null,
    jsonParse,
  }
}

function safeProviderMessage(error: APIError) {
  const body = isRecord(error.error) && typeof error.error.message === 'string' ? error.error.message : error.message
  if (typeof body !== 'string' || !body.trim()) return null
  const sanitized = body
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|authorization|cookie|session(?:[_-]?id)?)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized ? sanitized.slice(0, 500) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
