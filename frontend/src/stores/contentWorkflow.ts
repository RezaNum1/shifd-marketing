import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { ContentIdea } from '../types/contentIdea'
import {
  brandAssessmentMocks,
  contentBriefDefaults,
  generatedContentVariants,
  instagramAdaptationVariants,
  linkedInAdaptationVariants,
  objectiveOptions,
  pillarOptions,
  visualDirectionMock,
} from '../data/contentBrief'
import type {
  BrandAssessment,
  ContentBrief,
  ContentAssetRecord,
  ContentLibraryRecord,
  ContentSchedule,
  CreativeAsset,
  MasterContent,
  InstagramVariant,
  LinkedInVariant,
  VisualDirection,
  ContentLifecycleStatus,
  WorkflowStep,
} from '../types/content'
import { releaseWorkflowAssets, retainWorkflowAsset } from '../utils/creativeAssetRegistry'
import { contentSchedules, contentStatus } from '../utils/contentRecords'

type PlatformKey = 'instagram' | 'linkedin'

function cloneAssessment(platform: PlatformKey): BrandAssessment {
  const source = brandAssessmentMocks[platform]
  return {
    ...source,
    checks: source.checks.map((check) => ({ ...check })),
  }
}

function createSchedule(): ContentSchedule {
  return { date: '', time: '', status: 'Scheduled' }
}

