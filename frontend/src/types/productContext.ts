import type { CompanyContextState } from './companyContext'

export type ProductStatus = 'Active' | 'Inactive' | 'Draft'
export type ProductCampaignObjective = 'awareness' | 'education' | 'engagement' | 'credibility' | 'consideration' | 'discovery'

export interface Product {
  id: string
  companyId: string
  name: string
  slug: string
  description: string
  category: string
  status: ProductStatus
  url?: string
  createdAt: string
  updatedAt: string
  version?: number
}

export interface ProductProfile {
  productId: string
  targetUsers: string[]
  targetOrganizations: string[]
  decisionMakers: string[]
  problemsAddressed: string[]
  valueProposition: string
  features: string[]
  benefits: string[]
  differentiators: string[]
  useCases: string[]
  campaignObjective: ProductCampaignObjective
  positioning: string
  keyMessages: string[]
  proofPoints: string[]
  defaultCta: string
  inheritCompanyTone: boolean
  toneOverride: string
}

export interface ResolvedProductContext {
  company: CompanyContextState
  product: Product
  profile: ProductProfile
  resolvedBrandVoice: string
  resolvedCtaStyle: string
  resolvedLanguage: string
}
