import { aiOutputInvalid } from '../../shared/errors/AppError.js'

export interface M2Output {
  master: {
    title: string
    coreMessage: string
    hook: string
    body: string
    cta: string
  }
  visualDirection: {
    format: string
    concept: string
    structure: string[]
    notes: string
  }
}

export interface M3Output {
  copy: string
  cta: string
  hashtags: string
  visualRecommendation: string
}

export interface M4Check {
  label: string
  status: 'pass' | 'warning'
}

export interface M4Output {
  score: number
  status: 'aligned' | 'needs_attention'
  recommendation: string
  checks: M4Check[]
}

const MASTER_KEYS = ['title', 'coreMessage', 'hook', 'body', 'cta']
const VISUAL_KEYS = ['format', 'concept', 'structure', 'notes']

export function parseM2Output(text: string): M2Output {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw aiOutputInvalid()
  }
  if (!isRecord(value) || !exactKeys(value, ['master', 'visualDirection'])) throw aiOutputInvalid()
  const master = parseTextObject(value.master, MASTER_KEYS, 'master')
  const direction = value.visualDirection
  if (!isRecord(direction) || !exactKeys(direction, VISUAL_KEYS)) throw aiOutputInvalid()
  const visualDirection = {
    format: requiredField(direction.format, 500),
    concept: requiredField(direction.concept, 4_000),
    structure: parseStructure(direction.structure),
    notes: requiredField(direction.notes, 4_000),
  }
  return { master, visualDirection }
}

const M3_KEYS = ['copy', 'cta', 'hashtags', 'visualRecommendation']

export function parseM3Output(text: string): M3Output {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw aiOutputInvalid()
  }
  if (!isRecord(value) || !exactKeys(value, M3_KEYS)) throw aiOutputInvalid('The AI platform adaptation has an unsupported shape.')
  return {
    copy: requiredField(value.copy, 16_000),
    cta: requiredField(value.cta, 2_000),
    hashtags: requiredField(value.hashtags, 2_000),
    visualRecommendation: requiredField(value.visualRecommendation, 4_000),
  }
}

const M4_KEYS = ['score', 'status', 'recommendation', 'checks']
const M4_CHECK_KEYS = ['label', 'status']
export const M4_CHECK_LABELS = [
  'Tone / Brand Voice',
  'Messaging Alignment',
  'Audience Fit',
  'Claim Grounding',
  'CTA Alignment',
  'Company/Product Context Alignment',
  'Platform Appropriateness',
] as const
const M4_CHECK_LABEL_SET = new Set<string>(M4_CHECK_LABELS)

export function parseM4Output(text: string): M4Output {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw aiOutputInvalid()
  }
  if (!isRecord(value) || !exactKeys(value, M4_KEYS)) throw aiOutputInvalid('The AI brand assessment has an unsupported shape.')
  if (!Number.isInteger(value.score) || (value.score as number) < 0 || (value.score as number) > 100) throw aiOutputInvalid('The AI brand assessment score is invalid.')
  const score = value.score as number
  if (value.status !== 'aligned' && value.status !== 'needs_attention') throw aiOutputInvalid('The AI brand assessment status is invalid.')
  const recommendation = requiredField(value.recommendation, 4_000)
  if (!Array.isArray(value.checks) || value.checks.length === 0 || value.checks.length > M4_CHECK_LABELS.length) throw aiOutputInvalid('The AI brand assessment checks are invalid.')
  const seen = new Set<string>()
  const checks = value.checks.map((check) => {
    if (!isRecord(check) || !exactKeys(check, M4_CHECK_KEYS)) throw aiOutputInvalid('The AI brand assessment check has an unsupported shape.')
    const label = requiredField(check.label, 200)
    if (!M4_CHECK_LABEL_SET.has(label) || seen.has(label)) throw aiOutputInvalid('The AI brand assessment check framework is invalid.')
    seen.add(label)
    if (check.status !== 'pass' && check.status !== 'warning') throw aiOutputInvalid('The AI brand assessment check status is invalid.')
    return { label, status: check.status as 'pass' | 'warning' }
  })
  const expectedStatus = checks.some((check) => check.status === 'warning') ? 'needs_attention' : 'aligned'
  if (value.status !== expectedStatus) throw aiOutputInvalid('The AI brand assessment status does not match its checks.')
  return { score, status: value.status, recommendation, checks }
}

function parseTextObject(value: unknown, keys: readonly string[], path: string) {
  if (!isRecord(value) || !exactKeys(value, keys)) throw aiOutputInvalid(`The AI ${path} output has an unsupported shape.`)
  return {
    title: requiredField(value.title, 500),
    coreMessage: requiredField(value.coreMessage, 4_000),
    hook: requiredField(value.hook, 2_000),
    body: requiredField(value.body, 16_000),
    cta: requiredField(value.cta, 2_000),
  }
}

function parseStructure(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) throw aiOutputInvalid('The AI visual direction structure is invalid.')
  return value.map((item) => requiredField(item, 1_000))
}

function requiredField(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw aiOutputInvalid('The AI output contains blank or oversized fields.')
  return value
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
