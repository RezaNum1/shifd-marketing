import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/config/env.js'
import { M3_OUTPUT_SCHEMA_VERSION, M4_OUTPUT_SCHEMA_VERSION, OUTPUT_SCHEMA_VERSION } from '../src/modules/ai/constants.js'
import { OpenAiAiProvider } from '../src/modules/ai/openai.js'
import { M4_CHECK_LABELS } from '../src/modules/ai/output.js'
import { AiProviderFailure, type AiProviderRequest } from '../src/modules/ai/provider.js'

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
