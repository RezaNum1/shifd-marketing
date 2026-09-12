export const BMC_TYPES = [
  'key-partners',
  'key-activities',
  'key-resources',
  'value-propositions',
  'customer-relationships',
  'channels',
  'customer-segments',
  'cost-structure',
  'revenue-streams',
] as const

export type BmcType = typeof BMC_TYPES[number]

export const BMC_TITLES: Record<BmcType, string> = {
  'key-partners': 'Key Partners',
  'key-activities': 'Key Activities',
  'key-resources': 'Key Resources',
  'value-propositions': 'Value Propositions',
  'customer-relationships': 'Customer Relationships',
  channels: 'Channels',
  'customer-segments': 'Customer Segments',
  'cost-structure': 'Cost Structure',
  'revenue-streams': 'Revenue Streams',
}

export const PILLARS = [
  { code: 'educational', label: 'Educational' },
  { code: 'problem', label: 'Problem / Pain Point' },
  { code: 'product', label: 'Product Insight' },
  { code: 'use-case', label: 'Use Case' },
  { code: 'industry', label: 'Industry Insight' },
  { code: 'thought-leadership', label: 'Thought Leadership' },
  { code: 'company', label: 'Company / Brand' },
] as const

export const OBJECTIVES = [
  'awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery',
] as const

export const PLATFORMS = [
  { code: 'instagram', label: 'Instagram' },
  { code: 'linkedin', label: 'LinkedIn' },
] as const

export const PRODUCT_STATUSES = ['active', 'inactive', 'draft'] as const
export const LANGUAGES = ['English', 'Indonesian'] as const
export const BUSINESS_TYPES = ['B2B', 'B2G'] as const

export type ProductStatus = typeof PRODUCT_STATUSES[number]
export type CampaignObjective = typeof OBJECTIVES[number]

