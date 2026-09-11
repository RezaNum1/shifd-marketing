import type { Product, ProductProfile } from '../types/productContext'

export const mockProducts: Product[] = [
  {
    id: 'shifd-approval', companyId: 'company-shifd-labs', name: 'Shifd Approval', slug: 'shifd-approval',
    description: 'Web-based digital correspondence and approval workflow for organizations.',
    category: 'Business Workflow Software', status: 'Active', url: 'https://shifdlabs.com/products/approval',
    createdAt: '2026-08-01T09:00:00+07:00', updatedAt: '2026-09-10T09:00:00+07:00',
  },
]

export const mockProductProfiles: Record<string, ProductProfile> = {
  'shifd-approval': {
    productId: 'shifd-approval',
    targetUsers: ['Corporate Administration', 'Operations Teams', 'Internal Administrative Staff'],
    targetOrganizations: ['SMEs', 'Mid-Market Companies', 'Enterprise Organizations'],
    decisionMakers: ['Operations Managers', 'Corporate Administration Leaders', 'IT Managers', 'Business Owners'],
    problemsAddressed: ['Manual document circulation', 'Fragmented approval processes', 'Difficulty tracking approval progress', 'Inefficient administrative workflows'],
    valueProposition: 'Help organizations manage digital correspondence and approval workflows in a more structured way.',
    features: ['Digital correspondence workflow', 'Document approval workflow', 'Approval tracking', 'AI-assisted drafting'],
    benefits: ['More structured administrative workflow', 'Easier approval tracking', 'Centralized document process'],
    differentiators: ['Practical workflow focus', 'Business-oriented implementation', 'Flexible solution development'],
    useCases: ['Internal correspondence approval', 'Approval of administrative documents', 'Structured document routing'],
    campaignObjective: 'awareness',
    positioning: 'A practical digital workflow solution for organizations that want to structure correspondence and document approvals.',
    keyMessages: ['Simplify the way internal correspondence moves through approval', 'Make approval progress easier to track', 'Move administrative workflows into a structured digital flow'],
    proofPoints: [],
    defaultCta: 'Explore Shifd Approval',
    inheritCompanyTone: true,
    toneOverride: '',
  },
}
