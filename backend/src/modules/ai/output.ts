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
