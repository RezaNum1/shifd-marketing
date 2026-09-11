import { describe, expect, it } from 'vitest'
import { contentBriefDefaults } from '../data/contentBrief'
import { isBriefReady } from './contentValidation'

describe('brief validation', () => {
  it('rejects an incomplete brief', () => {
    expect(isBriefReady({ ...contentBriefDefaults, topic: '' })).toBe(false)
  })

  it('requires a product for product context', () => {
    expect(isBriefReady({ ...contentBriefDefaults, context: 'product', product: '' })).toBe(false)
    expect(isBriefReady({ ...contentBriefDefaults, context: 'product', product: 'shifd-approval' })).toBe(true)
  })

  it('accepts a complete company brief', () => {
    expect(isBriefReady({ ...contentBriefDefaults, context: 'company', product: '' })).toBe(true)
  })
})
