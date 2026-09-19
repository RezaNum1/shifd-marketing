import type { WeeklyMetric } from '../types/performance'

export const WEEKLY_POST_TARGET = 2

export function engagementCount(metric: Pick<WeeklyMetric, 'likes' | 'comments' | 'saves'>) {
  return metric.likes === null || metric.comments === null || metric.saves === null ? null : metric.likes + metric.comments + metric.saves
}

export function calculateEngagementRate(impressions: number, engagements: number) {
  return impressions > 0 ? (engagements / impressions) * 100 : undefined
}

export function calculateConsistency(publishedPosts: number, weeks: number, targetPerWeek = WEEKLY_POST_TARGET) {
  const expected = weeks * targetPerWeek
  return { publishedPosts, expected, percent: expected > 0 ? (publishedPosts / expected) * 100 : 0 }
}
