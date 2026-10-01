import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/config/env.js'
import { M3_OUTPUT_SCHEMA_VERSION, M4_OUTPUT_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSION } from '../src/modules/ai/constants.js'
import { OpenAiAiProvider } from '../src/modules/ai/openai.js'
import { M4_CHECK_LABELS } from '../src/modules/ai/output.js'
import { AiProviderFailure, type AiImageProviderRequest, type AiProviderRequest } from '../src/modules/ai/provider.js'
import { mapProviderFailure } from '../src/modules/ai/service.js'

const config: Pick<AppConfig, 'openaiApiKey' | 'openaiModel' | 'aiRequestTimeoutMs'> = {
  openaiApiKey: 'unit-test-key-not-valid',
  openaiModel: 'gpt-5.6-luna',
  aiRequestTimeoutMs: 60_000,
}

const m2Output = {
  master: { title: 'Title', coreMessage: 'Message', hook: 'Hook', body: 'Body', cta: 'CTA' },
  visualDirection: { format: 'Carousel', concept: 'Concept', structure: ['Start'], notes: 'Notes' },
}

const request: AiProviderRequest = {
  model: 'gpt-5.6-luna',
  outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
  systemPrompt: 'Immutable server instruction.',
  userPrompt: 'UNTRUSTED DATA: saved brief content.',
  maxOutputTokens: 1_234,
  timeoutMs: 2_345,
}

const imageRequest: AiImageProviderRequest = {
  model: 'gpt-image-2',
  prompt: 'A private B2B visual reference mockup.',
  quality: 'medium',
  size: '1024x1536',
  outputFormat: 'png',
  timeoutMs: 2_345,
}

const discoveryRequest = {
  model: 'gpt-5.6-luna',
  systemPrompt: 'Current topic discovery instructions.',
  userPrompt: 'Indonesia; last 7 days; workflow efficiency.',
  maxOutputTokens: 4_096,
  timeoutMs: 2_345,
}

const completedResponse = (text: unknown = JSON.stringify(m2Output)) => ({
  id: 'resp_fallback_id',
  _request_id: 'req_response_id',
  status: 'completed',
  // Reasoning precedes the assistant message to ensure extraction does not assume output[0].content[0].
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text }] },
  ],
  output_text: text,
  usage: { input_tokens: 41, output_tokens: 19 },
})

type SdkClientMock = {
  maxRetries: number
  timeout: number
  responses: { create: (body: unknown, options?: unknown) => { withResponse: () => Promise<{ data: unknown; request_id: string | null }> } }
  images: { generate: (body: unknown, options?: unknown) => { withResponse: () => Promise<{ data: unknown; request_id: string | null }> } }
}

function withResponse(response: unknown, requestId: string | null = 'req_sdk_id') {
  const provider = new OpenAiAiProvider(config)
  const client = (provider as unknown as { client: SdkClientMock }).client
  const responsePromise = vi.fn().mockResolvedValue({ data: response, request_id: requestId })
  const create = vi.fn<SdkClientMock['responses']['create']>().mockReturnValue({ withResponse: responsePromise })
  client.responses.create = create
  return { provider, client, create, responsePromise }
}

function withRejectedResponse(error: unknown) {
  const mocks = withResponse(null)
  mocks.responsePromise.mockRejectedValue(error)
  return mocks
}

afterEach(() => vi.restoreAllMocks())

