import { describe, expect, it } from 'vitest'
import { buildPerformanceReport } from '../src/modules/performance/reporting.js'

type Snapshot = Parameters<typeof buildPerformanceReport>[0]

function snapshot(): Snapshot {
  return {
    company: { id: 'company', name: 'Example', description: '', reportingTimezone: 'Asia/Jakarta', brandProfile: null },
    accounts: [],
    metrics: [{
      id: 'metric', socialAccountId: 'account', weekStart: new Date('2026-11-09T00:00:00.000Z'), weekEnd: new Date('2026-11-15T00:00:00.000Z'),
      followers: 10n, reach: 8n, impressions: 20n, likes: 2n, comments: 1n, saves: 0n,
      reportedPublishedPosts: 1, nativeEngagementRate: null, source: 'linkedin_manual', evidenceAssetId: null,
      notes: null, recordedBy: null, createdAt: new Date(), updatedAt: new Date(), version: 1,
      socialAccount: { id: 'account', platform: 'linkedin', reportingTimezone: 'Asia/Jakarta' },
    }],
    inquiries: [],
    publications: [
      { publishedAt: new Date('2026-11-11T17:30:00.000Z'), variant: { platform: 'linkedin' } },
      { publishedAt: new Date('2026-11-15T18:00:00.000Z'), variant: { platform: 'linkedin' } },
    ],
    schedules: [], contents: [], ideas: [], readyIdeaCount: 0, activeProducts: 0,
  } as unknown as Snapshot
}

describe('custom Performance reporting range', () => {
  it('uses exact Jakarta dates for publications and complete weeks for account metrics', () => {
    const report = buildPerformanceReport(snapshot(), 8, 'linkedin', new Date('2026-11-17T00:00:00.000Z'), { startDate: '2026-11-12', endDate: '2026-11-16' })
    expect(report.period).toMatchObject({
      basis: 'custom_date_range', requestedWeeks: 2,
      start: '2026-11-11T17:00:00.000Z', end: '2026-11-16T17:00:00.000Z',
      recordedWeekStarts: [],
    })
    expect(report.summary.published.explicitPosts).toBe(2)
    expect(report.summary.impressions).toBeNull()
    expect(report.weekly).toHaveLength(2)
    expect(report.weekly.every((week) => week.coverage === 'missing')).toBe(true)
    expect(report.consistency.find((row) => row.platform === 'linkedin')?.expected).toBe(2)
  })

  it('includes a weekly observation when the entire week is selected', () => {
    const report = buildPerformanceReport(snapshot(), 8, 'linkedin', new Date('2026-11-17T00:00:00.000Z'), { startDate: '2026-11-09', endDate: '2026-11-15' })
    expect(report.period.recordedWeekStarts).toEqual(['2026-11-09'])
    expect(report.summary.impressions).toBe(20)
    expect(report.weekly[0]).toMatchObject({ coverage: 'recorded', impressions: 20 })
    expect(report.summary.published.explicitPosts).toBe(1)
  })
})
