import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as schedulingApi from '../api/scheduling'
import { errorMessage } from '../api/client'
import type { BackendCalendarEntry, BackendPlatform, BackendSchedule } from '../types/backend'
import type { ContentCalendarEntry } from '../types/content'

function timeInTimezone(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function normalize(value: BackendCalendarEntry): ContentCalendarEntry {
  return {
    id: value.id,
    contentId: value.contentId,
    title: value.title,
    platform: value.platform,
    contextName: value.product?.name ?? value.company.name,
    pillar: value.pillarCode,
    scheduledDate: dateInTimezone(value.scheduledAt, value.timezone),
    scheduledTime: timeInTimezone(value.scheduledAt, value.timezone),
    scheduledAt: new Date(value.scheduledAt),
    status: value.status === 'published' ? 'Published' : value.status === 'ready_to_publish' ? 'Ready to Publish' : 'Scheduled',
  }
}

export const useCalendarStore = defineStore('calendar', () => {
  const entries = ref<ContentCalendarEntry[]>([])
  const loadedRange = ref<{ start: string; end: string } | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')

  async function load(start: string, end: string, filters: { platform?: BackendPlatform; status?: BackendSchedule['status'] } = {}) {
    loading.value = true
    error.value = ''
    try {
      const result = await schedulingApi.getCalendar(start, end, filters)
      entries.value = result.data.entries.map(normalize).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      loadedRange.value = { start, end }
      loaded.value = true
      return entries.value
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load the content calendar.')
      return undefined
    } finally { loading.value = false }
  }

  return { entries, loadedRange, loaded, loading, error, load }
})
