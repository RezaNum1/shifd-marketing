import { describe, expect, it } from 'vitest'
import { evaluationInsights } from './evaluationInsights'
import type { CustomEvaluationRange } from '../types/performance'

describe('custom range evaluation insights', () => {
  it('keeps missing post metrics distinct from measured zero and finds the peak week', () => {
    const range = {
      range: { startDate: '2026-11-01', endDate: '2026-11-14', endExclusive: '2026-11-14T17:00:00.000Z', days: 14, timezone: 'Asia/Jakarta' },
      totals: { repliesReceived: 3, interestedResponses: 1 },
      weekly: [
        { startDate: '2026-11-01', endDate: '2026-11-07', publishedPosts: 0, instagram: 0, linkedin: 0, emailsSent: 4, repliesReceived: 1, meetings: 0, demonstrations: 0 },
        { startDate: '2026-11-08', endDate: '2026-11-14', publishedPosts: 2, instagram: 1, linkedin: 1, emailsSent: 7, repliesReceived: 2, meetings: 1, demonstrations: 1 },
      ],
      publications: [
        { metrics: { views: '0', reach: null } },
        { metrics: { views: null, reach: null } },
      ],
    } as CustomEvaluationRange
    const result = evaluationInsights(range)
    expect(result.peakWeek?.startDate).toBe('2026-11-08')
    expect(result.weeksWithoutPosts).toBe(1)
    expect(result.measuredPosts).toBe(1)
    expect(result.outreachSeries[2]?.values).toEqual([0, 2])
  })
})
