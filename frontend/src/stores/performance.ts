import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mockInboundInquiries, mockWeeklyMetrics } from '../data/performance'
import type { InboundInquiryMetric, WeeklyMetric } from '../types/performance'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const usePerformanceStore = defineStore('performance', () => {
  const weeklyMetrics = ref<WeeklyMetric[]>(mockWeeklyMetrics.map(clone))
  const inboundInquiries = ref<InboundInquiryMetric[]>(mockInboundInquiries.map(clone))

  function addWeeklyMetric(input: Omit<WeeklyMetric, 'id' | 'weekEnd' | 'source'> & { source?: WeeklyMetric['source'] }) {
    const end = new Date(`${input.weekStart}T00:00:00`)
    end.setDate(end.getDate() + 6)
    const metric: WeeklyMetric = {
      ...input,
      id: `${input.platform}-${input.weekStart}-${Date.now()}`,
      weekEnd: end.toISOString().slice(0, 10),
      source: input.source ?? 'mock',
    }
    const existing = weeklyMetrics.value.findIndex((item) => item.platform === metric.platform && item.weekStart === metric.weekStart)
    if (existing >= 0) weeklyMetrics.value[existing] = metric
    else weeklyMetrics.value.push(metric)
    weeklyMetrics.value.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    return metric
  }

  function saveLinkedInMetric(input: Omit<WeeklyMetric, 'id' | 'platform' | 'source'> & { id?: string }) {
    const duplicate = weeklyMetrics.value.find((item) => item.platform === 'linkedin' && item.weekStart === input.weekStart && item.weekEnd === input.weekEnd && item.id !== input.id)
    if (duplicate) return { error: 'A LinkedIn metric record already exists for this week.' as const }
    const metric: WeeklyMetric = {
      ...input,
      id: input.id ?? `linkedin-${input.weekStart}-${Date.now()}`,
      platform: 'linkedin',
      source: 'linkedin_manual',
    }
    const existing = weeklyMetrics.value.findIndex((item) => item.id === metric.id)
    if (existing >= 0) weeklyMetrics.value[existing] = clone(metric)
    else weeklyMetrics.value.push(clone(metric))
    weeklyMetrics.value.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    return { metric }
  }

  return { weeklyMetrics, inboundInquiries, addWeeklyMetric, saveLinkedInMetric }
})
