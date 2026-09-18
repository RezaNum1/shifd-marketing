import { describe, expect, it } from 'vitest'
import { contentSummary } from './normalizers'
import type { BackendContentSummary } from '../types/backend'

describe('backend response normalization', () => {
  it('keeps canonical lifecycle and product context in content summaries', () => {
    const summary: BackendContentSummary = {
      id: 'content-1', title: 'A saved brief', brief: { topic: 'Topic', pillarCode: 'educational', objective: 'awareness' }, company: { id: 'company-1', name: 'Company' }, product: { id: 'product-1', name: 'Product' }, enabledPlatforms: ['instagram'], lifecycleStatus: 'Needs Revision', resumeStep: 'review', scheduleSummary: [], publications: [], updatedAt: '2026-09-01T00:00:00Z', version: 4,
    }
    const normalized = contentSummary(summary)
    expect(normalized.context).toBe('product')
    expect(normalized.status).toBe('Needs Revision')
    expect(normalized.workflowStep).toBe('review')
    expect(normalized.version).toBe(4)
  })

  it('keeps terminal lifecycle records on the detail destination', () => {
    const summary: BackendContentSummary = {
      id: 'content-2', title: 'Published content', brief: { topic: 'Topic', pillarCode: 'educational', objective: 'awareness' }, company: { id: 'company-1', name: 'Company' }, product: null, enabledPlatforms: ['linkedin'], lifecycleStatus: 'Published', resumeStep: null, scheduleSummary: [], publications: [], updatedAt: '2026-09-01T00:00:00Z', version: 5,
    }
    expect(contentSummary(summary).workflowStep).toBeNull()
  })
})
