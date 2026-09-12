import { createHash } from 'node:crypto'
import { badRequest, validationError } from '../../shared/errors/AppError.js'
import { BUSINESS_TYPES, LANGUAGES, OBJECTIVES, PRODUCT_STATUSES, type CampaignObjective, type ProductStatus } from './constants.js'

export type UnknownRecord = Record<string, unknown>

export function object(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${label} must be an object.`)
  return value as UnknownRecord
}

export function allowedKeys(value: UnknownRecord, keys: readonly string[], label: string) {
  const keySet = new Set(keys)
  const unknown = Object.keys(value).find((key) => !keySet.has(key))
  if (unknown) throw badRequest(`Unknown property '${label}.${unknown}'.`)
}

export function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw validationError('Complete the required fields.', { [path]: 'Enter a nonblank value.' })
  return value.trim()
}

export function optionalText(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw validationError('The request contains an invalid text value.', { [path]: 'Enter text or null.' })
  const result = value.trim()
  return result || null
}

export function textList(value: unknown, path: string, defaultValue: string[] = []): string[] {
  if (value === undefined) return [...defaultValue]
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw validationError('The request contains an invalid list.', { [path]: 'Use a list of strings.' })
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const trimmed = entry.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }
  return result
}

export function enumValue<T extends string>(value: unknown, values: readonly T[], path: string, required = true): T | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (!required) return null
    throw validationError('The request contains an invalid enum value.', { [path]: 'Choose an allowed value.' })
  }
  if (typeof value !== 'string' || !values.includes(value as T)) throw validationError('The request contains an invalid enum value.', { [path]: 'Choose an allowed value.' })
  return value as T
}

export function normalizeWebsite(value: unknown, path: string): string | null {
  const text = optionalText(value, path)
  if (!text) return null
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`
  let parsed: URL
  try { parsed = new URL(withScheme) } catch { throw validationError('The request contains an invalid website.', { [path]: 'Enter a valid HTTP(S) website.' }) }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw validationError('The request contains an invalid website.', { [path]: 'Enter a valid HTTP(S) website.' })
  const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
  return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`
}

export function normalizeSlug(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'product'
}

export function requestHash(value: unknown): string {
  const stable = stableJson(value)
  return createHash('sha256').update(stable).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function parseStatus(value: unknown, path: string): ProductStatus {
  return enumValue(value, PRODUCT_STATUSES, path) as ProductStatus
}

export function parseObjective(value: unknown, path: string): CampaignObjective | null {
  return enumValue(value, OBJECTIVES, path, false) as CampaignObjective | null
}

export function parseLanguage(value: unknown, path: string): string {
  return enumValue(value, LANGUAGES, path) as string
}

export function parseBusinessTypes(value: unknown, path: string): string[] {
  const entries = textList(value, path)
  const invalid = entries.find((entry) => !BUSINESS_TYPES.includes(entry as typeof BUSINESS_TYPES[number]))
  if (invalid) throw validationError('The request contains an invalid business type.', { [path]: 'Use B2B or B2G.' })
  return entries
}