describe('OpenAI Responses API adapter', () => {
  it('uses one no-retry Responses web_search request and returns only provider source metadata', async () => {
    const output = { topics: [{ title: 'Approval workflow guidance', summary: 'A current discussion.', whyCurrent: 'Published this week.', relevanceToCompany: 'Relevant to approval teams.', contentAngle: 'Explain the operational question.', suggestedObjective: 'education', suggestedPlatforms: ['linkedin'], sources: [{ url: 'https://example.com/report', title: 'Report', publisher: 'Example', publishedAt: '2026-09-19' }] }] }
    const response = { ...completedResponse(JSON.stringify(output)), output: [{ type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/report' }] }, }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }
    const { provider, client, create } = withResponse(response)
    const result = await provider.discoverTopics(discoveryRequest)

    expect(create).toHaveBeenCalledTimes(1)
    expect(client.maxRetries).toBe(0)
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-5.6-luna',
      tools: [{ type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', country: 'ID' } }],
      include: ['web_search_call.action.sources'],
      max_output_tokens: 4_096,
      store: false,
      text: { format: { type: 'json_schema', name: 'm2_idea_discovery_web_search_v1', strict: true } },
    })
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 2_345, maxRetries: 0 })
    expect(result).toMatchObject({ inputTokens: 41, outputTokens: 19, providerRequestId: 'req_sdk_id', sources: [{ url: 'https://example.com/report', title: null, publisher: null, publishedAt: null }], sourceDiagnostics: { webSearchCallCount: 1, actionSourceCount: 1, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 1 } })
  })

  it('aggregates sources from multiple web search calls', async () => {
    const output = { topics: [] }
    const response = { ...completedResponse(JSON.stringify(output)), output: [
      { type: 'reasoning', summary: [] },
      { type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/one' }] } },
      { type: 'reasoning', summary: [] },
      { type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/two' }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
    ] }
    const { provider } = withResponse(response)
    await expect(provider.discoverTopics(discoveryRequest)).resolves.toMatchObject({
      sources: [{ url: 'https://example.com/one' }, { url: 'https://example.com/two' }],
      sourceDiagnostics: { webSearchCallCount: 2, actionSourceCount: 2, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 2 },
    })
  })

  it('extracts authoritative URL citation annotations from output text', async () => {
    const output = { topics: [] }
    const response = { ...completedResponse(JSON.stringify(output)), output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [{ type: 'url_citation', url: 'https://example.com/cited', title: 'Cited source', start_index: 0, end_index: 10 }] }] }] }
    const { provider } = withResponse(response)
    await expect(provider.discoverTopics(discoveryRequest)).resolves.toMatchObject({
      sources: [{ url: 'https://example.com/cited', title: 'Cited source', publisher: null, publishedAt: null }],
      sourceDiagnostics: { webSearchCallCount: 0, actionSourceCount: 0, citationAnnotationCount: 1, deduplicatedProviderSourceCount: 1 },
    })
  })

  it('merges and canonicalizes duplicate action and citation sources', async () => {
    const output = { topics: [] }
    const response = { ...completedResponse(JSON.stringify(output)), output: [
      { type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/source/' }] } },
      { type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.com/other' }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [
        { type: 'url_citation', url: 'https://EXAMPLE.com/source/#section', title: 'Canonical source', start_index: 0, end_index: 10 },
        { type: 'url_citation', url: 'https://example.com/other', title: 'Other source', start_index: 0, end_index: 10 },
      ] }] },
    ] }
    const { provider } = withResponse(response)
    const result = await provider.discoverTopics(discoveryRequest)
    expect(result.sources).toHaveLength(2)
    expect(result.sources).toContainEqual({ url: 'https://example.com/source', title: 'Canonical source', publisher: null, publishedAt: null })
    expect(result.sourceDiagnostics).toEqual({ webSearchCallCount: 2, actionSourceCount: 2, citationAnnotationCount: 2, deduplicatedProviderSourceCount: 2 })
  })

  it('accepts a completed structured response containing six topics', async () => {
    const topics = Array.from({ length: 6 }, (_, index) => ({ title: `Topic ${index + 1}`, summary: 'A current discussion.', whyCurrent: 'Published in the requested window.', relevanceToCompany: 'Relevant to the company.', contentAngle: 'Explain the operational implication.', suggestedObjective: 'education', suggestedPlatforms: ['linkedin'], sources: [{ url: `https://example.com/topic-${index + 1}`, title: `Topic source ${index + 1}`, publisher: 'Example', publishedAt: '2026-09-19' }] }))
    const text = JSON.stringify({ topics })
    const response = { ...completedResponse(text), output: [{ type: 'web_search_call', action: { type: 'search', sources: [] } }, { type: 'message', content: [{ type: 'output_text', text }] }] }
    const { provider, create } = withResponse(response)
    await expect(provider.discoverTopics(discoveryRequest)).resolves.toMatchObject({ text, sources: [], sourceDiagnostics: { webSearchCallCount: 1, actionSourceCount: 0, citationAnnotationCount: 0, deduplicatedProviderSourceCount: 0 } })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('maps malformed discovery responses and provider failures safely without retrying', async () => {
    const invalid = withResponse({ ...completedResponse('{not-json'), output: [{ type: 'message', content: [{ type: 'output_text', text: '{not-json' }] }] })
    await expect(invalid.provider.discoverTopics(discoveryRequest)).rejects.toMatchObject({ kind: 'invalid_response' })
    expect(invalid.create).toHaveBeenCalledTimes(1)
    const error = new APIError(400, { message: 'Invalid JSON schema: uniqueItems is not supported.', type: 'invalid_request_error', code: 'invalid_json_schema', param: 'text.format.schema' }, 'Authorization: Bearer secret-value', new Headers({ 'x-request-id': 'req_400' }))
    const failed = withRejectedResponse(error)
    await expect(failed.provider.discoverTopics(discoveryRequest)).rejects.toMatchObject({ kind: 'provider', providerRequestId: 'req_400', diagnostics: { httpStatus: 400, errorType: 'invalid_request_error', errorCode: 'invalid_json_schema', errorParam: 'text.format.schema', providerMessage: 'Invalid JSON schema: uniqueItems is not supported.' } })
    expect(failed.create).toHaveBeenCalledTimes(1)
  })

  it('exposes the discovery output schema as a strict bounded six-topic contract', async () => {
    const output = { topics: [] }
    const { provider, create } = withResponse(completedResponse(JSON.stringify(output)))
    await provider.discoverTopics(discoveryRequest)
    const body = create.mock.calls[0]?.[0] as { text: { format: { schema: { properties: Record<string, { maxItems?: number; minItems?: number; uniqueItems?: boolean; items?: { properties?: Record<string, unknown>; enum?: string[]; type?: string } }> } } } }
    expect(body.text.format.schema.properties.topics?.maxItems).toBe(6)
    expect(body.text.format.schema.properties.topics?.items?.properties).toHaveProperty('sources')
    const platforms = body.text.format.schema.properties.topics?.items?.properties?.suggestedPlatforms as { minItems?: number; maxItems?: number; uniqueItems?: boolean; items?: { type?: string; enum?: string[] } }
    expect(platforms).toMatchObject({ type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['instagram', 'linkedin'] } })
    expect(platforms).not.toHaveProperty('uniqueItems')
  })

  it('reports safe diagnostics for an incomplete response', async () => {
    const response = { ...completedResponse(''), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'web_search_call' }, { type: 'message', content: [] }] }
    const { provider, create } = withResponse(response)
    const failure = await provider.discoverTopics(discoveryRequest).catch((value) => value as AiProviderFailure)
    expect(failure).toMatchObject({
      kind: 'invalid_response',
      providerRequestId: 'req_sdk_id',
      responseDiagnostics: {
        responseStatus: 'incomplete',
        incompleteReason: 'max_output_tokens',
        outputExists: true,
        outputItemTypes: ['web_search_call', 'message'],
        refusalDetected: false,
        outputTextExists: true,
        outputTextLength: 0,
        jsonParse: 'not_attempted',
      },
    })
    expect(JSON.stringify(failure)).not.toContain('output_text content')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('maps refusal, empty output text, and malformed JSON as invalid responses with safe diagnostics', async () => {
    const cases = [
      { response: { ...completedResponse(''), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Not supported.' }] }] }, expected: { refusalDetected: true, outputTextLength: 0, jsonParse: 'not_attempted' } },
      { response: { ...completedResponse('{}'), output: [] }, expected: { refusalDetected: false, outputTextLength: 2, jsonParse: 'not_attempted' } },
      { response: { ...completedResponse(''), output: [{ type: 'message', content: [] }] }, expected: { refusalDetected: false, outputTextLength: 0, jsonParse: 'not_attempted' } },
      { response: { ...completedResponse('{not-json'), output: [{ type: 'message', content: [{ type: 'output_text', text: '{not-json' }] }] }, expected: { refusalDetected: false, outputTextLength: 9, jsonParse: 'failed' } },
      { response: { ...completedResponse('[]'), output: [{ type: 'message', content: [{ type: 'output_text', text: '[]' }] }] }, expected: { refusalDetected: false, outputTextLength: 2, jsonParse: 'invalid_shape' } },
    ]
    for (const testCase of cases) {
      const { provider, create } = withResponse(testCase.response)
      const failure = await provider.discoverTopics(discoveryRequest).catch((value) => value as AiProviderFailure)
      expect(failure).toMatchObject({ kind: 'invalid_response', responseDiagnostics: testCase.expected })
      expect(create).toHaveBeenCalledTimes(1)
    }
  })

  it('keeps provider diagnostics out of the browser-facing error while retaining safe development diagnostics', () => {
    const failure = new AiProviderFailure('provider', 'The OpenAI provider request failed.', 'req_safe', { httpStatus: 400, errorType: 'invalid_request_error', errorCode: 'invalid_json_schema', errorParam: 'text.format.schema', providerMessage: 'Invalid JSON schema: uniqueItems is not supported.' })
    const mapped = mapProviderFailure(failure)
    expect(mapped).toMatchObject({ code: 'AI_PROVIDER_ERROR', message: 'The AI provider request failed.' })
    expect(JSON.stringify(mapped)).not.toContain('uniqueItems')
    expect((mapped as AppErrorWithProviderDiagnostics).providerDiagnostics).toMatchObject({ requestId: 'req_safe', providerMessage: 'Invalid JSON schema: uniqueItems is not supported.' })
  })

  it('keeps response diagnostics internal and excludes output content', () => {
    const failure = new AiProviderFailure('invalid_response', 'The provider returned an incomplete response.', 'req_incomplete', null, { responseStatus: 'incomplete', incompleteReason: 'max_output_tokens', outputExists: true, outputItemTypes: ['web_search_call', 'message'], refusalDetected: false, outputTextExists: true, outputTextLength: 0, jsonParse: 'not_attempted' })
    const mapped = mapProviderFailure(failure)
    expect(JSON.stringify(mapped)).not.toContain('web_search_call')
    expect((mapped as AppErrorWithProviderDiagnostics).providerDiagnostics).toMatchObject({ requestId: 'req_incomplete', responseStatus: 'incomplete', incompleteReason: 'max_output_tokens', outputTextLength: 0 })
  })

  it('requests strict M2 Structured Outputs with safe prompt separation and maps response metadata', async () => {
    const { provider, client, create } = withResponse(completedResponse())
    const result = await provider.generate(request)

    expect(client.maxRetries).toBe(0)
    expect(client.timeout).toBe(config.aiRequestTimeoutMs)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-5.6-luna',
      instructions: 'Immutable server instruction.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'UNTRUSTED DATA: saved brief content.' }] }],
      max_output_tokens: 1_234,
      reasoning: { effort: 'low' },
      store: false,
      text: { format: { type: 'json_schema', name: 'm2_generate_v1', strict: true } },
    })
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('tools')
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 2_345, maxRetries: 0 })
    expect(result).toEqual({ text: JSON.stringify(m2Output), inputTokens: 41, outputTokens: 19, providerRequestId: 'req_sdk_id' })
  })

  it.each([
    [M3_OUTPUT_SCHEMA_VERSION, 'm3_adapt_v1', ['copy', 'cta', 'hashtags', 'visualRecommendation']],
    [M4_OUTPUT_SCHEMA_VERSION, 'm4_brand_check_v1', ['score', 'status', 'recommendation', 'checks']],
  ])('selects strict %s JSON Schema without changing its output contract', async (outputSchemaVersion, name, keys) => {
    const { provider, create } = withResponse(completedResponse('{}'))
    await provider.generate({ ...request, outputSchemaVersion })
    const body = create.mock.calls[0]?.[0] as { text: { format: { name: string; strict: boolean; schema: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { type?: string; enum?: string[]; additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> }> } } } }
    expect(body.text.format.name).toBe(name)
    expect(body.text.format.strict).toBe(true)
    expect(body.text.format.schema.type).toBe('object')
    expect(body.text.format.schema.additionalProperties).toBe(false)
    expect(Object.keys(body.text.format.schema.properties)).toEqual(keys)
    expect(body.text.format.schema.required).toEqual(keys)
    if (outputSchemaVersion === M3_OUTPUT_SCHEMA_VERSION) {
      for (const key of keys) expect(body.text.format.schema.properties[key]).toEqual({ type: 'string' })
    }
    if (outputSchemaVersion === M4_OUTPUT_SCHEMA_VERSION) {
      const schema = body.text.format.schema.properties
      expect(schema.status).toEqual({ type: 'string', enum: ['aligned', 'needs_attention'] })
      const checks = schema.checks as { type: string; items: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { type?: string; enum?: string[] }> } }
      expect(checks).toMatchObject({ type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'status'] } })
      expect(checks.items.properties.label).toEqual({ type: 'string', enum: [...M4_CHECK_LABELS] })
      expect(checks.items.properties.status).toEqual({ type: 'string', enum: ['pass', 'warning'] })
    }
  })

  it('defines the exact strict M2 output keys and nested field types', async () => {
    const { provider, create } = withResponse(completedResponse())
    await provider.generate(request)
    const body = create.mock.calls[0]?.[0] as { text: { format: { schema: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> }> } } } }
    const schema = body.text.format.schema
    const master = schema.properties.master!
    const visualDirection = schema.properties.visualDirection!
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, required: ['master', 'visualDirection'] })
    expect(Object.keys(schema.properties)).toEqual(['master', 'visualDirection'])
    expect(master).toMatchObject({ type: 'object', additionalProperties: false, required: ['title', 'coreMessage', 'hook', 'body', 'cta'] })
    expect(Object.keys(master.properties)).toEqual(['title', 'coreMessage', 'hook', 'body', 'cta'])
    expect(Object.values(master.properties)).toEqual(Array(5).fill({ type: 'string' }))
    expect(visualDirection).toMatchObject({ type: 'object', additionalProperties: false, required: ['format', 'concept', 'structure', 'notes'] })
    expect(Object.keys(visualDirection.properties)).toEqual(['format', 'concept', 'structure', 'notes'])
    expect(visualDirection.properties).toEqual({
      format: { type: 'string' },
      concept: { type: 'string' },
      structure: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    })
  })

  it('keeps unavailable or unsafe token usage null and falls back to the response ID', async () => {
    const response = { ...completedResponse(), _request_id: null, usage: null }
    const { provider } = withResponse(response, null)
    await expect(provider.generate(request)).resolves.toMatchObject({
      inputTokens: null,
      outputTokens: null,
      providerRequestId: 'resp_fallback_id',
    })
  })

  it('maps timeout errors without exposing provider details', async () => {
    const { provider } = withRejectedResponse(new APIConnectionTimeoutError({ message: 'private timeout detail' }))
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'timeout', message: 'The OpenAI provider request timed out.' })
  })

  it('maps 429 errors to the safe rate-limit failure and captures the request ID', async () => {
    const error = new APIError(429, { message: 'private rate-limit body' }, 'private rate-limit detail', new Headers({ 'x-request-id': 'req_rate_limited' }))
    const { provider } = withRejectedResponse(error)
    await expect(provider.generate(request)).rejects.toMatchObject({
      kind: 'rate_limit',
      providerRequestId: 'req_rate_limited',
      message: 'The OpenAI provider rate limit was reached.',
    })
  })

  it('maps authentication, connection, and server failures to safe provider failures', async () => {
    const errors = [
      new APIError(401, { message: 'private credential response' }, 'private credential error', new Headers({ 'x-request-id': 'req_auth' })),
      new APIConnectionError({ message: 'private connection details' }),
      new APIError(503, { message: 'private server body' }, 'private server detail', new Headers({ 'x-request-id': 'req_server' })),
    ]
    for (const error of errors) {
      const { provider } = withRejectedResponse(error)
      await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'provider', message: 'The OpenAI provider request failed.' })
    }
  })

  it('retains only safe provider diagnostics and never retains raw headers or error text', async () => {
    const error = new APIError(403, { message: 'Model gpt-5.6-luna is not available.', type: 'permission_error', code: 'model_not_found', param: 'model' }, 'Authorization: Bearer secret-value', new Headers({ 'x-request-id': 'req_safe_diagnostic' }))
    const { provider } = withRejectedResponse(error)
    const result = await provider.generate(request).catch((failure) => failure as AiProviderFailure)
    expect(result).toMatchObject({
      kind: 'provider',
      providerRequestId: 'req_safe_diagnostic',
      diagnostics: { httpStatus: 403, errorType: 'permission_error', errorCode: 'model_not_found', errorParam: 'model', providerMessage: 'Model gpt-5.6-luna is not available.' },
    })
    expect(JSON.stringify(result)).not.toContain('Bearer')
    expect(JSON.stringify(result)).not.toContain('private provider body')
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it.each([
    ['empty output', { ...completedResponse(''), output: [] }],
    ['incomplete response', { ...completedResponse(), status: 'incomplete' }],
    ['refusal', { ...completedResponse(), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Not supported.' }] }] }],
    ['invalid JSON', completedResponse('{not-json')],
    ['non-object JSON', completedResponse('[]')],
  ])('normalizes %s as invalid structured output', async (_caseName, response) => {
    const { provider } = withResponse(response)
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'invalid_response' })
  })

  it('treats a missing key or model as not configured without constructing a call', async () => {
    const missingKey = new OpenAiAiProvider({ ...config, openaiApiKey: null })
    const missingModel = new OpenAiAiProvider({ ...config, openaiModel: null })
    expect(missingKey.isConfigured('gpt-5.6-luna')).toBe(false)
    expect(missingModel.isConfigured()).toBe(false)
    await expect(missingKey.generate(request)).rejects.toBeInstanceOf(AiProviderFailure)
    await expect(missingModel.generate({ ...request, model: '' })).rejects.toMatchObject({ kind: 'not_configured' })
  })
})

