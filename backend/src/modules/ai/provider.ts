export interface AiProviderRequest {
  model: string
  outputSchemaVersion: string
  systemPrompt: string
  userPrompt: string
  maxOutputTokens: number
  timeoutMs: number
}

export interface AiProviderResult {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  providerRequestId: string | null
}

export interface AiProvider {
  generate(request: AiProviderRequest): Promise<AiProviderResult>
  isConfigured?(model?: string): boolean
}

export type AiProviderFailureKind = 'timeout' | 'rate_limit' | 'provider' | 'not_configured' | 'invalid_response'

export class AiProviderFailure extends Error {
  constructor(
    public readonly kind: AiProviderFailureKind,
    message: string,
    public readonly providerRequestId: string | null = null,
  ) {
    super(message)
    this.name = 'AiProviderFailure'
  }
}
