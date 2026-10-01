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
  openaiApiKey: string | null
  openaiModel: string | null
  openaiImageModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  openaiImageFormat?: 'png'
  instagramAccessToken?: string | null
  instagramAppSecret?: string | null
  instagramAppId?: string | null
  instagramUserId?: string | null
  aiRequestTimeoutMs: number
  aiMaxOutputTokens: number
  topicDiscoveryMaxOutputTokens: number
  telegramBotToken?: string | null
  telegramBotUsername?: string | null
  telegramWebhookSecret?: string | null
  telegramPublicWebhookUrl?: string | null
  telegramLinkTokenTtlMinutes?: number
  telegramIdeationMaxOutputTokens?: number
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

function parseBoundedPositiveInteger(name: string, value: string | undefined, defaultValue: number, maximum: number, fields: Record<string, string>) {
  const parsed = Number(value ?? defaultValue)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) fields[name] = `Must be an integer between 1 and ${maximum}.`
  return parsed
}

function optionalConfigText(name: string, value: string | undefined, fields: Record<string, string>) {
  const trimmed = value?.trim() || null
  if (trimmed?.includes('\0') || trimmed?.includes('\r') || trimmed?.includes('\n')) fields[name] = 'Must not contain control characters.'
  if (trimmed && ((name === 'OPENAI_API_KEY' && trimmed.length > 5000) || (name === 'OPENAI_MODEL' && trimmed.length > 200) || (name === 'OPENAI_IMAGE_MODEL' && trimmed.length > 200) || (name.startsWith('TELEGRAM_') && trimmed.length > 5000))) fields[name] = 'Value is too long.'
  return trimmed
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
  const openaiApiKey = optionalConfigText('OPENAI_API_KEY', env.OPENAI_API_KEY, fields)
  const openaiModel = optionalConfigText('OPENAI_MODEL', env.OPENAI_MODEL, fields)
  const openaiImageModel = optionalConfigText('OPENAI_IMAGE_MODEL', env.OPENAI_IMAGE_MODEL, fields) || 'gpt-image-2'
  const openaiImageQuality = (env.OPENAI_IMAGE_QUALITY?.trim() || 'medium') as 'low' | 'medium' | 'high'
  if (!['low', 'medium', 'high'].includes(openaiImageQuality)) fields.OPENAI_IMAGE_QUALITY = 'Must be low, medium, or high.'
  const openaiImageFormat = 'png' as const
  if (env.OPENAI_IMAGE_FORMAT?.trim() && env.OPENAI_IMAGE_FORMAT.trim() !== 'png') fields.OPENAI_IMAGE_FORMAT = 'Only png is supported for visual references.'
  const instagramAccessToken = optionalConfigText('INSTAGRAM_ACCESS_TOKEN', env.INSTAGRAM_ACCESS_TOKEN, fields)
  const instagramAppSecret = optionalConfigText('INSTAGRAM_APP_SECRET', env.INSTAGRAM_APP_SECRET, fields)
  const instagramAppId = optionalConfigText('INSTAGRAM_APP_ID', env.INSTAGRAM_APP_ID, fields)
  const instagramUserId = optionalConfigText('INSTAGRAM_USER_ID', env.INSTAGRAM_USER_ID, fields)
  const aiRequestTimeoutMs = parseBoundedPositiveInteger('AI_REQUEST_TIMEOUT_MS', env.AI_REQUEST_TIMEOUT_MS, 60_000, 300_000, fields)
  const aiMaxOutputTokens = parseBoundedPositiveInteger('AI_MAX_OUTPUT_TOKENS', env.AI_MAX_OUTPUT_TOKENS, 2_048, 32_768, fields)
  const topicDiscoveryMaxOutputTokens = parseBoundedPositiveInteger('TOPIC_DISCOVERY_MAX_OUTPUT_TOKENS', env.TOPIC_DISCOVERY_MAX_OUTPUT_TOKENS, 4_096, 32_768, fields)
  const telegramBotToken = optionalConfigText('TELEGRAM_BOT_TOKEN', env.TELEGRAM_BOT_TOKEN, fields)
  const telegramBotUsername = optionalConfigText('TELEGRAM_BOT_USERNAME', env.TELEGRAM_BOT_USERNAME, fields)
  const telegramWebhookSecret = optionalConfigText('TELEGRAM_WEBHOOK_SECRET', env.TELEGRAM_WEBHOOK_SECRET, fields)
  const telegramPublicWebhookUrl = optionalConfigText('TELEGRAM_PUBLIC_WEBHOOK_URL', env.TELEGRAM_PUBLIC_WEBHOOK_URL, fields)
  if (telegramPublicWebhookUrl) {
    try {
      const parsed = new URL(telegramPublicWebhookUrl)
      if (nodeEnv === 'production' && parsed.protocol !== 'https:') fields.TELEGRAM_PUBLIC_WEBHOOK_URL = 'Must use HTTPS in production.'
    } catch { fields.TELEGRAM_PUBLIC_WEBHOOK_URL = 'Must be a valid webhook URL.' }
  }
  const telegramLinkTokenTtlMinutes = parseBoundedPositiveInteger('TELEGRAM_LINK_TOKEN_TTL_MINUTES', env.TELEGRAM_LINK_TOKEN_TTL_MINUTES, 10, 60, fields)
  const telegramIdeationMaxOutputTokens = parseBoundedPositiveInteger('TELEGRAM_IDEATION_MAX_OUTPUT_TOKENS', env.TELEGRAM_IDEATION_MAX_OUTPUT_TOKENS, 800, 8_192, fields)
  if (Object.keys(fields).length) throw new ConfigError(fields)
  return { nodeEnv, port, host, databaseUrl, allowedOrigin, sessionIdleMinutes, sessionAbsoluteHours, loginRateLimitMax, loginRateLimitWindowMinutes, assetStorageRoot, assetMaxBytes, assetMaxWidth, assetMaxHeight, assetUnattachedGraceHours, openaiApiKey, openaiModel, openaiImageModel, openaiImageQuality, openaiImageFormat, instagramAccessToken, instagramAppSecret, instagramAppId, instagramUserId, aiRequestTimeoutMs, aiMaxOutputTokens, topicDiscoveryMaxOutputTokens, telegramBotToken, telegramBotUsername, telegramWebhookSecret, telegramPublicWebhookUrl, telegramLinkTokenTtlMinutes, telegramIdeationMaxOutputTokens }
}
