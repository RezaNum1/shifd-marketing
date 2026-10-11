import { describe, expect, it } from 'vitest'
import { activityStateTransition, calculateOutreachSummary, validateActivityInput } from '../src/modules/prospects/activities.js'

describe('outbound activity validation', () => {
  it('accepts a historical email sent record with an actual timestamp and explicit provenance', () => {
    const result = validateActivityInput({ activityType: 'email_sent', occurredAt: '2025-03-01T02:00:00.000Z', subject: 'Introduction', provenance: 'historical' })
    expect(result.occurredAt?.toISOString()).toBe('2025-03-01T02:00:00.000Z')
    expect(result.provenance).toBe('historical')
  })

  it('requires reply classification and valid timezone-aware dates', () => {
    expect(() => validateActivityInput({ activityType: 'reply_received', occurredAt: '2026-01-01T00:00:00Z', provenance: 'non_artifact_assisted' })).toThrow('Replies require a response classification')
    expect(() => validateActivityInput({ activityType: 'email_sent', occurredAt: 'yesterday', subject: 'Hi', provenance: 'artifact_assisted' })).toThrow('ISO timestamp with a timezone')
  })

  it('creates only pending follow-up plans with due dates', () => {
    expect(validateActivityInput({ activityType: 'follow_up', dueAt: '2026-12-01T00:00:00Z', provenance: 'non_artifact_assisted' }).dueAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(() => validateActivityInput({ activityType: 'follow_up', provenance: 'historical' })).toThrow('Follow-up date is required')
  })
})

describe('outbound summary', () => {
  it('counts persisted event types, completed follow-ups, interested replies and overdue plans', () => {
    const rows = [
      { activityType: 'email_sent', status: 'recorded', responseClassification: null, occurredAt: new Date('2026-05-01T00:00:00Z'), dueAt: null },
      { activityType: 'follow_up', status: 'completed', responseClassification: null, occurredAt: new Date('2026-05-03T00:00:00Z'), dueAt: new Date('2026-05-02T00:00:00Z') },
      { activityType: 'follow_up', status: 'pending', responseClassification: null, occurredAt: null, dueAt: new Date('2026-05-04T00:00:00Z') },
      { activityType: 'reply_received', status: 'recorded', responseClassification: 'interested', occurredAt: new Date('2026-05-05T00:00:00Z'), dueAt: null },
      { activityType: 'meeting', status: 'completed', responseClassification: null, occurredAt: new Date('2026-05-06T00:00:00Z'), dueAt: null },
      { activityType: 'product_demonstration', status: 'completed', responseClassification: null, occurredAt: new Date('2026-05-07T00:00:00Z'), dueAt: null },
    ]
    expect(calculateOutreachSummary(rows, new Date('2026-05-05T00:00:00Z'))).toEqual({ emailsSent: 1, followUpsCompleted: 1, repliesReceived: 1, interestedResponses: 1, meetings: 1, demonstrations: 1, pendingFollowUps: 1, overdueFollowUps: 1, lastInteractionAt: '2026-05-07T00:00:00.000Z' })
  })
})

describe('activity state transitions', () => {
  it('completes pending follow-ups with an actual completion timestamp', () => {
    const at = new Date('2026-06-01T10:00:00.000Z')
    expect(activityStateTransition('follow_up', 'pending', 'complete', at)).toEqual({ status: 'completed', completedAt: at, occurredAt: at })
  })

  it('cancels pending follow-ups without counting them as completed and rejects repeat transitions', () => {
    expect(activityStateTransition('follow_up', 'pending', 'cancel', new Date())).toMatchObject({ status: 'cancelled', completedAt: null, occurredAt: null })
    expect(() => activityStateTransition('follow_up', 'completed', 'cancel', new Date())).toThrow('Only pending follow-ups')
  })
})
