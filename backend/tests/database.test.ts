import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../src/config/env.js'
import { buildApp } from '../src/app.js'

const config: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  host: '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL ?? '',
  allowedOrigin: 'http://localhost:5173',
}

describe('PostgreSQL foundation', () => {
  const requiresDatabase = process.env.REQUIRE_DATABASE === '1'
  const testDatabase = process.env.DATABASE_URL ? it : requiresDatabase ? it : it.skip

  testDatabase('connects when DATABASE_URL and PostgreSQL are available', async () => {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is required for the database integration test.')
    const app = await buildApp({ config: { ...config, databaseUrl: url }, logger: false })
    try {
      await expect(app.prisma.$queryRaw`SELECT 1`).resolves.toBeDefined()
    } finally {
      await app.close()
    }
  })
})
