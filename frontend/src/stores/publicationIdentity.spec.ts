import { describe, expect, it } from 'vitest'
import { resumeDestinationForStatus } from './contentWorkflow'

describe('publication lifecycle boundaries', () => {
  it('does not treat ready-to-publish as published', () => {
    expect(resumeDestinationForStatus('Approved')).toBe('schedule')
    expect(resumeDestinationForStatus('Scheduled')).toBe('schedule')
    expect(resumeDestinationForStatus('Published')).toBe('detail')
  })
})
