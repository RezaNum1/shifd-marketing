import {
  generatedContentVariants,
  instagramAdaptationVariants,
  linkedInAdaptationVariants,
  visualDirectionMock,
} from './contentBrief'
import type {
  BrandAssessment,
  ContentAssetRecord,
  ContentHistoryEvent,
  ContentLibraryRecord,
  ContentPlatform,
  ContentRecordDetails,
} from '../types/content'

const instagramAssessment: BrandAssessment = {
  score: 92,
  status: 'Aligned',
  recommendation: 'The copy uses a clear, discovery-oriented CTA.',
  checks: [
    { label: 'Brand Tone', status: 'pass' },
    { label: 'Audience Alignment', status: 'pass' },
    { label: 'Message Accuracy', status: 'pass' },
    { label: 'Context Alignment', status: 'pass' },
    { label: 'CTA Alignment', status: 'pass' },
  ],
  state: 'assessed',
}

const linkedInAssessment: BrandAssessment = {
  ...instagramAssessment,
  score: 91,
  recommendation: 'The closing is appropriate for a professional B2B audience.',
  checks: instagramAssessment.checks.map((check) => ({ ...check })),
}

function assets(platform: ContentPlatform, count: number): ContentAssetRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${platform}-asset-${index + 1}`,
    name: `${platform}-approval-${String(index + 1).padStart(2, '0')}.png`,
    type: 'PNG',
    order: index + 1,
    previewLabel: ['Hook', 'Operational problem', 'Paper process', 'Digital workflow', 'Next step'][index] ?? 'Creative',
  }))
}

function historyFor(status: ContentLibraryRecord['status'], platforms: ContentPlatform[]): ContentHistoryEvent[] {
  const events: ContentHistoryEvent[] = [
    { id: 'brief', event: 'Content brief created', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 21:42' },
  ]
  if (status === 'Draft' || status === 'Archived') return events
  events.push({ id: 'generated', event: 'Content generated', actor: 'Shifd Marketing', timestamp: 'Sep 9, 2026 · 21:55', metadata: 'Mock frontend generation' })
  platforms.forEach((platform, index) => events.push({ id: `adapt-${platform}`, event: `${platform === 'instagram' ? 'Instagram' : 'LinkedIn'} variant generated`, platform, actor: 'Shifd Marketing', timestamp: `Sep 9, 2026 · 22:0${index + 2}` }))
  if (['Generated', 'Adapted'].includes(status)) return events
  events.push({ id: 'creative', event: 'Creative uploaded', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:12', metadata: 'Browser-local creative assets' })
  if (status === 'Creative In Progress') return events
  platforms.forEach((platform) => events.push({ id: `review-${platform}`, event: 'Brand alignment checked', platform, actor: 'Shifd Marketing', timestamp: 'Sep 9, 2026 · 22:18', metadata: platform === 'instagram' ? '92 / 100 — Aligned' : '91 / 100 — Aligned' }))
  if (['Ready for Review', 'Needs Revision'].includes(status)) return events
  if (status === 'Scheduled' && platforms.includes('instagram')) {
    events.push(
      { id: 'instagram-edit', event: 'Instagram edited', platform: 'instagram', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:21' },
      { id: 'instagram-recheck', event: 'Instagram re-checked', platform: 'instagram', actor: 'Shifd Marketing', timestamp: 'Sep 9, 2026 · 22:24', metadata: '92 / 100 — Aligned' },
      { id: 'instagram-override', event: 'Override recorded', platform: 'instagram', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:26', metadata: 'Justification retained with the human review record' },
    )
  }
  events.push(
    { id: 'human-review', event: 'Human review completed', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:28' },
    { id: 'approved', event: 'Content approved', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:30', metadata: 'Human approval' },
  )
  if (status === 'Approved') return events
  events.push({ id: 'scheduled', event: 'Content scheduled', actor: 'Reza Fadli Harris', timestamp: 'Sep 9, 2026 · 22:36', metadata: 'Publishing remains manual' })
  if (status === 'Published') events.push({ id: 'published', event: 'Content published', actor: 'Reza Fadli Harris', timestamp: 'Sep 12, 2026 · 10:14', metadata: 'Publication recorded manually' })
  return events
}

function details(options: {
  title: string
  topic: string
  status: ContentLibraryRecord['status']
  platforms: ContentPlatform[]
  context?: 'company' | 'product'
  objective?: string
  audience?: string
  angle?: string
  assetsReady?: boolean
  published?: boolean
  scheduleDate?: string
  scheduleTimes?: Partial<Record<ContentPlatform, string>>
}): ContentRecordDetails {
  const reviewed = ['Ready for Review', 'Needs Revision', 'Approved', 'Scheduled', 'Published'].includes(options.status)
  const approved = ['Approved', 'Scheduled', 'Published'].includes(options.status)
  const scheduled = ['Scheduled', 'Published'].includes(options.status)
  const hasInstagram = options.platforms.includes('instagram')
  const hasLinkedIn = options.platforms.includes('linkedin')
  return {
    angle: options.angle ?? 'Explain how clear ownership and visible next steps support a more practical approval process.',
    objective: options.objective ?? 'Awareness',
    audience: options.audience ?? 'Corporate Administration / Enterprise',
    instructions: 'Use a professional B2B tone and avoid unsupported numerical claims.',
    createdBy: 'Reza Fadli Harris',
    createdAt: 'Sep 9, 2026 · 21:42',
    masterContent: options.status === 'Draft' ? undefined : { ...generatedContentVariants[0], title: options.title },
    visualDirection: options.status === 'Draft' ? undefined : { ...visualDirectionMock, structure: [...visualDirectionMock.structure] },
    instagram: hasInstagram ? { ...instagramAdaptationVariants[0] } : undefined,
    linkedin: hasLinkedIn ? { ...linkedInAdaptationVariants[0] } : undefined,
    creative: {
      instagram: hasInstagram && options.assetsReady !== false ? assets('instagram', 5) : [],
      linkedin: hasLinkedIn && options.assetsReady !== false && !hasInstagram ? assets('linkedin', 1) : [],
      linkedinReusesInstagram: hasInstagram && hasLinkedIn,
    },
    brandAssessments: reviewed
      ? {
          instagram: hasInstagram ? { ...instagramAssessment, checks: instagramAssessment.checks.map((check) => ({ ...check })) } : undefined,
          linkedin: hasLinkedIn ? { ...linkedInAssessment, checks: linkedInAssessment.checks.map((check) => ({ ...check })) } : undefined,
        }
      : {},
    approval: approved
      ? {
          approvedBy: 'Reza Fadli Harris',
          approvedAt: 'Sep 9, 2026 · 22:30',
          overrides: options.status === 'Scheduled' && hasInstagram
            ? { instagram: 'The discovery-oriented CTA was retained after human review because it accurately reflects the approved content objective.' }
            : {},
        }
      : undefined,
    schedules: scheduled
      ? Object.fromEntries(options.platforms.map((platform) => [platform, { date: options.scheduleDate ?? '2026-09-12', time: options.scheduleTimes?.[platform] ?? '10:00', status: 'Scheduled' }]))
      : {},
    publications: options.published
      ? Object.fromEntries(options.platforms.map((platform, index) => [platform, { publishedAt: `2026-09-12T10:${index === 0 ? '08' : '14'}:00`, status: 'Published' }]))
      : {},
    history: historyFor(options.status, options.platforms),
  }
}

export const mockContentLibraryRecords: ContentLibraryRecord[] = [
  {
    id: 'content-digital-approval',
    companyId: 'company-shifd-labs',
    title: 'Digital Approval vs Traditional Paper Approval',
    topic: 'Manual approval workflow comparison',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Educational',
    platforms: ['instagram', 'linkedin'],
    status: 'Scheduled',
    scheduleDate: '2026-09-12',
    scheduleTime: '10:00',
    updatedAt: '5 min ago',
    workflowStep: 'schedule',
    details: details({ title: 'Digital Approval vs Traditional Paper Approval', topic: 'Manual approval workflow comparison', status: 'Scheduled', platforms: ['instagram', 'linkedin'], scheduleTimes: { instagram: '10:00', linkedin: '14:00' } }),
  },
  {
    id: 'content-manual-delays',
    companyId: 'company-shifd-labs',
    title: 'Why Manual Approval Causes Delays',
    topic: 'The operational cost of approval handoffs',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Problem / Pain Point',
    platforms: ['linkedin'],
    status: 'Ready for Review',
    updatedAt: 'Yesterday',
    workflowStep: 'review',
    details: details({ title: 'Why Manual Approval Causes Delays', topic: 'The operational cost of approval handoffs', status: 'Ready for Review', platforms: ['linkedin'] }),
  },
  {
    id: 'content-clear-handoffs',
    companyId: 'company-shifd-labs',
    title: 'Keeping Approval Handoffs Easy to Follow',
    topic: 'Clear ownership from request to decision',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Use Case',
    platforms: ['linkedin'],
    status: 'Scheduled',
    scheduleDate: '2026-09-09',
    scheduleTime: '15:00',
    updatedAt: 'Yesterday',
    workflowStep: 'schedule',
    details: details({ title: 'Keeping Approval Handoffs Easy to Follow', topic: 'Clear ownership from request to decision', status: 'Scheduled', platforms: ['linkedin'], scheduleDate: '2026-09-09', scheduleTimes: { linkedin: '15:00' } }),
  },
  {
    id: 'content-modern-administration',
    companyId: 'company-shifd-labs',
    title: 'How Digital Workflows Support Modern Administration',
    topic: 'A practical digital workflow perspective',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Educational',
    platforms: ['instagram', 'linkedin'],
    status: 'Published',
    publishedAt: '2026-09-12T10:14:00',
    updatedAt: 'Sep 12, 2026',
    workflowStep: 'schedule',
    details: details({ title: 'How Digital Workflows Support Modern Administration', topic: 'A practical digital workflow perspective', status: 'Published', platforms: ['instagram', 'linkedin'], published: true }),
  },
  {
    id: 'content-operational-problems',
    companyId: 'company-shifd-labs',
    title: 'Building Software Around Real Operational Problems',
    topic: 'What product teams can learn from operational work',
    context: 'company',
    pillar: 'Thought Leadership',
    platforms: ['linkedin'],
    status: 'Draft',
    updatedAt: 'Sep 8, 2026',
    workflowStep: 'brief',
    details: details({ title: 'Building Software Around Real Operational Problems', topic: 'What product teams can learn from operational work', status: 'Draft', platforms: ['linkedin'], context: 'company', objective: 'Credibility', audience: 'Operations and product leaders', assetsReady: false }),
  },
  {
    id: 'content-after-submission',
    companyId: 'company-shifd-labs',
    title: 'What Happens After a Document Is Submitted for Approval?',
    topic: 'A visual walkthrough of an approval journey',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Use Case',
    platforms: ['instagram'],
    status: 'Creative In Progress',
    updatedAt: 'Sep 7, 2026',
    workflowStep: 'creative',
    details: details({ title: 'What Happens After a Document Is Submitted for Approval?', topic: 'A visual walkthrough of an approval journey', status: 'Creative In Progress', platforms: ['instagram'], assetsReady: true }),
  },
  {
    id: 'content-approval-roles',
    companyId: 'company-shifd-labs',
    title: 'Making Approval Ownership Easier to Follow',
    topic: 'Clear roles in correspondence workflows',
    context: 'product',
    productId: 'shifd-approval',
    pillar: 'Product Insight',
    platforms: ['linkedin'],
    status: 'Generated',
    updatedAt: 'Sep 6, 2026',
    workflowStep: 'generate',
    details: details({ title: 'Making Approval Ownership Easier to Follow', topic: 'Clear roles in correspondence workflows', status: 'Generated', platforms: ['linkedin'], assetsReady: false }),
  },
  {
    id: 'content-workflow-notes',
    companyId: 'company-shifd-labs',
    title: 'Notes from Designing for Administrative Work',
    topic: 'Company perspective on useful software',
    context: 'company',
    pillar: 'Company / Brand',
    platforms: ['linkedin'],
    status: 'Archived',
    updatedAt: 'Sep 4, 2026',
    workflowStep: 'brief',
    details: details({ title: 'Notes from Designing for Administrative Work', topic: 'Company perspective on useful software', status: 'Archived', platforms: ['linkedin'], context: 'company', objective: 'Awareness', audience: 'Enterprise operations leaders', assetsReady: false }),
  },
]
