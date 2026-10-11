import { describe, expect, it } from 'vitest'
import { AppError } from '../src/shared/errors/AppError.js'
import { parseEmailOutput, validateGenerateInput } from '../src/modules/prospects/outreach.js'

describe('prospect email drafting validation', () => {
  it('normalizes a bounded structured email response', () => {
    expect(parseEmailOutput(JSON.stringify({ subject: '  Introduction to Shifd Labs  ', body: '  Hello, we would be glad to share more information.  ' }))).toEqual({ subject: 'Introduction to Shifd Labs', body: 'Hello, we would be glad to share more information.' })
  })

  it('rejects malformed, extra-field, blank, and oversized provider output', () => {
    for (const value of ['not json', JSON.stringify({ subject: '', body: 'Email' }), JSON.stringify({ subject: 'Hi', body: 'Hello', facts: [] }), JSON.stringify({ subject: 'x'.repeat(501), body: 'Email' }), JSON.stringify({ subject: 'Hi', body: 'x'.repeat(8001) })]) {
      expect(() => parseEmailOutput(value)).toThrow(AppError)
    }
  })

  it('accepts generic drafting without research and validates bounded personalization inputs', () => {
    expect(() => validateGenerateInput({ objective: 'introduce_shifd_labs', offering: 'custom_web_application', tone: 'professional', language: 'English', claimIds: [] })).not.toThrow()
    expect(() => validateGenerateInput({ objective: 'introduce_shifd_labs', offering: 'custom_web_application', tone: 'professional', language: 'English', claimIds: ['not-a-uuid'] })).toThrow(AppError)
    expect(() => validateGenerateInput({ objective: 'invented_objective' as never, offering: 'custom_web_application', tone: 'professional', language: 'English', claimIds: [] })).toThrow(AppError)
    expect(() => validateGenerateInput({ objective: 'introduce_shifd_labs', offering: 'custom_web_application', tone: 'professional', language: 'English', customInstructions: 'x'.repeat(1501), claimIds: [] })).toThrow(AppError)
  })
})
