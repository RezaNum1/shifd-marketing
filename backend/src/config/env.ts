import 'dotenv/config'

export type NodeEnvironment = 'development' | 'test' | 'production'

export interface AppConfig {
  nodeEnv: NodeEnvironment
  port: number
  host: string
  databaseUrl: string
  allowedOrigin: string
  sessionIdleMinutes: number
  sessionAbsoluteHours: number
  loginRateLimitMax: number
  loginRateLimitWindowMinutes: number
  assetStorageRoot: string
  assetMaxBytes: number
  assetMaxWidth: number
  assetMaxHeight: number
  assetUnattachedGraceHours: number
}

export class ConfigError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super('Invalid application configuration.')
    this.name = 'ConfigError'
  }
}

function required(name: string, value: string | undefined, fields: Record<string, string>) {
  const trimmed = value?.trim()
  if (!trimmed) fields[name] = 'Value is required.'
  return trimmed ?? ''
}

function parsePort(value: string | undefined, fields: Record<string, string>) {
  const port = Number(value ?? '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) fields.PORT = 'Must be an integer between 1 and 65535.'
  return port
}

function parsePositiveInteger(name: string, value: string | undefined, defaultValue: number, fields: Record<string, string>) {
  const parsed = Number(value ?? defaultValue)
  if (!Number.isInteger(parsed) || parsed < 1) fields[name] = 'Must be a positive integer.'
  return parsed
}

function parseStorageRoot(value: string | undefined, fields: Record<string, string>) {
  const root = value?.trim() || './data/assets'
  if (root.includes('\0')) fields.ASSET_STORAGE_ROOT = 'Must be a valid private filesystem path.'
  return root
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const fields: Record<string, string> = {}
  const nodeEnv = (env.NODE_ENV?.trim() || 'development') as NodeEnvironment
  if (!['development', 'test', 'production'].includes(nodeEnv)) fields.NODE_ENV = 'Must be development, test, or production.'
  const databaseUrl = required('DATABASE_URL', env.DATABASE_URL, fields)
  if (databaseUrl && !/^postgres(?:ql):\/\//.test(databaseUrl)) fields.DATABASE_URL = 'Must be a PostgreSQL connection URL.'
  const allowedOrigin = required('ALLOWED_ORIGIN', env.ALLOWED_ORIGIN, fields)
  if (allowedOrigin && allowedOrigin === '*') fields.ALLOWED_ORIGIN = 'Wildcard origin is not allowed.'
  const port = parsePort(env.PORT, fields)
  const host = required('HOST', env.HOST || '127.0.0.1', fields)
  const sessionIdleMinutes = parsePositiveInteger('SESSION_IDLE_MINUTES', env.SESSION_IDLE_MINUTES, 480, fields)
  const sessionAbsoluteHours = parsePositiveInteger('SESSION_ABSOLUTE_HOURS', env.SESSION_ABSOLUTE_HOURS, 24, fields)
  const loginRateLimitMax = parsePositiveInteger('LOGIN_RATE_LIMIT_MAX', env.LOGIN_RATE_LIMIT_MAX, 5, fields)
  const loginRateLimitWindowMinutes = parsePositiveInteger('LOGIN_RATE_LIMIT_WINDOW_MINUTES', env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15, fields)
  const assetStorageRoot = parseStorageRoot(env.ASSET_STORAGE_ROOT, fields)
  const assetMaxBytes = parsePositiveInteger('ASSET_MAX_BYTES', env.ASSET_MAX_BYTES, 10_485_760, fields)
  const assetMaxWidth = parsePositiveInteger('ASSET_MAX_WIDTH', env.ASSET_MAX_WIDTH, 8_192, fields)
  const assetMaxHeight = parsePositiveInteger('ASSET_MAX_HEIGHT', env.ASSET_MAX_HEIGHT, 8_192, fields)
  const assetUnattachedGraceHours = parsePositiveInteger('ASSET_UNATTACHED_GRACE_HOURS', env.ASSET_UNATTACHED_GRACE_HOURS, 168, fields)
  if (Object.keys(fields).length) throw new ConfigError(fields)
  return { nodeEnv, port, host, databaseUrl, allowedOrigin, sessionIdleMinutes, sessionAbsoluteHours, loginRateLimitMax, loginRateLimitWindowMinutes, assetStorageRoot, assetMaxBytes, assetMaxWidth, assetMaxHeight, assetUnattachedGraceHours }
}
