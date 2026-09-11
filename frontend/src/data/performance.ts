import type { InboundInquiryMetric, PerformancePlatform, WeeklyMetric } from '../types/performance'

const weekStarts = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']

function weekEnd(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00`)
  date.setDate(date.getDate() + 6)
  return date.toISOString().slice(0, 10)
}

function createMetrics(platform: PerformancePlatform, values: Omit<WeeklyMetric, 'id' | 'platform' | 'weekStart' | 'weekEnd' | 'source'>[], source: WeeklyMetric['source'] = 'mock'): WeeklyMetric[] {
  return weekStarts.map((weekStart, index) => ({
    ...values[index],
    id: `${platform}-${weekStart}`,
    platform,
    weekStart,
    weekEnd: weekEnd(weekStart),
    source,
  }))
}

export const mockWeeklyMetrics: WeeklyMetric[] = [
  ...createMetrics('instagram', [
    { followers: 128, reach: 320, impressions: 720, likes: 22, comments: 4, saves: 7, publishedPosts: 1 },
    { followers: 130, reach: 380, impressions: 840, likes: 25, comments: 5, saves: 8, publishedPosts: 2 },
    { followers: 132, reach: 410, impressions: 920, likes: 28, comments: 5, saves: 9, publishedPosts: 1 },
    { followers: 135, reach: 460, impressions: 1_020, likes: 31, comments: 6, saves: 10, publishedPosts: 2 },
    { followers: 138, reach: 510, impressions: 1_140, likes: 35, comments: 7, saves: 12, publishedPosts: 2 },
    { followers: 141, reach: 540, impressions: 1_260, likes: 37, comments: 8, saves: 13, publishedPosts: 1 },
    { followers: 145, reach: 580, impressions: 1_380, likes: 41, comments: 9, saves: 15, publishedPosts: 2 },
    { followers: 148, reach: 610, impressions: 1_460, likes: 43, comments: 9, saves: 16, publishedPosts: 2 },
    { followers: 151, reach: 650, impressions: 1_580, likes: 47, comments: 10, saves: 18, publishedPosts: 1 },
    { followers: 154, reach: 690, impressions: 1_720, likes: 52, comments: 11, saves: 20, publishedPosts: 2 },
    { followers: 158, reach: 730, impressions: 1_860, likes: 56, comments: 12, saves: 22, publishedPosts: 2 },
    { followers: 162, reach: 780, impressions: 2_040, likes: 61, comments: 13, saves: 24, publishedPosts: 2 },
  ]),
  ...createMetrics('linkedin', [
    { followers: 240, reach: 500, impressions: 1_200, likes: 28, comments: 7, saves: 10, publishedPosts: 1 },
    { followers: 242, reach: 560, impressions: 1_320, likes: 31, comments: 8, saves: 11, publishedPosts: 1 },
    { followers: 245, reach: 620, impressions: 1_480, likes: 36, comments: 9, saves: 13, publishedPosts: 2 },
    { followers: 248, reach: 680, impressions: 1_620, likes: 40, comments: 10, saves: 14, publishedPosts: 1 },
    { followers: 252, reach: 720, impressions: 1_780, likes: 44, comments: 11, saves: 16, publishedPosts: 2 },
    { followers: 255, reach: 770, impressions: 1_920, likes: 48, comments: 12, saves: 18, publishedPosts: 1 },
    { followers: 259, reach: 820, impressions: 2_080, likes: 52, comments: 13, saves: 20, publishedPosts: 2 },
    { followers: 263, reach: 860, impressions: 2_220, likes: 56, comments: 14, saves: 21, publishedPosts: 1 },
    { followers: 267, reach: 910, impressions: 2_380, likes: 61, comments: 15, saves: 23, publishedPosts: 2 },
    { followers: 271, reach: 960, impressions: 2_540, likes: 66, comments: 16, saves: 25, publishedPosts: 2 },
    { followers: 275, reach: 1_020, impressions: 2_720, likes: 72, comments: 17, saves: 27, publishedPosts: 2 },
    { followers: 280, reach: 1_080, impressions: 2_900, likes: 78, comments: 18, saves: 29, publishedPosts: 2 },
  ]),
]

export const mockInboundInquiries: InboundInquiryMetric[] = weekStarts.map((weekStart, index) => ({
  id: `whatsapp-${weekStart}`,
  weekStart,
  count: [0, 1, 0, 2, 1, 0, 2, 1, 3, 2, 1, 2][index],
  source: 'mock',
}))
