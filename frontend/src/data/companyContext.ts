import type { BmcBlockType, CompanyContextState } from '../types/companyContext'

export const mockCompanyContext: CompanyContextState = {
  companyProfile: {
    id: 'company-shifd-labs', name: 'Shifd Labs',
    description: 'IT consulting and services company focused on building software solutions for business operations.',
    industry: 'Information Technology / Software Services', businessTypes: ['B2B'], primaryMarket: 'Indonesia', website: 'shifdlabs.com',
    mission: 'Build practical software solutions that help organizations improve the way work gets done.',
    vision: 'A future where organizations can shape technology around their real operational needs.',
    positioning: 'A practical software partner for organizations turning operational challenges into clear digital workflows.',
    coreValueProposition: 'Business-oriented software development that connects technology decisions to everyday operational needs.',
    differentiators: ['Business-oriented software development', 'Flexible solution development', 'Focus on operational workflows'],
    customerSegments: ['SMEs', 'Mid-Market Companies', 'Enterprise Organizations'],
    decisionMakers: ['Business Owners', 'Operations Managers', 'Corporate Administration', 'IT Managers'],
    painPoints: ['Manual administrative processes', 'Fragmented internal workflows', 'Inefficient approval processes', 'Difficulty adapting generic software to specific operational needs'],
  },
  brandProfile: {
    brandVoice: 'Professional, clear, modern, practical',
    toneDescription: 'Professional B2B communication that explains business problems and solutions clearly without exaggerated claims.',
    preferredLanguage: 'English',
    communicationGuidelines: ['Communicate clearly', 'Focus on business value', 'Avoid unnecessary technical jargon', 'Avoid exaggerated marketing claims', 'Maintain a professional but approachable tone'],
    preferredTerms: ['Business efficiency', 'Workflow', 'Software solutions', 'Digital transformation', 'Operational improvement'],
    thingsToAvoid: ['Guaranteed outcomes', 'Unsupported numerical claims', 'Excessive promotional language'],
    ctaStyle: 'Consultative and low-pressure',
    brandKeywords: ['Business efficiency', 'Workflow', 'Software solutions', 'Digital transformation', 'Operational improvement'],
  },
  bmcBlocks: ([
    ['key-partners', 'Key Partners', ['Technology providers', 'Implementation partners', 'Business advisors']],
    ['key-activities', 'Key Activities', ['Software development', 'Solution consultation', 'Product development', 'Marketing and customer acquisition']],
    ['key-resources', 'Key Resources', ['Software engineering capability', 'Internal development team', 'Shifd Labs brand', 'Shifd Approval product']],
    ['value-propositions', 'Value Propositions', ['Custom software solutions based on operational needs', 'Digital workflow improvement', 'Practical technology consultation']],
    ['customer-relationships', 'Customer Relationships', ['Consultative discovery', 'Ongoing project collaboration', 'Practical implementation support']],
    ['channels', 'Channels', ['Company website', 'LinkedIn', 'Instagram', 'Direct outreach']],
    ['customer-segments', 'Customer Segments', ['SMEs', 'Mid-Market Companies', 'Enterprise Organizations']],
    ['cost-structure', 'Cost Structure', ['Product and software development', 'Team operations', 'Customer acquisition']],
    ['revenue-streams', 'Revenue Streams', ['Software development projects', 'IT consultation', 'Software product subscriptions / licensing where applicable']],
  ] as [BmcBlockType, string, string[]][]).map(([type, title, entries]) => ({ id: type, type, title, entries })),
}
