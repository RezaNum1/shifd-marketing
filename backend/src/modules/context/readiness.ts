export interface ReadinessResult {
  ready: boolean
  missing: string[]
}

export function companyContextReadiness(input: {
  name: string
  description: string
  brandVoice?: string | null
}): ReadinessResult {
  const missing: string[] = []
  if (!input.name.trim()) missing.push('company.name')
  if (!input.description.trim()) missing.push('company.description')
  if (!input.brandVoice?.trim()) missing.push('brand.brandVoice')
  return { ready: missing.length === 0, missing }
}

export function productContextReadiness(input: {
  targetUsers: string[]
  problemsAddressed: string[]
  valueProposition: string | null
  features: string[]
  benefits: string[]
  proofPoints: string[]
}): ReadinessResult {
  const missing: string[] = []
  if (input.targetUsers.length === 0) missing.push('profile.targetUsers')
  if (input.problemsAddressed.length === 0) missing.push('profile.problemsAddressed')
  if (!input.valueProposition?.trim()) missing.push('profile.valueProposition')
  if (input.features.length === 0) missing.push('profile.features')
  if (input.benefits.length === 0) missing.push('profile.benefits')
  if (input.proofPoints.length === 0) missing.push('profile.proofPoints')
  return { ready: missing.length === 0, missing }
}

/**
 * Discovery happens before Content exists. Its gate intentionally covers only
 * the M1 facts needed to make a useful topic search, not downstream brand or
 * Content-generation requirements.
 */
export function companyTopicDiscoveryReadiness(input: {
  description: string
  customerSegments: string[]
  decisionMakers: string[]
  painPoints: string[]
}): ReadinessResult {
  const missing: string[] = []
  if (!input.description.trim()) missing.push('company.description')
  if (input.customerSegments.length === 0 && input.decisionMakers.length === 0) missing.push('company.audience')
  if (input.painPoints.length === 0) missing.push('company.painPoints')
  return { ready: missing.length === 0, missing }
}

export function productTopicDiscoveryReadiness(input: {
  name: string
  description: string
  targetUsers: string[]
  targetOrganizations: string[]
  problemsAddressed: string[]
  valueProposition: string | null
}): ReadinessResult {
  const missing: string[] = []
  if (!input.name.trim()) missing.push('product.name')
  if (!input.description.trim()) missing.push('product.description')
  if (input.targetUsers.length === 0 && input.targetOrganizations.length === 0) missing.push('profile.audience')
  if (input.problemsAddressed.length === 0 && !input.valueProposition?.trim()) missing.push('profile.relevance')
  return { ready: missing.length === 0, missing }
}
