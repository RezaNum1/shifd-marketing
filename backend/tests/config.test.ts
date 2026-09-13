import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config/env.js'

const valid = {
  NODE_ENV: 'test', PORT: '3100', HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/shifd',
  ALLOWED_ORIGIN: 'http://localhost:5173',
}

describe('configuration validation', () => {
  it('loads valid required configuration', () => {
    expect(loadConfig(valid)).toMatchObject({ nodeEnv: 'test', port: 3100, host: '127.0.0.1', allowedOrigin: valid.ALLOWED_ORIGIN, sessionIdleMinutes: 480, sessionAbsoluteHours: 24, loginRateLimitMax: 5, loginRateLimitWindowMinutes: 15 })
  })

  it('fails fast for invalid required values', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'sqlite://local', ALLOWED_ORIGIN: '*' })).toThrow(ConfigError)
    try { loadConfig({ ...valid, DATABASE_URL: 'sqlite://local', ALLOWED_ORIGIN: '*' }) } catch (error) {
      expect(error).toMatchObject({ fields: { DATABASE_URL: expect.any(String), ALLOWED_ORIGIN: expect.any(String) } })
    }
  })

  it('fails fast for invalid authentication settings', () => {
    expect(() => loadConfig({ ...valid, SESSION_IDLE_MINUTES: '0', LOGIN_RATE_LIMIT_MAX: '-1' })).toThrow(ConfigError)
  })

  it('loads and validates the Phase 5 asset limits', () => {
    expect(loadConfig(valid)).toMatchObject({ assetStorageRoot: './data/assets', assetMaxBytes: 10_485_760, assetMaxWidth: 8_192, assetMaxHeight: 8_192, assetUnattachedGraceHours: 168 })
    expect(() => loadConfig({ ...valid, ASSET_MAX_BYTES: '0', ASSET_MAX_WIDTH: 'nope', ASSET_UNATTACHED_GRACE_HOURS: '-1' })).toThrow(ConfigError)
  })
})
