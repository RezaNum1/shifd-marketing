import { describe, expect, it } from 'vitest'
import type { BackendPublicationFeedItem, BackendPublicationMetrics } from '../types/backend'
import { summarizeLinkedInPosts } from './linkedinWeeklySummary'

function post(id: string, publishedAt: string, metrics: Partial<BackendPublicationMetrics> | null): BackendPublicationFeedItem {
  return {
    publication: { id, platform: 'linkedin', publishedAt },
    postMetrics: metrics === null ? null : {
      impressions: null, impressionsInNetwork: null, impressionsOutOfNetwork: null,
      memberReached: null, views: null, followersGained: null, profileViewers: null,
      reactions: null, comments: null, ...metrics,
    },
  } as BackendPublicationFeedItem
}

describe('LinkedIn weekly post summary', () => {
  it('groups by Jakarta publication date and applies the selected inclusive range', () => {
    const posts = [
      post('sunday', '2026-11-15T16:30:00.000Z', { impressions: 10 }),
      post('monday', '2026-11-15T18:00:00.000Z', { impressions: 20 }),
    ]
    expect(summarizeLinkedInPosts(posts, '2026-11-16', '2026-11-18')).toMatchObject([
      { id: '2026-11-16', periodStart: '2026-11-16', periodEnd: '2026-11-18', publishedPosts: 1, impressions: 20 },
    ])
  })

  it('sums available counts and weights network percentages by impressions', () => {
    const posts = [
      post('a', '2026-11-16T08:00:00.000Z', { impressions: 100, impressionsInNetwork: 60, impressionsOutOfNetwork: 40, memberReached: 70, reactions: 8 }),
      post('b', '2026-11-17T08:00:00.000Z', { impressions: 50, impressionsInNetwork: 20, impressionsOutOfNetwork: 80, memberReached: 40, reactions: 2 }),
      post('c', '2026-11-18T08:00:00.000Z', null),
    ]
    expect(summarizeLinkedInPosts(posts, '2026-11-16', '2026-11-22')).toMatchObject([
      { publishedPosts: 3, postsWithMetrics: 2, impressions: 150, impressionsInNetwork: 46.67, impressionsOutOfNetwork: 53.33, memberReached: 110, reactions: 10, comments: null },
    ])
  })
})
