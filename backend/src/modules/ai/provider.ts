export interface AiProviderRequest {
  model: string
  outputSchemaVersion: string
  systemPrompt: string
  userPrompt: string
  images?: Array<{ mimeType: 'image/png' | 'image/jpeg'; base64: string }>
  maxOutputTokens: number
  timeoutMs: number
  signal?: AbortSignal | undefined
}

export interface AiProviderResult {
  text: string
  inputTokens: number | null
  cachedInputTokens?: number | null
  outputTokens: number | null
  providerRequestId: string | null
}

export interface AiProvider {
  readonly providerId?: string
  readonly modelId?: string
  readonly executionMode?: 'real' | 'demo'
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
  cachedInputTokens?: number | null
  outputTokens: number | null
  providerRequestId: string | null
}

export interface TopicDiscoveryProvider {
  readonly providerId?: string
  readonly modelId?: string
  readonly executionMode?: 'real' | 'demo'
  discoverTopics(request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult>
  recommendPublicationTimes?(request: TopicDiscoveryProviderRequest): Promise<TopicDiscoveryProviderResult>
  isConfigured?(model?: string): boolean
}

export interface ProspectResearchProviderRequest extends TopicDiscoveryProviderRequest {}
export interface ProspectResearchProviderResult extends TopicDiscoveryProviderResult {}
export interface ProspectResearchProvider {
  readonly providerId?: string
  readonly modelId?: string
  readonly executionMode?: 'real' | 'demo'
  researchProspect(request: ProspectResearchProviderRequest): Promise<ProspectResearchProviderResult>
  isConfigured?(model?: string): boolean
}

export interface AiImageProviderRequest {
  model: string
  prompt: string
  quality: 'low' | 'medium' | 'high'
  size: '1024x1024' | '1024x1536' | '1536x1024'
  outputFormat: 'png'
  timeoutMs: number
  signal?: AbortSignal | undefined
}

export interface AiImageEditRequest extends AiImageProviderRequest {
  image: Buffer
}

export interface AiImageProviderResult {
  base64: string
  providerRequestId: string | null
  inputTokens: number | null
  cachedInputTokens?: number | null
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
  readonly providerId?: string
  readonly modelId?: string
  readonly executionMode?: 'real' | 'demo'
  generateImage(request: AiImageProviderRequest): Promise<AiImageProviderResult>
  editImage?(request: AiImageEditRequest): Promise<AiImageProviderResult>
  isConfigured?(model?: string): boolean
}

export function aiExecution(provider: { providerId?: string; modelId?: string; executionMode?: 'real' | 'demo' }, requestedModel: string) {
  return {
    provider: provider.providerId ?? 'openai',
    model: provider.modelId ?? requestedModel,
    mode: provider.executionMode ?? 'real',
  }
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
