import { describe, expect, it, vi } from 'vitest'
import { getPerformance } from './performance'
import { request } from './client'

vi.mock('./client', () => ({ request: vi.fn() }))

describe('Performance report request', () => {
  it('uses date parameters for a custom reporting range', () => {
    getPerformance(8, 'linkedin', { startDate: '2026-11-01', endDate: '2026-11-17' })
    expect(request).toHaveBeenCalledWith('/performance?platform=linkedin&startDate=2026-11-01&endDate=2026-11-17')
  })

  it('keeps the existing weekly presets', () => {
    getPerformance(4, 'combined')
    expect(request).toHaveBeenCalledWith('/performance?platform=combined&weeks=4')
  })
})
