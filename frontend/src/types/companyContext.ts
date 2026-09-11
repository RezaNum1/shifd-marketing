export type CompanyBusinessType = 'B2B' | 'B2G'

export interface CompanyProfile {
  id: string
  name: string
  description: string
  industry: string
  businessTypes: CompanyBusinessType[]
  primaryMarket: string
  website: string
  mission: string
  vision: string
  positioning: string
  coreValueProposition: string
  differentiators: string[]
  customerSegments: string[]
  decisionMakers: string[]
  painPoints: string[]
}

export interface BrandProfile {
  brandVoice: string
  toneDescription: string
  preferredLanguage: string
  communicationGuidelines: string[]
  preferredTerms: string[]
  thingsToAvoid: string[]
  ctaStyle: string
  brandKeywords: string[]
}

export type BmcBlockType =
  | 'key-partners'
  | 'key-activities'
  | 'key-resources'
  | 'value-propositions'
  | 'customer-relationships'
  | 'channels'
  | 'customer-segments'
  | 'cost-structure'
  | 'revenue-streams'

export interface BmcBlock {
  id: string
  type: BmcBlockType
  title: string
  entries: string[]
}

export interface CompanyContextState {
  companyProfile: CompanyProfile
  brandProfile: BrandProfile
  bmcBlocks: BmcBlock[]
}
