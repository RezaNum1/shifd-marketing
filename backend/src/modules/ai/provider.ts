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

export interface TopicDiscoverySource {
  url: string
  title: string | null
  publisher: string | null
  publishedAt: string | null
}

export interface TopicDiscoverySourceDiagnostics {
  webSearchCallCount: number
  actionSourceCount: number
  citationAnnotationCount: number
  deduplicatedProviderSourceCount: number
}

export interface TopicDiscoveryProviderRequest {
  model: string
  systemPrompt: string
  userPrompt: string
  maxOutputTokens: number
  timeoutMs: number
}

export interface TopicDiscoveryProviderResult {
  text: string
  sources: TopicDiscoverySource[]
  sourceDiagnostics: TopicDiscoverySourceDiagnostics
  inputTokens: number | null
  outputTokens: number | null
  providerRequestId: string | null
}

export interface TopicDiscoveryProvider {
  discoverTopics(request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult>
  isConfigured?(model?: string): boolean
}

export interface AiImageProviderRequest {
  model: string
  prompt: string
  quality: 'low' | 'medium' | 'high'
  size: '1024x1024' | '1024x1536' | '1536x1024'
  outputFormat: 'png'
  timeoutMs: number
}

export interface AiImageProviderResult {
  base64: string
  providerRequestId: string | null
  inputTokens: number | null
  outputTokens: number | null
}

export interface AiProviderDiagnostics {
  httpStatus: number | null
  errorType: string | null
  errorCode: string | null
  errorParam: string | null
  providerMessage: string | null
}

export interface AiProviderResponseDiagnostics {
  responseStatus: string | null
  incompleteReason: string | null
  outputExists: boolean
  outputItemTypes: string[]
  refusalDetected: boolean
  outputTextExists: boolean
  outputTextLength: number | null
  jsonParse: 'not_attempted' | 'failed' | 'invalid_shape'
}

export interface AiImageProvider {
  generateImage(request: AiImageProviderRequest): Promise<AiImageProviderResult>
  isConfigured?(model?: string): boolean
}

export type AiProviderFailureKind = 'timeout' | 'rate_limit' | 'provider' | 'not_configured' | 'invalid_response'

export class AiProviderFailure extends Error {
  constructor(
    public readonly kind: AiProviderFailureKind,
    message: string,
    public readonly providerRequestId: string | null = null,
    public readonly diagnostics: AiProviderDiagnostics | null = null,
    public readonly responseDiagnostics: AiProviderResponseDiagnostics | null = null,
  ) {
    super(message)
    this.name = 'AiProviderFailure'
  }
}
