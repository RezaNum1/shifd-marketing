import { describe, expect, it } from 'vitest'
import { effectivePublishedPostsForWeek, getEffectivePublishedPostCount, metricForPublication } from './publicationMetrics'
import type { PublicationRecord } from '../types/content'
import type { WeeklyMetric } from '../types/performance'

const metric: WeeklyMetric = {
  id: 'metric', platform: 'instagram', weekStart: '2026-09-07', weekEnd: '2026-09-13',
  followers: 100, reach: 10, impressions: 20, likes: 1, comments: 1, saves: 0,
  publishedPosts: 2, source: 'mock',
}
const publication = (id: string, publishedAt: string): PublicationRecord => ({
  id, contentId: id, platformVariantId: id, platform: 'instagram', publishedAt, markedBy: 'Reviewer',
})

describe('publication metrics reconciliation', () => {
  it('does not add explicit publications to an aggregate twice', () => {
    const records = [publication('a', '2026-09-08T10:00:00'), publication('b', '2026-09-10T10:00:00')]
    const range = { start: new Date('2026-09-07T00:00:00'), end: new Date('2026-09-14T00:00:00') }
    expect(effectivePublishedPostsForWeek(metric, records, 'instagram', range)).toBe(2)
    expect(getEffectivePublishedPostCount([metric], records, range)).toBe(2)
  })

  it('attributes a publication to the metric week containing its timestamp', () => {
    const later = { ...metric, id: 'later', weekStart: '2026-09-14', weekEnd: '2026-09-20' }
    expect(metricForPublication([metric, later], publication('a', '2026-09-12T10:00:00'))?.id).toBe('metric')
  })
})
