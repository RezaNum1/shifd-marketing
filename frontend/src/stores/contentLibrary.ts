import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as contentApi from '../api/content'
import * as schedulingApi from '../api/scheduling'
import { errorMessage, isApiError } from '../api/client'
import { beginCommand, completeCommand, discardCommand } from '../api/idempotency'
import { content as normalizeContent, contentSummary as normalizeSummary, event as normalizeEvent, reviewAction as normalizeReviewAction } from '../api/normalizers'
import type { BackendContent } from '../types/backend'
import type { ContentLibraryRecord, ContentPlatform, PublicationInput, PublicationRecord } from '../types/content'

export const useContentLibraryStore = defineStore('contentLibrary', () => {
  const records = ref<ContentLibraryRecord[]>([])
  const canonical = ref<Record<string, BackendContent>>({})
  const etags = ref<Record<string, string>>({})
  const publicationRecords = ref<PublicationRecord[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  function replaceCanonical(value: BackendContent, responseEtag?: string | null) {
    canonical.value[value.id] = value
    etags.value[value.id] = responseEtag ?? `"${value.version}"`
    upsert(normalizeContent(value))
    publicationRecords.value = Object.values(canonical.value).flatMap((content) => content.publications.map((publication) => publicationRecord(publication)))
  }

  function upsert(value: ContentLibraryRecord) {
    const index = records.value.findIndex((item) => item.id === value.id)
    if (index < 0) records.value.unshift(value)
    else records.value[index] = value
  }

  async function load(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    error.value = ''
    try {
      const result = await contentApi.listContents()
      const summaries = result.data.map(normalizeSummary)
      records.value = summaries
      summaries.forEach((record) => {
        if (record.version !== undefined) etags.value[record.id] = `"${record.version}"`
      })
      loaded.value = true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load the content library.')
    } finally { loading.value = false }
  }

  async function getById(id: string, force = false) {
    if (!force && canonical.value[id]) return canonical.value[id]
    try {
      const result = await contentApi.getContent(id)
      replaceCanonical(result.data, result.etag)
      await loadHistory(id, result.data)
      return result.data
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to load this content record.')
      return undefined
    }
  }

  function getCanonical(id: string) { return canonical.value[id] }
  function etagFor(id: string) {
    const record = records.value.find((item) => item.id === id)
    return etags.value[id]
      ?? (canonical.value[id] ? `"${canonical.value[id].version}"` : undefined)
      ?? (record?.version !== undefined ? `"${record.version}"` : undefined)
  }

  async function duplicate(id: string) {
    const version = etagFor(id)
    if (!version) return undefined
    const command = beginCommand(`content.duplicate:${id}`, String(version))
    try {
      const result = await contentApi.duplicateContent(id, version, command.key)
      completeCommand(command.identity)
      replaceCanonical(result.data, result.etag)
      return records.value.find((item) => item.id === result.data.id)
    } catch (reason: unknown) {
      if (isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(command.identity)
      error.value = errorMessage(reason, 'Unable to duplicate this content.')
      if (error.value.includes('changed elsewhere')) await getById(id, true)
      return undefined
    }
  }

  async function archive(id: string) {
    const version = etagFor(id)
    if (!version) return false
    try {
      const result = await contentApi.archiveContent(id, version)
      replaceCanonical(result.data, result.etag)
      return true
    } catch (reason: unknown) {
      error.value = errorMessage(reason, 'Unable to archive this content.')
      if (error.value.includes('changed elsewhere')) await getById(id, true)
      return false
    }
  }

  async function markPublished(contentId: string, platform: ContentPlatform, publication: PublicationInput) {
    const value = canonical.value[contentId] ?? await getById(contentId)
    const variant = value?.variants.find((item) => item.platform === platform)
    const version = value ? etagFor(contentId) : undefined
    if (!value || !variant?.schedule || !version) return false
    const input = { publishedAt: publication.publishedAt, postUrl: publication.postUrl?.trim() || null }
    const command = beginCommand(`schedule.publish:${contentId}:${platform}`, `${variant.schedule.id}|${JSON.stringify(input)}|${version}`)
    try {
      const result = await schedulingApi.publishSchedule(variant.schedule.id, input, version, command.key)
      completeCommand(command.identity)
      replaceCanonical(result.data.content, result.etag)
      return true
    } catch (reason: unknown) {
      if (isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(command.identity)
      error.value = errorMessage(reason, 'Unable to record the publication.')
      if (error.value.includes('changed elsewhere')) await getById(contentId, true)
      return false
    }
  }

  function getPublicationRecord(contentId: string, platform: ContentPlatform) {
    return publicationRecords.value.find((item) => item.contentId === contentId && item.platform === platform)
  }

  function getPublishedPublicationRecords(options: { platform?: ContentPlatform; start?: Date; end?: Date } = {}) {
    return publicationRecords.value.filter((item) => {
      if (options.platform && item.platform !== options.platform) return false
      const publishedAt = new Date(item.publishedAt)
      return (!options.start || publishedAt >= options.start) && (!options.end || publishedAt < options.end)
    })
  }

  // These names remain as compatibility shims for the locked view contract.
  // Canonical workflow state is now updated only by API responses.
  function upsertFromWorkflow(_workflow: unknown) { return undefined }
  function syncScheduledWorkflow(_workflow: unknown) { return undefined }

  async function loadHistory(id: string, value: BackendContent) {
    try {
      const [result, actions] = await Promise.all([contentApi.listContentEvents(id), contentApi.listReviewActions(id)])
      const record = records.value.find((item) => item.id === value.id)
      if (record) {
        const events = result.data.map((item) => normalizeEvent(item))
        const reviewActions = actions.data.map((item) => normalizeReviewAction({ ...item, platform: item.variantId ? value.variants.find((variant) => variant.id === item.variantId)?.platform : undefined }))
        record.details.history = [...events, ...reviewActions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        if (record.details.approval) {
          actions.data.filter((item) => item.action === 'override' && item.variantId && item.justification).forEach((item) => {
            const platform = value.variants.find((variant) => variant.id === item.variantId)?.platform
            if (platform) record.details.approval!.overrides[platform] = item.justification!
          })
        }
      }
    } catch { /* history is secondary to the canonical content read */ }
  }

  return { records, canonical, etags, publicationRecords, loading, loaded, error, load, getById, getCanonical, etagFor, upsert, duplicate, archive, upsertFromWorkflow, syncScheduledWorkflow, markPublished, getPublicationRecord, getPublishedPublicationRecords, replaceCanonical }
})

function publicationRecord(value: BackendContent['publications'][number]): PublicationRecord {
  return { id: value.id, contentId: value.contentId, platformVariantId: value.variantId, platform: value.platform, scheduledAt: value.scheduledAt, publishedAt: value.publishedAt, postUrl: value.postUrl ?? undefined, markedBy: value.markedBy.name }
}
