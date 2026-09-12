import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config/env.js'

const valid = {
  NODE_ENV: 'test', PORT: '3100', HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/shifd',
  ALLOWED_ORIGIN: 'http://localhost:5173',
}

describe('configuration validation', () => {
  it('loads valid required configuration', () => {
    expect(loadConfig(valid)).toMatchObject({ nodeEnv: 'test', port: 3100, host: '127.0.0.1', allowedOrigin: valid.ALLOWED_ORIGIN })
  })

  it('fails fast for invalid required values', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'sqlite://local', ALLOWED_ORIGIN: '*' })).toThrow(ConfigError)
    try { loadConfig({ ...valid, DATABASE_URL: 'sqlite://local', ALLOWED_ORIGIN: '*' }) } catch (error) {
      expect(error).toMatchObject({ fields: { DATABASE_URL: expect.any(String), ALLOWED_ORIGIN: expect.any(String) } })
    }
  })
})
