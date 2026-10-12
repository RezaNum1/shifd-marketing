import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as assetApi from '../api/assets'
import * as performanceApi from '../api/performance'
import { errorMessage, isApiError } from '../api/client'
import { beginCommand, completeCommand, discardCommand } from '../api/idempotency'
import type { BackendPerformanceReport, BackendWeeklyMetric } from '../types/backend'
import type { InboundInquiryMetric, MarketingEvaluationDashboard, PerformancePlatform, WeeklyMetric } from '../types/performance'

export const usePerformanceStore = defineStore('performance', () => {
  const report = ref<BackendPerformanceReport | null>(null)
  const weeklyMetrics = ref<WeeklyMetric[]>([])
  const inboundInquiries = ref<InboundInquiryMetric[]>([])
  const publications = ref<Awaited<ReturnType<typeof performanceApi.listPublications>>['data']>([])
  const loading = ref(false)
  const supportingLoading = ref(false)
  const supportingLoaded = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const metricEtags = ref<Record<string, string>>({})
  const evaluation = ref<MarketingEvaluationDashboard | null>(null)
  const evaluationLoading = ref(false)
  const evaluationError = ref('')

  async function loadReport(weeks: 4 | 8 | 12 = 8, platform: 'combined' | PerformancePlatform = 'combined') {
    loading.value = true
    error.value = ''
    try {
      const result = await performanceApi.getPerformance(weeks, platform)
      report.value = result.data
      loaded.value = true
      return result.data
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load performance data.')
      return undefined
    } finally { loading.value = false }
  }

  async function loadSupportingData() {
    supportingLoading.value = true
    try {
      const [metrics, inquiries, recentPublications] = await Promise.all([performanceApi.listLinkedInMetrics(), performanceApi.listInquiryMetrics(), performanceApi.listPublications()])
      weeklyMetrics.value = metrics.data.map(normalizeWeeklyMetric)
      inboundInquiries.value = inquiries.data.map((item) => ({ id: item.id, weekStart: item.weekStart, weekEnd: item.weekEnd, count: item.count, source: 'manual' as const, version: item.version }))
      publications.value = recentPublications.data
      metrics.data.forEach((item) => { metricEtags.value[item.id] = `"${item.version}"` })
      supportingLoaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load supporting performance data.')
    } finally { supportingLoading.value = false }
  }

  async function load(weeks: 4 | 8 | 12 = 8, platform: 'combined' | PerformancePlatform = 'combined') {
    await Promise.all([loadReport(weeks, platform), loadSupportingData()])
  }

  async function loadEvaluation() {
    evaluationLoading.value = true
    evaluationError.value = ''
    try { evaluation.value = (await performanceApi.getEvaluation()).data; return evaluation.value }
    catch (reason: unknown) { evaluationError.value = errorMessage(reason, 'Unable to load evaluation dashboard.'); return undefined }
    finally { evaluationLoading.value = false }
  }

  async function configureEvaluation(input: { startDate: string; timezone?: string; definitions?: { customNotes?: string } }) {
    try { await performanceApi.saveEvaluation(input); return await loadEvaluation() }
    catch (reason: unknown) { evaluationError.value = errorMessage(reason, 'Unable to save evaluation settings.'); return undefined }
  }

  async function addBusinessInquiry(input: Record<string, unknown>) {
    try { await performanceApi.createBusinessInquiry(input); return await loadEvaluation() }
    catch (reason: unknown) { evaluationError.value = errorMessage(reason, 'Unable to record business inquiry.'); return undefined }
  }

  async function recordSnapshot(id: string, input: Record<string, unknown>) {
    try { await performanceApi.recordEvaluationSnapshot(id, input); return await loadEvaluation() }
    catch (reason: unknown) { evaluationError.value = errorMessage(reason, 'Unable to record evaluation snapshot.'); return undefined }
  }

  async function addProductionTime(input: { contentId: string; minutes: number; occurredAt?: string; notes?: string }) {
    try { await performanceApi.createProductionTime(input); return await loadEvaluation() }
    catch (reason: unknown) { evaluationError.value = errorMessage(reason, 'Unable to record active production time.'); return undefined }
  }

  async function addWeeklyMetric(input: Omit<WeeklyMetric, 'id' | 'weekEnd' | 'source'> & { weekEnd?: string; source?: WeeklyMetric['source'] }) {
    if (input.platform !== 'linkedin') { error.value = 'Only LinkedIn weekly metrics can be entered manually.'; return undefined }
    const value = await saveMetric(input)
    return value
  }

  async function saveLinkedInMetric(input: Omit<WeeklyMetric, 'id' | 'platform' | 'source'> & { id?: string }) {
    const value = await saveMetric({ ...input, platform: 'linkedin' })
    return value ? { metric: value } : { error: error.value || 'Unable to save the LinkedIn metric.' }
  }

  async function saveMetric(input: Omit<WeeklyMetric, 'id' | 'source' | 'weekEnd'> & { id?: string; platform: PerformancePlatform; weekEnd?: string }) {
    const weekEnd = input.weekEnd ?? addDays(input.weekStart, 6)
    try {
      let evidenceAssetId = input.referenceScreenshot?.assetId ?? null
      if (input.referenceScreenshot?.file) {
        const file = input.referenceScreenshot.file
        const command = beginCommand('asset.upload.metric_evidence', `${file.name}|${file.size}|${file.lastModified}`)
        try {
          const evidence = await assetApi.uploadAsset(file, 'metric_evidence', command.key)
          completeCommand(command.identity)
          evidenceAssetId = evidence.data.id
          input.referenceScreenshot = { ...input.referenceScreenshot, assetId: evidence.data.id, url: evidence.data.contentUrl, file: undefined }
        } catch (reason: unknown) {
          if (isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(command.identity)
          throw reason
        }
      }
      const payload = { weekStart: input.weekStart, weekEnd, followers: input.followers, reach: input.reach, impressions: input.impressions, likes: input.likes, comments: input.comments, saves: input.saves, publishedPosts: input.publishedPosts, nativeEngagementRate: input.nativeEngagementRate ?? null, evidenceAssetId, notes: input.notes ?? null }
      const result = input.id && metricEtags.value[input.id]
        ? await performanceApi.updateLinkedInMetric(input.id, payload, metricEtags.value[input.id])
        : await performanceApi.createLinkedInMetric(payload)
      const metric = normalizeWeeklyMetric(result.data)
      const index = weeklyMetrics.value.findIndex((item) => item.id === metric.id)
      if (index < 0) weeklyMetrics.value.push(metric)
      else weeklyMetrics.value[index] = metric
      metricEtags.value[metric.id] = result.etag ?? `"${metric.version ?? 1}"`
      weeklyMetrics.value.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      return metric
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to save the LinkedIn metric.')
      return undefined
    }
  }

  return { report, weeklyMetrics, inboundInquiries, publications, loading, supportingLoading, supportingLoaded, loaded, error, evaluation, evaluationLoading, evaluationError, loadEvaluation, configureEvaluation, recordSnapshot, addBusinessInquiry, addProductionTime, load, loadReport, loadSupportingData, addWeeklyMetric, saveLinkedInMetric }
})

export function normalizeWeeklyMetric(value: BackendWeeklyMetric): WeeklyMetric {
  const source: WeeklyMetric['source'] = value.source === 'instagram_api' || value.source === 'linkedin_manual' || value.source === 'manual' || value.source === 'mixed' ? value.source : 'manual'
  const evidence = value.evidenceAsset ?? value.evidence
  return { id: value.id, platform: value.platform, weekStart: value.weekStart, weekEnd: value.weekEnd, followers: value.followers, reach: value.reach, impressions: value.impressions, likes: value.likes, comments: value.comments, saves: value.saves, engagements: value.engagements, engagementRate: value.engagementRate, nativeEngagementRate: value.nativeEngagementRate, publishedPosts: value.publishedPosts, source, notes: value.notes ?? undefined, referenceScreenshot: evidence ? { assetId: evidence.id, name: evidence.fileName, type: evidence.mimeType === 'image/png' ? 'PNG' : 'JPG', url: evidence.contentUrl } : undefined, version: value.version }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
