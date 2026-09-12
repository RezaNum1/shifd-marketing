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