function createDefaultScheduleDate() {
  return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function workflowStepForStatus(status: ContentLifecycleStatus): WorkflowStep | null {
  switch (status) {
    case 'Draft': return 'brief'
    case 'Generated': return 'generate'
    case 'Adapted': return 'adapt'
    case 'Creative In Progress': return 'creative'
    case 'Ready for Review':
    case 'Needs Revision': return 'review'
    case 'Approved':
    case 'Scheduled': return 'schedule'
    case 'Published':
    case 'Archived': return null
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneAssessmentValue(value: BrandAssessment): BrandAssessment {
  return { ...value, checks: value.checks.map((check) => ({ ...check })) }
}

function assetFromRecord(asset: ContentAssetRecord): CreativeAsset {
  const mime = asset.type === 'PNG' ? 'image/png' : 'image/jpeg'
  const file = new File([], asset.name, { type: mime })
  return { id: asset.id, name: asset.name, url: asset.url ?? '', file }
}

export const useContentWorkflowStore = defineStore('contentWorkflow', () => {
  const contentId = ref(`content-${crypto.randomUUID()}`)
  const sourceIdeaId = ref<string>()
  const activeStep = ref<WorkflowStep>('brief')
  const brief = reactive<ContentBrief>({ ...contentBriefDefaults })
  const generatedVariantIndex = ref(0)
  const generatedContent = reactive<MasterContent>({ ...generatedContentVariants[0] })
  const visualDirection = reactive<VisualDirection>({ ...visualDirectionMock, structure: [...visualDirectionMock.structure] })
  const enabledPlatforms = reactive({ instagram: true, linkedin: true })
  const instagramVariantIndex = ref(0)
  const linkedInVariantIndex = ref(0)
  const instagramContent = reactive<InstagramVariant>({ ...instagramAdaptationVariants[0] })
  const linkedInContent = reactive<LinkedInVariant>({ ...linkedInAdaptationVariants[0] })
  const designStatus = ref<'not-started' | 'in-progress' | 'ready'>('not-started')
  const reuseInstagramCreative = ref(true)
  const instagramAssets = ref<CreativeAsset[]>([])
  const linkedInAssets = ref<CreativeAsset[]>([])
  const isApproved = ref(false)
  const approvedAt = ref<string | null>(null)
  const reviewChecklist = reactive({
    copyReviewed: false,
    creativeReviewed: false,
    visualCopyConsistent: false,
    noErrors: false,
    readyForPublication: false,
  })
  const reviewEditing = reactive({ instagram: false, linkedin: false })
  const reviewAssessments = reactive({
    instagram: cloneAssessment('instagram'),
    linkedin: cloneAssessment('linkedin'),
  })
  const reviewOverrides = reactive({ instagram: '', linkedin: '' })
  const isScheduled = ref(false)
  const useSameSchedule = ref(true)
  const instagramSchedule = reactive({ date: createDefaultScheduleDate(), time: '10:00' })
  const linkedInSchedule = reactive({ date: createDefaultScheduleDate(), time: '10:00' })
  const scheduledRecords = reactive({
    instagram: createSchedule(),
    linkedin: createSchedule(),
  })

  function reset() {
    const previousContentId = contentId.value
    contentId.value = `content-${crypto.randomUUID()}`
    sourceIdeaId.value = undefined
    // Workflow ownership is transient. Saved content keeps its own registry
    // reference, so resetting a workflow cannot invalidate saved previews.
    releaseWorkflowAssets(previousContentId)
    Object.assign(brief, contentBriefDefaults)
    Object.assign(generatedContent, generatedContentVariants[0])
    Object.assign(visualDirection, { ...visualDirectionMock, structure: [...visualDirectionMock.structure] })
    Object.assign(instagramContent, instagramAdaptationVariants[0])
    Object.assign(linkedInContent, linkedInAdaptationVariants[0])
    activeStep.value = 'brief'
    generatedVariantIndex.value = 0
    instagramVariantIndex.value = 0
    linkedInVariantIndex.value = 0
    enabledPlatforms.instagram = true
    enabledPlatforms.linkedin = true
    designStatus.value = 'not-started'
    reuseInstagramCreative.value = true
    instagramAssets.value = []
    linkedInAssets.value = []
    isApproved.value = false
    approvedAt.value = null
    Object.assign(reviewChecklist, {
      copyReviewed: false,
      creativeReviewed: false,
      visualCopyConsistent: false,
      noErrors: false,
      readyForPublication: false,
    })
    reviewEditing.instagram = false
    reviewEditing.linkedin = false
    Object.assign(reviewAssessments, {
      instagram: cloneAssessment('instagram'),
      linkedin: cloneAssessment('linkedin'),
    })
    reviewOverrides.instagram = ''
    reviewOverrides.linkedin = ''
    isScheduled.value = false
    useSameSchedule.value = true
    const date = createDefaultScheduleDate()
    instagramSchedule.date = date
    instagramSchedule.time = '10:00'
    linkedInSchedule.date = date
    linkedInSchedule.time = '10:00'
    Object.assign(scheduledRecords.instagram, createSchedule())
    Object.assign(scheduledRecords.linkedin, createSchedule())
  }

  function startNewWorkflow() {
    reset()
    activeStep.value = 'brief'
  }

  function startFromIdea(idea: ContentIdea) {
    if (idea.status !== 'Ready') return
    startNewWorkflow()
    sourceIdeaId.value = idea.id
    Object.assign(brief, {
      context: idea.contextType, product: idea.productId ?? '', pillar: idea.pillar,
      objective: idea.objective, audience: idea.targetAudience ?? '',
      topic: idea.title, thesis: '', constraints: idea.notes ?? '',
    })
  }

  function resumeContent(record: ContentLibraryRecord): boolean {
    const status = contentStatus(record)
    const step = workflowStepForStatus(status)
    if (!step) return false

    // Clear the previous workflow before loading the selected canonical record.
    reset()
    contentId.value = record.id
    sourceIdeaId.value = record.ideaId
    activeStep.value = step

    const pillar = pillarOptions.find((option) => option.label === record.pillar || option.value === record.pillar)?.value ?? record.pillar
    const objective = objectiveOptions.find((option) => option.label === record.details.objective || option.value === record.details.objective)?.value ?? record.details.objective
    Object.assign(brief, {
      context: record.context,
      product: record.productId ?? '',
      pillar,
      objective,
      audience: record.details.audience ?? '',
      topic: record.topic,
      thesis: record.details.angle ?? '',
      constraints: record.details.instructions ?? '',
    })

    Object.assign(generatedContent, clone(record.details.masterContent ?? generatedContentVariants[0]))
    Object.assign(visualDirection, clone(record.details.visualDirection ?? visualDirectionMock))
    visualDirection.structure = [...(record.details.visualDirection?.structure ?? visualDirectionMock.structure)]
    Object.assign(instagramContent, clone(record.details.instagram ?? instagramAdaptationVariants[0]))
    Object.assign(linkedInContent, clone(record.details.linkedin ?? linkedInAdaptationVariants[0]))
    generatedVariantIndex.value = 0
    instagramVariantIndex.value = 0
    linkedInVariantIndex.value = 0

    enabledPlatforms.instagram = record.platforms.includes('instagram')
    enabledPlatforms.linkedin = record.platforms.includes('linkedin')
    designStatus.value = status === 'Creative In Progress' || record.details.creative.instagram.length || record.details.creative.linkedin.length ? 'in-progress' : 'not-started'
    reuseInstagramCreative.value = record.details.creative.linkedinReusesInstagram
    instagramAssets.value = [...record.details.creative.instagram].sort((a, b) => a.order - b.order).map(assetFromRecord)
    linkedInAssets.value = [...record.details.creative.linkedin].sort((a, b) => a.order - b.order).map(assetFromRecord)
    ;[...instagramAssets.value, ...linkedInAssets.value].forEach((asset) => retainWorkflowAsset(asset.id, asset.url, contentId.value))

    Object.assign(reviewAssessments, {
      instagram: cloneAssessmentValue(record.details.brandAssessments.instagram ?? brandAssessmentMocks.instagram),
      linkedin: cloneAssessmentValue(record.details.brandAssessments.linkedin ?? brandAssessmentMocks.linkedin),
    })
    Object.assign(reviewOverrides, {
      instagram: record.details.approval?.overrides.instagram ?? '',
      linkedin: record.details.approval?.overrides.linkedin ?? '',
    })
    const approved = Boolean(record.details.approval) || ['Approved', 'Scheduled'].includes(status)
    isApproved.value = approved
    approvedAt.value = record.details.approval?.approvedAt ?? null
    Object.assign(reviewChecklist, {
      copyReviewed: approved,
      creativeReviewed: approved,
      visualCopyConsistent: approved,
      noErrors: approved,
      readyForPublication: approved,
    })

    ;(['instagram', 'linkedin'] as PlatformKey[]).forEach((platform) => {
      const schedule = contentSchedules(record)[platform]
      if (schedule) {
        if (platform === 'instagram') Object.assign(instagramSchedule, schedule)
        else Object.assign(linkedInSchedule, schedule)
        Object.assign(scheduledRecords[platform], schedule)
      }
    })
    isScheduled.value = ['Scheduled', 'Published'].includes(status) || Object.keys(contentSchedules(record)).length > 0
    return true
  }

  return {
    contentId,
    sourceIdeaId,
    startFromIdea,
    startNewWorkflow,
    resumeContent,
    activeStep,
    brief,
    generatedVariantIndex,
    generatedContent,
    visualDirection,
    enabledPlatforms,
    instagramVariantIndex,
    linkedInVariantIndex,
    instagramContent,
    linkedInContent,
    designStatus,
    reuseInstagramCreative,
    instagramAssets,
    linkedInAssets,
    isApproved,
    approvedAt,
    reviewChecklist,
    reviewEditing,
    reviewAssessments,
    reviewOverrides,
    isScheduled,
    useSameSchedule,
    instagramSchedule,
    linkedInSchedule,
    scheduledRecords,
    reset,
  }
})
