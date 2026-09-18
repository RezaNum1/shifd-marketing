import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../src/config/env.js'
import { buildApp } from '../src/app.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.REQUIRE_DATABASE === '1' && !testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for database-backed tests.')

const config: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  host: '127.0.0.1',
  databaseUrl: testDatabaseUrl ?? '',
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
  openaiApiKey: null,
  openaiModel: null,
  aiRequestTimeoutMs: 60_000,
  aiMaxOutputTokens: 2_048,
}

describe('PostgreSQL foundation', () => {
  const requiresDatabase = process.env.REQUIRE_DATABASE === '1'
  const testDatabase = requiresDatabase ? it : it.skip

  testDatabase('connects when TEST_DATABASE_URL and PostgreSQL are available', async () => {
    const url = testDatabaseUrl
    if (!url) throw new Error('TEST_DATABASE_URL is required for the database integration test.')
    const app = await buildApp({ config: { ...config, databaseUrl: url }, logger: false })
    try {
      await expect(app.prisma.$queryRaw`SELECT 1`).resolves.toBeDefined()
    } finally {
      await app.close()
    }
  })
})
