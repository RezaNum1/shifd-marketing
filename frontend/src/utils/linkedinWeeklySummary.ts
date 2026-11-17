import type { BackendPublicationFeedItem, BackendPublicationMetrics } from '../types/backend'

type CountKey = 'impressions' | 'memberReached' | 'views' | 'followersGained' | 'profileViewers' | 'reactions' | 'comments'

export interface LinkedInWeeklySummary {
  id: string
  periodStart: string
  periodEnd: string
  publishedPosts: number
  postsWithMetrics: number
  impressions: number | null
  impressionsInNetwork: number | null
  impressionsOutOfNetwork: number | null
  memberReached: number | null
  views: number | null
  followersGained: number | null
  profileViewers: number | null
  reactions: number | null
  comments: number | null
}

const jakartaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function publicationDateInJakarta(value: string): string {
  const parts = Object.fromEntries(jakartaDateFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function addDateDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function mondayOfDate(value: string): string {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay()
  return addDateDays(value, -(day === 0 ? 6 : day - 1))
}

export function summarizeLinkedInPosts(publications: BackendPublicationFeedItem[], rangeStart: string, rangeEnd: string): LinkedInWeeklySummary[] {
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return []
  const weeks = new Map<string, BackendPublicationFeedItem[]>()
  for (const item of publications) {
    if (item.publication.platform !== 'linkedin') continue
    const publishedDate = publicationDateInJakarta(item.publication.publishedAt)
    if (publishedDate < rangeStart || publishedDate > rangeEnd) continue
    const monday = mondayOfDate(publishedDate)
    weeks.set(monday, [...(weeks.get(monday) ?? []), item])
  }

  return [...weeks.entries()].map(([monday, posts]) => {
    const metrics = posts.map((post) => post.postMetrics).filter((item): item is BackendPublicationMetrics => item !== null)
    const count = (key: CountKey) => {
      const values = metrics.map((item) => item[key]).filter((value): value is number => value !== null)
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null
    }
    const weightedPercentage = (key: 'impressionsInNetwork' | 'impressionsOutOfNetwork') => {
      const measured = metrics.filter((item) => item.impressions !== null && item.impressions > 0 && item[key] !== null)
      const impressions = measured.reduce((sum, item) => sum + (item.impressions ?? 0), 0)
      if (impressions === 0) return null
      return Math.round(measured.reduce((sum, item) => sum + (item.impressions ?? 0) * (item[key] ?? 0), 0) / impressions * 100) / 100
    }
    return {
      id: monday,
      periodStart: monday < rangeStart ? rangeStart : monday,
      periodEnd: addDateDays(monday, 6) > rangeEnd ? rangeEnd : addDateDays(monday, 6),
      publishedPosts: posts.length,
      postsWithMetrics: metrics.length,
      impressions: count('impressions'),
      impressionsInNetwork: weightedPercentage('impressionsInNetwork'),
      impressionsOutOfNetwork: weightedPercentage('impressionsOutOfNetwork'),
      memberReached: count('memberReached'),
      views: count('views'),
      followersGained: count('followersGained'),
      profileViewers: count('profileViewers'),
      reactions: count('reactions'),
      comments: count('comments'),
    }
  }).sort((a, b) => b.id.localeCompare(a.id))
}
