import type { PublicationRecord } from '../types/content'
import type { WeeklyMetric, PerformancePlatform } from '../types/performance'

type DateRange = { start?: Date; end?: Date }

function inRange(value: Date, range: DateRange) {
  return (!range.start || value >= range.start) && (!range.end || value < range.end)
}

function metricEnd(metric: WeeklyMetric) {
  const end = new Date(`${metric.weekEnd}T00:00:00`)
  // WeeklyMetric.weekEnd is inclusive; selectors use an exclusive boundary.
  end.setDate(end.getDate() + 1)
  return end
}

function metricStart(metric: WeeklyMetric) {
  return new Date(`${metric.weekStart}T00:00:00`)
}

function uniquePublications(publications: PublicationRecord[]) {
  return [...new Map(publications.map((publication) => [`${publication.contentId}:${publication.platform}`, publication])).values()]
}

/**
 * Reconciles imported weekly aggregates with known platform publications.
 * A weekly aggregate may already include the same manually recorded posts, so
 * the effective count is the larger of the two values, never their sum.
 */
export function effectivePublishedPostsForWeek(
  metric: WeeklyMetric | undefined,
  publications: PublicationRecord[],
  platform: PerformancePlatform,
  range: { start: Date; end: Date },
) {
  const known = uniquePublications(publications.filter((publication) => {
    if (publication.platform !== platform) return false
    const publishedAt = new Date(publication.publishedAt)
    return inRange(publishedAt, range)
  }))
  return Math.max(metric?.publishedPosts ?? 0, known.length)
}

/** Shared selector consumed by Performance and Overview. */
export function getEffectivePublishedPostCount(
  metrics: WeeklyMetric[],
  publications: PublicationRecord[],
  options: DateRange & { platform?: PerformancePlatform } = {},
) {
  const selectedMetrics = metrics.filter((metric) => {
    if (options.platform && metric.platform !== options.platform) return false
    const start = metricStart(metric)
    return (!options.end || start < options.end) && (!options.start || metricEnd(metric) > options.start)
  })
  const selectedPublications = uniquePublications(publications.filter((publication) => {
    if (options.platform && publication.platform !== options.platform) return false
    return inRange(new Date(publication.publishedAt), options)
  }))
  const matchedPublicationIds = new Set<string>()
  const groups = new Map<string, WeeklyMetric[]>()
  selectedMetrics.forEach((metric) => {
    const key = `${metric.platform}:${metric.weekStart}`
    groups.set(key, [...(groups.get(key) ?? []), metric])
  })
  let total = 0
  groups.forEach((group) => {
    const metric = group[0]
    const start = metricStart(metric)
    const end = metricEnd(metric)
    const weekPublications = selectedPublications.filter((publication) => {
      const publishedAt = new Date(publication.publishedAt)
      const matches = publication.platform === metric.platform && publishedAt >= start && publishedAt < end
      if (matches) matchedPublicationIds.add(publication.id)
      return matches
    })
    total += Math.max(Math.max(...group.map((item) => item.publishedPosts), 0), weekPublications.length)
  })
  // Publications without a matching imported metric week are still explicit
  // evidence and must be counted once.
  total += selectedPublications.filter((publication) => !matchedPublicationIds.has(publication.id)).length
  return total
}

export function getEffectivePublishedPostsForWeek(
  metrics: WeeklyMetric[],
  publications: PublicationRecord[],
  platform: PerformancePlatform,
  start: Date,
  end: Date,
) {
  const metric = metrics.find((item) => item.platform === platform && metricStart(item) <= start && metricEnd(item) > start)
  return effectivePublishedPostsForWeek(metric, publications, platform, { start, end })
}

export function metricForPublication(metrics: WeeklyMetric[], publication: PublicationRecord) {
  const publishedAt = new Date(publication.publishedAt)
  return metrics.find((metric) => metric.platform === publication.platform && metricStart(metric) <= publishedAt && metricEnd(metric) > publishedAt)
}
