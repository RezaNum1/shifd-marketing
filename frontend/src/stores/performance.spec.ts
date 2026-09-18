import { describe, expect, it } from 'vitest'
import { normalizeWeeklyMetric } from './performance'

describe('performance metric normalization', () => {
  it('preserves missing reach as null instead of converting it to zero', () => {
    const metric = normalizeWeeklyMetric({ id: 'metric-1', platform: 'linkedin', weekStart: '2026-09-07', weekEnd: '2026-09-13', followers: 100, reach: null, impressions: 0, likes: 0, comments: 0, saves: 0, engagements: 0, engagementRate: null, publishedPosts: 0, source: 'linkedin_manual', notes: null, version: 1 })
    expect(metric.reach).toBeNull()
  })

  it('keeps backend-calculated engagement values for the metrics table', () => {
    const metric = normalizeWeeklyMetric({ id: 'metric-2', platform: 'linkedin', weekStart: '2026-09-07', weekEnd: '2026-09-13', followers: 100, reach: 50, impressions: 100, likes: 1, comments: 1, saves: 1, engagements: 3, engagementRate: 3, publishedPosts: 1, source: 'linkedin_manual', notes: null, version: 1 })
    expect(metric.engagements).toBe(3)
    expect(metric.engagementRate).toBe(3)
  })
})
