import { describe, expect, it } from 'vitest'
import { deriveCalendarStatus } from '../src/modules/scheduling/service.js'

describe('calendar publication status projection', () => {
  const now = new Date('2026-10-12T00:00:00.000Z')

  it('keeps future plans scheduled and overdue plans unpublished until a record exists', () => {
    expect(deriveCalendarStatus(new Date('2026-10-13T00:00:00.000Z'), false, now)).toBe('scheduled')
    expect(deriveCalendarStatus(new Date('2026-10-11T00:00:00.000Z'), false, now)).toBe('ready_to_publish')
  })

  it('marks publication only when a user-confirmed publication record exists', () => {
    expect(deriveCalendarStatus(new Date('2026-10-13T00:00:00.000Z'), true, now)).toBe('published')
  })
})