type AppErrorWithProviderDiagnostics = { providerDiagnostics?: Record<string, unknown> }

describe('OpenAI image generation adapter', () => {
  it('uses one explicit no-retry PNG image request and returns base64 safely', async () => {
    const provider = new OpenAiAiProvider(config)
    const client = (provider as unknown as { client: SdkClientMock }).client
    const create = vi.fn().mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: Buffer.from('png').toString('base64') }], usage: undefined }, request_id: 'image-request-id' }) })
    client.images.generate = create

    await expect(provider.generateImage(imageRequest)).resolves.toMatchObject({ base64: Buffer.from('png').toString('base64'), providerRequestId: 'image-request-id', inputTokens: null, outputTokens: null })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: 'gpt-image-2', quality: 'medium', size: '1024x1536', output_format: 'png', n: 1 })
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 2_345, maxRetries: 0 })
  })

  it('retains safe diagnostics for image-provider failures without exposing provider bodies', async () => {
    const provider = new OpenAiAiProvider(config)
    const client = (provider as unknown as { client: SdkClientMock }).client
    const error = new APIError(401, { message: 'private image provider body', type: 'authentication_error', code: 'invalid_api_key', param: null }, 'Authorization: Bearer secret-value', new Headers({ 'x-request-id': 'req_image_safe' }))
    const responsePromise = vi.fn().mockRejectedValue(error)
    client.images.generate = vi.fn().mockReturnValue({ withResponse: responsePromise })
    const failure = await provider.generateImage(imageRequest).catch((value) => value as AiProviderFailure)
    expect(failure).toMatchObject({ kind: 'provider', providerRequestId: 'req_image_safe', diagnostics: { httpStatus: 401, errorType: 'authentication_error', errorCode: 'invalid_api_key', errorParam: null } })
    expect(JSON.stringify(failure)).not.toContain('Bearer')
    expect(JSON.stringify(failure)).not.toContain('secret-value')
  })
})
