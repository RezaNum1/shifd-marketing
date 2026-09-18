import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai'
import type { AppConfig } from '../../config/env.js'
import { M4_CHECK_LABELS } from './output.js'
import { M3_OUTPUT_SCHEMA_VERSION, M4_OUTPUT_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSION } from './constants.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from './provider.js'

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
}

export class OpenAiAiProvider implements AiProvider {
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
        throw new AiProviderFailure('rate_limit', 'The OpenAI provider rate limit was reached.', error.requestID ?? null)
      }
      const requestId = error instanceof APIError ? error.requestID ?? null : null
      throw new AiProviderFailure('provider', 'The OpenAI provider request failed.', requestId)
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

function nonBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
