import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import type { AppConfig } from '../src/config/env.js'

const config: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  host: '127.0.0.1',
  databaseUrl: 'postgresql://test:test@127.0.0.1:5432/test',
  allowedOrigin: 'http://localhost:5173',
  sessionIdleMinutes: 480,
  sessionAbsoluteHours: 24,
  loginRateLimitMax: 5,
  loginRateLimitWindowMinutes: 15,
  assetStorageRoot: './data/test-assets',
  assetMaxBytes: 10_485_760,
  assetMaxWidth: 8_192,
  assetMaxHeight: 8_192,
  assetUnattachedGraceHours: 168,
  anthropicApiKey: null,
  anthropicModel: null,
  aiRequestTimeoutMs: 60_000,
  aiMaxOutputTokens: 2_048,
}
const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function testApp() {
  const app = await buildApp({ config, logger: false, connectDatabase: false })
  apps.push(app)
  return app
}

describe('Phase 1 HTTP foundation', () => {
  it('returns the exact safe liveness response', async () => {
    const response = await (await testApp()).inject({ method: 'GET', url: '/api/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('allows the configured local frontend origin with credentials', async () => {
    const response = await (await testApp()).inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: config.allowedOrigin },
    })
    expect(response.headers['access-control-allow-origin']).toBe(config.allowedOrigin)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not grant permissive CORS headers to an unapproved origin', async () => {
    const response = await (await testApp()).inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'https://unapproved.example' },
    })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('returns a request ID in an unknown-route error envelope', async () => {
    const response = await (await testApp()).inject({ method: 'GET', url: '/api/unknown' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND', requestId: expect.any(String) } })
    expect(response.body).not.toContain('stack')
  })

  it('sanitizes unexpected errors', async () => {
    const app = await testApp()
    app.get('/api/test-error', async () => { throw new Error('private implementation detail') })
    const response = await app.inject({ method: 'GET', url: '/api/test-error' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId: expect.any(String) } })
    expect(response.body).not.toContain('private implementation detail')
  })
})
