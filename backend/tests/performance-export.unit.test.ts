import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { evaluationWorkbook, performanceWorkbook } from '../src/modules/performance/export-workbook.js'

async function openWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  return workbook
}

function cell(sheet: ExcelJS.Worksheet, row: number, key: string) {
  const header = sheet.getRow(1)
  const index = header.values instanceof Array ? header.values.findIndex((value) => value === key) : -1
  if (index < 1) throw new Error(`Missing ${key} column`)
  return sheet.getRow(row).getCell(index).value
}

describe('performance Excel exports', () => {
  it('exports only publications in the selected Overview period and platform', async () => {
    const report = {
      period: { basis: 'custom_date_range', requestedWeeks: 4, start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z', recordedWeekStarts: [], timezone: 'UTC', asOf: '2026-12-01T12:00:00.000Z' },
      platform: 'linkedin',
      summary: { latestWeeklyReach: null, impressions: 20, engagements: 3, engagementRate: null, published: { effectivePosts: 1, explicitPosts: 1, reportedPosts: 1, basis: 'publication_records' } },
      weekly: [], followers: [], consistency: [], execution: { planned: 1, publishedWithinCohort: 1, pending: 0, onTime: 1 }, inquiries: { weeks: [] },
    } as unknown as Parameters<typeof performanceWorkbook>[0]
    const publication = (id: string, platform: string, publishedAt: string) => ({
      publication: { id, platform, publishedAt, postUrl: null }, content: { id: `content-${id}`, title: `Post ${id}` },
      postMetrics: { source: 'linkedin_manual', observedAt: publishedAt, views: null, comments: 0 },
    })
    const overview = { recentlyPublished: [
      publication('included', 'linkedin', '2026-11-17T12:00:00.000Z'),
      publication('wrong-platform', 'instagram', '2026-11-18T12:00:00.000Z'),
      publication('outside-range', 'linkedin', '2026-12-02T12:00:00.000Z'),
    ] } as unknown as Parameters<typeof performanceWorkbook>[1]
    const workbook = await openWorkbook(await performanceWorkbook(report, overview, { startDate: '2026-11-01', endDate: '2026-11-30' }))
    expect(workbook.getWorksheet('Panduan Data')).toBeDefined()
    expect(workbook.getWorksheet('Data Dictionary')).toBeDefined()
    const sheet = workbook.getWorksheet('Publications')!
    expect(sheet.rowCount).toBe(2)
    expect(cell(sheet, 2, 'publication_id')).toBe('included')
    expect(cell(sheet, 2, 'views')).toBeNull()
    expect(cell(sheet, 2, 'comments')).toBe(0)
  })

  it('exports Evaluation records and metric history with explicit date metadata', async () => {
    const data = {
      range: { startDate: '2026-11-01', endDate: '2026-11-17', endExclusive: '2026-11-17T17:00:00.000Z', days: 17, timezone: 'Asia/Jakarta' },
      totals: { publishedPosts: 1, instagram: 1 }, weekly: [{ startDate: '2026-11-01', endDate: '2026-11-07', publishedPosts: 1, instagram: 1 }],
      publications: [{ id: 'post-1', contentId: 'content-1', title: 'A post', platform: 'instagram', publishedAt: '2026-11-02T00:00:00.000Z', targetIndustry: null, targetProspectId: null, metrics: { views: '25', reach: null, likes: '0', comments: null, saves: null, shares: null, totalInteractions: '0' }, metricHistory: [{ observedAt: '2026-11-03T00:00:00.000Z', views: '25', reach: null, likes: '0', comments: null, saves: null, shares: null, totalInteractions: '0' }] }],
      outboundActivities: [],
    } as unknown as Parameters<typeof evaluationWorkbook>[0]
    const workbook = await openWorkbook(await evaluationWorkbook(data, new Date('2026-11-17T12:00:00.000Z')))
    const guide = workbook.getWorksheet('Panduan Data')!
    expect(guide.getRows(1, guide.rowCount)?.some((_, index) => cell(guide, index + 1, 'key') === 'selected_start_date' && cell(guide, index + 1, 'value') === '2026-11-01')).toBe(true)
    expect(cell(workbook.getWorksheet('Publications')!, 2, 'views')).toBe(25)
    expect(cell(workbook.getWorksheet('Metric History')!, 2, 'publication_id')).toBe('post-1')
  })

  it('writes preset period dates in the report timezone', async () => {
    const report = {
      period: { basis: 'latest_recorded_intervals', requestedWeeks: 4, start: '2026-10-31T17:00:00.000Z', end: '2026-11-07T17:00:00.000Z', recordedWeekStarts: [], timezone: 'Asia/Jakarta', asOf: '2026-11-08T00:00:00.000Z' },
      platform: 'combined', summary: { latestWeeklyReach: null, impressions: null, engagements: null, engagementRate: null, published: { effectivePosts: 0, explicitPosts: 0, reportedPosts: 0, basis: 'publication_records' } },
      weekly: [], followers: [], consistency: [], execution: { planned: 0, publishedWithinCohort: 0, pending: 0, onTime: 0 }, inquiries: { weeks: [] },
    } as unknown as Parameters<typeof performanceWorkbook>[0]
    const workbook = await openWorkbook(await performanceWorkbook(report, { recentlyPublished: [] } as unknown as Parameters<typeof performanceWorkbook>[1]))
    const guide = workbook.getWorksheet('Panduan Data')!
    const entries = Object.fromEntries((guide.getRows(2, guide.rowCount - 1) ?? []).map((_, index) => [cell(guide, index + 2, 'key'), cell(guide, index + 2, 'value')]))
    expect(entries.selected_start_date).toBe('2026-11-01')
    expect(entries.selected_end_date).toBe('2026-11-07')
  })

  it('includes research comparison only when both configured periods fit the selected range', async () => {
    const base = {
      range: { startDate: '2026-10-01', endDate: '2026-11-17', endExclusive: '2026-11-17T17:00:00.000Z', days: 48, timezone: 'Asia/Jakarta' },
      totals: {}, weekly: [], publications: [], outboundActivities: [],
    } as unknown as Parameters<typeof evaluationWorkbook>[0]
    const research = {
      evaluation: { snapshots: [{ id: 'snapshot-1', stage: 'week0', capturedAt: '2026-11-01T00:00:00.000Z', measurements: { instagramFollowers: 100 }, source: 'Instagram', notes: null }] },
      periods: { baseline: { start: '2026-10-01T00:00:00.000Z' }, intervention: { endExclusive: '2026-11-15T00:00:00.000Z' } },
      comparison: [{ kpi: 'Followers', baseline: 90, intervention: 100, absoluteChange: 10, percentageChange: 11.1, status: 'complete', source: 'evaluation_snapshots', sourceRecordIds: ['snapshot-1'] }],
    } as unknown as NonNullable<Parameters<typeof evaluationWorkbook>[2]>
    const included = await openWorkbook(await evaluationWorkbook(base, new Date('2026-11-17T12:00:00.000Z'), research))
    expect(cell(included.getWorksheet('Research Comparison')!, 2, 'kpi')).toBe('Followers')
    expect(cell(included.getWorksheet('Evaluation Snapshots')!, 2, 'value')).toBe(100)

    const narrower = { ...base, range: { ...base.range, startDate: '2026-11-01' } } as Parameters<typeof evaluationWorkbook>[0]
    const excluded = await openWorkbook(await evaluationWorkbook(narrower, new Date('2026-11-17T12:00:00.000Z'), research))
    expect(excluded.getWorksheet('Research Comparison')!.rowCount).toBe(1)
  })
})
