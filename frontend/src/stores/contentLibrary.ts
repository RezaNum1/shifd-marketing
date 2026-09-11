import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mockContentLibraryRecords } from '../data/contentLibrary'
import { objectiveOptions, pillarOptions } from '../data/contentBrief'
import type { ContentHistoryEvent, ContentLibraryRecord, ContentLifecycleStatus, ContentPlatform, PublicationInput, PublicationRecord } from '../types/content'
import type { useContentWorkflowStore } from './contentWorkflow'
import { useContentIdeasStore } from './contentIdeas'
import { useCompanyContextStore } from './companyContext'
import { retainContentAssets } from '../utils/creativeAssetRegistry'
import { contentLifecycle, normalizeContentRecord, setContentLifecycle } from '../utils/contentRecords'

type ContentWorkflowStore = ReturnType<typeof useContentWorkflowStore>

function cloneRecord(record: ContentLibraryRecord): ContentLibraryRecord {
  return JSON.parse(JSON.stringify(record)) as ContentLibraryRecord
}

export const useContentLibraryStore = defineStore('contentLibrary', () => {
  const records = ref<ContentLibraryRecord[]>(mockContentLibraryRecords.map((record) => normalizeContentRecord(cloneRecord(record))))
  const publicationRecords = ref<PublicationRecord[]>(records.value.flatMap((record) => record.platforms.flatMap((platform) => {
    const lifecycle = contentLifecycle(record)
    const publication = lifecycle.publications[platform]
    if (!publication) return []
    const schedule = lifecycle.schedules[platform]
    return [{
      id: `${record.id}:${platform}`,
      contentId: record.id,
      platformVariantId: `${record.id}:${platform}`,
      platform,
      scheduledAt: schedule ? `${schedule.date}T${schedule.time}:00` : undefined,
      publishedAt: publication.publishedAt,
      postUrl: publication.postUrl,
      markedBy: 'Reza Fadli Harris',
    }]
  })))

  function upsert(record: ContentLibraryRecord) {
    retainContentAssets(record.id, [...record.details.creative.instagram, ...record.details.creative.linkedin])
    const normalized = normalizeContentRecord(record)
    const index = records.value.findIndex((item) => item.id === record.id)
    if (index === -1) records.value.unshift(normalized)
    else records.value[index] = normalized
  }

  function duplicate(id: string): ContentLibraryRecord | undefined {
    const source = records.value.find((record) => record.id === id)
    if (!source) return
    const duplicateRecord: ContentLibraryRecord = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      title: `${source.title} — Copy`,
      status: 'Draft',
      scheduleDate: undefined,
      scheduleTime: undefined,
      publishedAt: undefined,
      updatedAt: 'Just now',
      workflowStep: 'brief',
      lifecycle: {
        status: 'Draft',
        workflowStep: 'brief',
        schedules: {},
        publications: {},
      },
      details: {
        ...cloneRecord(source).details,
        brandAssessments: {},
        approval: undefined,
        schedules: {},
        publications: {},
        history: [
          {
            id: `duplicated-${Date.now()}`,
            event: 'Content duplicated as a new draft',
            actor: 'Reza Fadli Harris',
            timestamp: 'Just now',
          },
        ],
      },
    }
    upsert(duplicateRecord)
    return records.value.find((record) => record.id === duplicateRecord.id)
  }

  function archive(id: string) {
    const record = records.value.find((item) => item.id === id)
    if (record) {
      setContentLifecycle(record, { ...contentLifecycle(record), status: 'Archived', workflowStep: 'brief' })
      record.updatedAt = 'Just now'
      record.details.history.push({
        id: `archived-${Date.now()}`,
        event: 'Content archived',
        actor: 'Reza Fadli Harris',
        timestamp: 'Just now',
      })
    }
  }

  function upsertFromWorkflow(workflow: ContentWorkflowStore) {
    if (workflow.activeStep === 'brief' && !workflow.isScheduled) return
    const existingRecord = records.value.find((record) => record.id === workflow.contentId)
    const preserveAssetPreview = (assetId: string, file: File, currentUrl: string) =>
      [...(existingRecord?.details.creative.instagram ?? []), ...(existingRecord?.details.creative.linkedin ?? [])]
        .find((asset) => asset.id === assetId)?.url ?? (currentUrl || (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''))
    const platforms: ContentPlatform[] = []
    const companyContext = useCompanyContextStore()
    if (workflow.enabledPlatforms.instagram) platforms.push('instagram')
    if (workflow.enabledPlatforms.linkedin) platforms.push('linkedin')
    const schedules = platforms.map((platform) => workflow.scheduledRecords[platform])
    const pillar = pillarOptions.find((item) => item.value === workflow.brief.pillar)?.label ?? workflow.brief.pillar
    const objective = objectiveOptions.find((item) => item.value === workflow.brief.objective)?.label ?? workflow.brief.objective
    const history: ContentHistoryEvent[] = [
      { id: 'session-brief', event: 'Content brief created', actor: 'Reza Fadli Harris', timestamp: 'Current session' },
      ...(workflow.activeStep !== 'brief' ? [{ id: 'session-generated', event: 'Content generated', actor: 'Shifd Marketing', timestamp: 'Current session', metadata: 'Mock frontend generation' }] : []),
      ...platforms.map((platform) => ({ id: `session-adapt-${platform}`, event: `${platform === 'instagram' ? 'Instagram' : 'LinkedIn'} variant generated`, platform, actor: 'Shifd Marketing', timestamp: 'Current session' })),
    ]
    if (workflow.instagramAssets.length || workflow.linkedInAssets.length) history.push({ id: 'session-creative', event: 'Creative uploaded', actor: 'Reza Fadli Harris', timestamp: 'Current session', metadata: 'Browser-local creative assets' })
    if (['review', 'schedule'].includes(workflow.activeStep)) platforms.forEach((platform) => history.push({ id: `session-review-${platform}`, event: 'Brand alignment checked', platform, actor: 'Shifd Marketing', timestamp: 'Current session', metadata: `${workflow.reviewAssessments[platform].score} / 100 — ${workflow.reviewAssessments[platform].status}` }))
    Object.entries(workflow.reviewOverrides).forEach(([platform, justification]) => {
      if (justification) history.push({ id: `session-override-${platform}`, event: 'Override recorded', platform: platform as ContentPlatform, actor: 'Reza Fadli Harris', timestamp: 'Current session', metadata: justification })
    })
    if (workflow.isApproved) history.push(
      { id: 'session-human-review', event: 'Human review completed', actor: 'Reza Fadli Harris', timestamp: workflow.approvedAt ?? 'Current session' },
      { id: 'session-approved', event: 'Content approved', actor: 'Reza Fadli Harris', timestamp: workflow.approvedAt ?? 'Current session', metadata: 'Human approval' },
    )
    if (workflow.isScheduled) history.push({ id: 'session-scheduled', event: 'Content scheduled', actor: 'Reza Fadli Harris', timestamp: 'Current session', metadata: 'Publishing remains manual' })
    const status: ContentLifecycleStatus = workflow.isScheduled
      ? 'Scheduled'
      : workflow.isApproved ? 'Approved'
        : workflow.activeStep === 'generate' ? 'Generated'
        : workflow.activeStep === 'adapt' ? 'Adapted'
          : workflow.activeStep === 'creative' ? 'Creative In Progress'
            : workflow.activeStep === 'review' ? 'Ready for Review'
              : 'Draft'
    upsert({
      id: workflow.contentId,
      ideaId: workflow.sourceIdeaId,
      companyId: companyContext.companyProfile.id,
      title: workflow.generatedContent.title,
      topic: workflow.brief.topic,
      context: workflow.brief.context,
      productId: workflow.brief.context === 'product' ? workflow.brief.product : undefined,
      pillar,
      platforms,
      status,
      scheduleDate: workflow.isScheduled ? schedules[0]?.date : undefined,
      scheduleTime: workflow.isScheduled ? schedules[0]?.time : undefined,
      updatedAt: 'Just now',
      workflowStep: workflow.isApproved ? 'schedule' : workflow.activeStep,
      lifecycle: {
        status,
        workflowStep: workflow.isApproved ? 'schedule' : workflow.activeStep,
        schedules: workflow.isScheduled ? Object.fromEntries(platforms.map((platform) => [platform, { ...workflow.scheduledRecords[platform] }])) : {},
        publications: existingRecord ? { ...contentLifecycle(existingRecord).publications } : {},
      },
      details: {
        angle: workflow.brief.thesis,
        objective,
        audience: workflow.brief.audience,
        instructions: workflow.brief.constraints,
        createdBy: 'Reza Fadli Harris',
        createdAt: 'Current session',
        masterContent: { ...workflow.generatedContent },
        visualDirection: { ...workflow.visualDirection, structure: [...workflow.visualDirection.structure] },
        instagram: workflow.enabledPlatforms.instagram ? { ...workflow.instagramContent } : undefined,
        linkedin: workflow.enabledPlatforms.linkedin ? { ...workflow.linkedInContent } : undefined,
        creative: {
          instagram: workflow.instagramAssets.map((asset, index) => ({ id: asset.id, name: asset.name, type: asset.name.toLowerCase().endsWith('.png') ? 'PNG' : 'JPG', order: index + 1, url: preserveAssetPreview(asset.id, asset.file, asset.url) })),
          linkedin: workflow.linkedInAssets.map((asset, index) => ({ id: asset.id, name: asset.name, type: asset.name.toLowerCase().endsWith('.png') ? 'PNG' : 'JPG', order: index + 1, url: preserveAssetPreview(asset.id, asset.file, asset.url) })),
          linkedinReusesInstagram: workflow.reuseInstagramCreative,
        },
        brandAssessments: Object.fromEntries(platforms.map((platform) => [platform, cloneValue(workflow.reviewAssessments[platform])])),
        approval: workflow.isApproved ? { approvedBy: 'Reza Fadli Harris', approvedAt: workflow.approvedAt ?? 'Current session', overrides: { ...workflow.reviewOverrides } } : undefined,
        schedules: workflow.isScheduled ? Object.fromEntries(platforms.map((platform) => [platform, { ...workflow.scheduledRecords[platform] }])) : {},
        publications: existingRecord ? { ...contentLifecycle(existingRecord).publications } : {},
        history,
      },
    })
    if (workflow.sourceIdeaId) useContentIdeasStore().linkContent(workflow.sourceIdeaId, workflow.contentId)
  }

  // Kept as a compatibility alias for aggregation views while all writes use
  // the complete canonical upsert implementation above.
  function syncScheduledWorkflow(workflow: ContentWorkflowStore) {
    upsertFromWorkflow(workflow)
  }

  function markPublished(contentId: string, platform: ContentPlatform, publication: PublicationInput) {
    const record = records.value.find((item) => item.id === contentId)
    const lifecycle = record ? contentLifecycle(record) : undefined
    if (!record || !lifecycle?.schedules[platform]) return false
    const schedule = lifecycle.schedules[platform]
    // A platform publication has one stable identity. Repeated confirmations
    // update this record rather than adding another countable publication.
    const publicationId = `${contentId}:${platform}`
    const nextPublication: PublicationRecord = {
      id: publicationId,
      contentId,
      platformVariantId: publicationId,
      platform,
      scheduledAt: `${schedule.date}T${schedule.time}:00`,
      publishedAt: publication.publishedAt,
      postUrl: publication.postUrl?.trim() || undefined,
      markedBy: 'Reza Fadli Harris',
    }
    const existingPublication = publicationRecords.value.findIndex((item) => item.id === publicationId)
    if (existingPublication >= 0) publicationRecords.value[existingPublication] = nextPublication
    else publicationRecords.value.push(nextPublication)
    const nextPublications = {
      ...lifecycle.publications,
      [platform]: {
      publishedAt: nextPublication.publishedAt,
      postUrl: nextPublication.postUrl,
      status: 'Published',
      },
    }
    const historyId = `published-${contentId}-${platform}`
    const history = record.details.history.find((item) => item.id === historyId)
    const publicationTimestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(publication.publishedAt))
    if (history) history.timestamp = publicationTimestamp
    else record.details.history.push({ id: historyId, event: 'Content published', platform, actor: 'Reza Fadli Harris', timestamp: publicationTimestamp, metadata: 'Publication recorded manually' })
    const allPlatformsPublished = record.platforms.every((item) => Boolean(nextPublications[item]))
    setContentLifecycle(record, {
      ...lifecycle,
      publications: nextPublications,
      status: allPlatformsPublished ? 'Published' : 'Scheduled',
    })
    record.updatedAt = 'Just now'
    return true
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

  return { records, publicationRecords, upsert, duplicate, archive, upsertFromWorkflow, syncScheduledWorkflow, markPublished, getPublicationRecord, getPublishedPublicationRecords }
})

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
