import { describe, expect, it } from 'vitest'
import { compareValues, evaluationPeriods, isWithinHalfOpenPeriod, productionTimeStats, weeklyPublicationKpis } from '../src/modules/performance/evaluation.js'

describe('four-week marketing evaluation calculations', () => {
  it('uses exact 28-local-day baseline and intervention boundaries', () => {
    const periods = evaluationPeriods('2026-10-12', 'Asia/Jakarta')
    expect(periods.baseline).toMatchObject({ startDate: '2026-09-14', endDate: '2026-10-12' })
    expect(periods.baseline.start.toISOString()).toBe('2026-09-13T17:00:00.000Z')
    expect(periods.intervention.start.toISOString()).toBe('2026-10-11T17:00:00.000Z')
    expect(periods.intervention.end.toISOString()).toBe('2026-11-08T17:00:00.000Z')
  })

  it('preserves zero versus missing, and suppresses changes for partial periods', () => {
    expect(compareValues(0, 3, true)).toMatchObject({ absoluteChange: 3, percentageChange: null, status: 'complete' })
    expect(compareValues(null, 3, true)).toMatchObject({ absoluteChange: null, percentageChange: null, status: 'missing' })
    expect(compareValues(4, 2, false)).toMatchObject({ baseline: 4, intervention: 2, absoluteChange: null, percentageChange: null, status: 'partial' })
  })

  it('counts actual posts per platform and uses population CV with a zero-mean guard', () => {
    const start = new Date('2026-10-11T17:00:00.000Z')
    const posts = [
      { platform: 'instagram', publishedAt: new Date('2026-10-12T04:00:00.000Z'), contentId: 'a' },
      { platform: 'instagram', publishedAt: new Date('2026-10-13T04:00:00.000Z'), contentId: 'b' },
      { platform: 'linkedin', publishedAt: new Date('2026-10-12T04:00:00.000Z'), contentId: 'a' },
    ]
    const instagram = weeklyPublicationKpis(posts, 'instagram', start, new Date('2026-11-08T17:00:00.000Z'), true)
    const linkedin = weeklyPublicationKpis(posts, 'linkedin', start, new Date('2026-11-08T17:00:00.000Z'), true)
    expect(instagram.weeklyCounts).toEqual([2, 0, 0, 0])
    expect(instagram.weeksMeetingTarget).toBe(1)
    expect(instagram.coefficientOfVariation).toBeCloseTo(Math.sqrt(3))
    expect(linkedin.weeklyCounts).toEqual([1, 0, 0, 0])
    expect(linkedin.coefficientOfVariation).toBeCloseTo(Math.sqrt(3))
    expect(weeklyPublicationKpis([], 'linkedin', start, new Date('2026-11-08T17:00:00.000Z'), true).coefficientOfVariation).toBeNull()
  })

  it('reports active production-time summaries descriptively', () => {
    expect(productionTimeStats([30, 90, 60])).toMatchObject({ count: 3, median: 60, minimum: 30, maximum: 90 })
    expect(productionTimeStats([20, 40]).median).toBe(30)
    expect(productionTimeStats([])).toMatchObject({ count: 0, median: null, minimum: null, maximum: null, status: 'missing' })
  })

  it('includes the period start and excludes the end boundary for production-time observations', () => {
    const start = new Date('2026-09-13T17:00:00.000Z')
    const end = new Date('2026-09-14T05:00:00.000Z')
    const observations = [
      new Date('2026-09-13T16:59:59.999Z'),
      start,
      new Date('2026-09-14T04:59:00.000Z'),
      end,
      new Date('2026-09-14T05:00:00.001Z'),
    ]
    expect(observations.filter((value) => isWithinHalfOpenPeriod(value, start, end))).toEqual([start, observations[2]])
  })
})
