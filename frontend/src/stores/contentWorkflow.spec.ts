import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentIdeasStore } from './contentIdeas'
import { useContentLibraryStore } from './contentLibrary'
import { useContentWorkflowStore } from './contentWorkflow'

describe('content workflow intents', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts a new workflow without stale brief values', () => {
    const workflow = useContentWorkflowStore()
    workflow.brief.topic = 'Temporary topic'
    workflow.startNewWorkflow()
    expect(workflow.activeStep).toBe('brief')
    expect(workflow.brief.topic).not.toBe('Temporary topic')
  })

  it('prefills a workflow from a ready idea', () => {
    const ideas = useContentIdeasStore()
    const idea = ideas.ideas.find((item) => item.status === 'Ready')!
    const workflow = useContentWorkflowStore()
    workflow.startFromIdea(idea)
    expect(workflow.sourceIdeaId).toBe(idea.id)
    expect(workflow.brief.topic).toBe(idea.title)
    expect(workflow.brief.pillar).toBe(idea.pillar)
  })

  it('hydrates the selected record and resolves its workflow step', () => {
    const library = useContentLibraryStore()
    const workflow = useContentWorkflowStore()
    const record = library.records.find((item) => item.id === 'content-digital-approval')!
    expect(workflow.resumeContent(record)).toBe(true)
    expect(workflow.contentId).toBe(record.id)
    expect(workflow.brief.topic).toBe(record.topic)
    expect(workflow.activeStep).toBe('schedule')
  })
})
