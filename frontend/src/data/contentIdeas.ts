import { objectiveOptions } from './contentBrief'
import type { ContentIdea } from '../types/contentIdea'

// Share the same objective identifiers and labels used by the Brief form.
export const ideaObjectiveOptions = objectiveOptions.map((option) => ({
  ...option, label: option.value === 'discovery' ? 'Product Discovery' : option.label,
}))
export const ideaContextOptions = [
  { value: 'company', label: 'Company' },
  { value: 'product', label: 'Product' },
]

export const mockContentIdeas: ContentIdea[] = [
  {
    id: 'idea-manual-delays', title: 'Why Manual Approval Causes Delays',
    contextType: 'product', productId: 'shifd-approval', pillar: 'problem', objective: 'awareness',
    targetAudience: 'Corporate Administration',
    notes: 'Explain how unclear ownership and manual document handoffs can delay approval. Focus on the everyday administrative experience.',
    status: 'Ready', createdAt: '2026-09-07T09:00:00+07:00', updatedAt: '2026-09-10T09:00:00+07:00',
  },
  {
    id: 'idea-paper-digital', title: 'Paper Approval vs Digital Approval',
    contextType: 'product', productId: 'shifd-approval', pillar: 'educational', objective: 'education',
    targetAudience: 'Operations and Administrative Teams',
    notes: 'Compare a paper-based process with a digital correspondence and approval workflow. Avoid numerical performance claims.',
    status: 'Ready', createdAt: '2026-09-06T09:00:00+07:00', updatedAt: '2026-09-09T10:00:00+07:00',
  },
  {
    id: 'idea-document-submitted', title: 'What Happens After a Document Is Submitted for Approval?',
    contextType: 'product', productId: 'shifd-approval', pillar: 'use-case', objective: 'discovery',
    targetAudience: 'Corporate Administration', notes: 'Outline the roles of the requester and approver, from submission to decision.',
    status: 'Ready', createdAt: '2026-09-05T09:00:00+07:00', updatedAt: '2026-09-08T09:00:00+07:00',
  },
  {
    id: 'idea-operational-software', title: 'Building Software Around Real Operational Problems',
    contextType: 'company', pillar: 'thought-leadership', objective: 'credibility',
    targetAudience: 'SME and Mid-Market Decision Makers', notes: 'Start with the work people do before discussing software requirements.',
    status: 'Used', createdAt: '2026-09-04T09:00:00+07:00', updatedAt: '2026-09-07T09:00:00+07:00',
  },
  {
    id: 'idea-custom-internal-app', title: 'When Does a Business Need a Custom Internal Application?',
    contextType: 'company', pillar: 'educational', objective: 'consideration',
    targetAudience: 'Business Owners and Operations Leaders', notes: 'Discuss repeated manual work, unclear handoffs, and requirements gathering without promising outcomes.',
    status: 'Ready', createdAt: '2026-09-03T09:00:00+07:00', updatedAt: '2026-09-06T09:00:00+07:00',
  },
  {
    id: 'idea-workflow-questions', title: 'Questions to Ask Before Changing an Approval Workflow',
    contextType: 'product', productId: 'shifd-approval', pillar: 'industry', objective: 'engagement',
    targetAudience: 'Operations Leaders', notes: 'Capture questions about document ownership, review steps, and approval responsibilities.',
    status: 'Archived', createdAt: '2026-09-02T09:00:00+07:00', updatedAt: '2026-09-05T09:00:00+07:00',
  },
]
