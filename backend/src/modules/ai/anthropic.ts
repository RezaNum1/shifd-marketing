import Anthropic, { APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk'
import type { AppConfig } from '../../config/env.js'
import { AiProviderFailure, type AiProvider, type AiProviderRequest, type AiProviderResult } from './provider.js'

export class AnthropicAiProvider implements AiProvider {
  private readonly client: Anthropic | null

  constructor(private readonly config: Pick<AppConfig, 'anthropicApiKey' | 'anthropicModel' | 'aiRequestTimeoutMs'>) {
    this.client = config.anthropicApiKey
      ? new Anthropic({ apiKey: config.anthropicApiKey, timeout: config.aiRequestTimeoutMs, maxRetries: 0 })
      : null
  }

  isConfigured(model = this.config.anthropicModel ?? undefined) {
    return Boolean(this.client && model)
  }

  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    if (!this.client) throw new AiProviderFailure('not_configured', 'The Anthropic provider is not configured.')
    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxOutputTokens,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      }, { timeout: request.timeoutMs, maxRetries: 0 })
      if (!Array.isArray(response.content) || response.content.length === 0 || response.content.some((block) => block.type !== 'text')) {
        throw new AiProviderFailure('invalid_response', 'The provider returned an unsupported response form.', response.id || null)
      }
      const text = response.content.map((block) => block.type === 'text' ? block.text : '').join('')
      return {
        text,
        inputTokens: Number.isSafeInteger(response.usage.input_tokens) ? response.usage.input_tokens : null,
        outputTokens: Number.isSafeInteger(response.usage.output_tokens) ? response.usage.output_tokens : null,
        providerRequestId: response.id || null,
      }
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error
      if (error instanceof APIConnectionTimeoutError) throw new AiProviderFailure('timeout', 'The AI provider request timed out.')
      if (error instanceof APIError && error.status === 429) throw new AiProviderFailure('rate_limit', 'The AI provider rate limit was reached.', error.requestID ?? null)
      const requestId = error instanceof APIError ? error.requestID ?? null : null
      throw new AiProviderFailure('provider', 'The AI provider request failed.', requestId)
    }
  }
}
