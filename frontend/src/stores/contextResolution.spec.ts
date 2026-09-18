import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCompanyContextStore } from './companyContext'
import { useProductsStore } from './products'
import type { Product, ProductProfile } from '../types/productContext'

describe('product context resolution', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reads the latest company brand voice dynamically', () => {
    const company = useCompanyContextStore()
    const products = useProductsStore()
    const product: Product = { id: 'product-1', companyId: 'company-1', name: 'Product', slug: 'product', description: 'Description', category: 'Software', status: 'Active', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', version: 1 }
    const profile: ProductProfile = { productId: product.id, targetUsers: ['Operators'], targetOrganizations: [], decisionMakers: [], problemsAddressed: [], valueProposition: 'A clear value', features: [], benefits: [], differentiators: [], useCases: [], campaignObjective: 'awareness', positioning: '', keyMessages: [], proofPoints: [], defaultCta: '', inheritCompanyTone: true, toneOverride: '' }
    products.products.push(product)
    products.productProfiles[product.id] = profile
    const first = products.resolveProductContext(product.id)!
    company.brandProfile.brandVoice = 'Professional, concise, consultative'
    const next = products.resolveProductContext(product.id)!
    expect(first.resolvedBrandVoice).not.toBe(next.resolvedBrandVoice)
    expect(next.resolvedBrandVoice).toBe('Professional, concise, consultative')
  })
})
