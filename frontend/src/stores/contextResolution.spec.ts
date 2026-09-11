import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCompanyContextStore } from './companyContext'
import { useProductsStore } from './products'

describe('product context resolution', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reads the latest company brand voice dynamically', () => {
    const company = useCompanyContextStore()
    const products = useProductsStore()
    const first = products.resolveProductContext('shifd-approval')!
    company.brandProfile.brandVoice = 'Professional, concise, consultative'
    const next = products.resolveProductContext('shifd-approval')!
    expect(first.company.brandProfile.brandVoice).not.toBe(next.resolvedBrandVoice)
    expect(next.resolvedBrandVoice).toBe('Professional, concise, consultative')
  })
})
