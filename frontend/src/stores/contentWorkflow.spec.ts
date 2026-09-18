import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentWorkflowStore, resumeDestinationForStatus } from './contentWorkflow'
import type { ContentLibraryRecord } from '../types/content'
import type { ContentIdea } from '../types/contentIdea'

describe('content workflow state boundaries', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts a new workflow without stale brief values', () => {
    const workflow = useContentWorkflowStore()
    workflow.brief.topic = 'Temporary topic'
    workflow.startNewWorkflow()
    expect(workflow.activeStep).toBe('brief')
    expect(workflow.brief.topic).toBe('')
    expect(workflow.contentId).toBe('')
  })

  it('prefills a workflow from a ready idea without marking it used', () => {
    const idea: ContentIdea = { id: 'idea-1', title: 'A backend-backed idea', contextType: 'company', pillar: 'educational', objective: 'awareness', targetAudience: 'Operators', notes: 'Ground the brief', status: 'Ready', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    const workflow = useContentWorkflowStore()
    workflow.startFromIdea(idea)
    expect(workflow.sourceIdeaId).toBe(idea.id)
    expect(workflow.brief.topic).toBe(idea.title)
    expect(workflow.brief.pillar).toBe(idea.pillar)
    expect(idea.status).toBe('Ready')
    expect(workflow.contentId).toBe('')
  })

  it('hydrates a canonical record and derives its workflow step locally', () => {
    const record: ContentLibraryRecord = {
      id: 'content-1', companyId: 'company-1', title: 'Approved content', topic: 'Approval workflow', context: 'company', pillar: 'Educational', platforms: ['instagram', 'linkedin'], status: 'Approved', workflowStep: 'schedule', updatedAt: '2026-09-01T00:00:00Z',
      details: { angle: '', objective: 'awareness', audience: 'Operators', createdBy: 'Operator', createdAt: '2026-09-01T00:00:00Z', creative: { instagram: [], linkedin: [], linkedinReusesInstagram: false }, brandAssessments: {}, schedules: {}, publications: {}, history: [] },
    }
    const workflow = useContentWorkflowStore()
    expect(workflow.resumeContent(record)).toBe(true)
    expect(workflow.contentId).toBe(record.id)
    expect(workflow.brief.topic).toBe(record.topic)
    expect(workflow.activeStep).toBe('schedule')
  })

  it('maps backend lifecycle statuses to the locked resume destinations', () => {
    expect(resumeDestinationForStatus('Draft')).toBe('brief')
    expect(resumeDestinationForStatus('Generated')).toBe('generate')
    expect(resumeDestinationForStatus('Adapted')).toBe('adapt')
    expect(resumeDestinationForStatus('Creative In Progress')).toBe('creative')
    expect(resumeDestinationForStatus('Ready for Review')).toBe('review')
    expect(resumeDestinationForStatus('Needs Revision')).toBe('review')
    expect(resumeDestinationForStatus('Approved')).toBe('schedule')
    expect(resumeDestinationForStatus('Scheduled')).toBe('schedule')
    expect(resumeDestinationForStatus('Published')).toBe('detail')
    expect(resumeDestinationForStatus('Archived')).toBe('detail')
  })
})
