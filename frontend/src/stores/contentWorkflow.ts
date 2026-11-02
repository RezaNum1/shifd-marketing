import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import * as assetApi from '../api/assets'
import * as contentApi from '../api/content'
import * as schedulingApi from '../api/scheduling'
import { errorMessage, isApiError } from '../api/client'
import { beginCommand, clearCommandKeys, completeCommand, discardCommand } from '../api/idempotency'
import type { BackendApprovalAction, BackendContent, BackendPlatform } from '../types/backend'
import type { ContentIdea } from '../types/contentIdea'
import type { BrandAssessment, BrandCheckFailure, BrandCheckFailureOverride, ContentBrief, ContentAssetRecord, ContentLibraryRecord, ContentSchedule, ContentLifecycleStatus, CreativeAsset, InstagramVariant, LinkedInVariant, MasterContent, VisualDirection, WorkflowStep } from '../types/content'
import { releaseWorkflowAssets, retainWorkflowAsset } from '../utils/creativeAssetRegistry'
import { contentSchedules, contentStatus } from '../utils/contentRecords'

type PlatformKey = BackendPlatform
type DesignStatus = 'not-started' | 'in-progress' | 'ready'
type VariantCopyDraft = { copy: string; cta: string; hashtags: string; visualRecommendation: string }
type FailureObserver = (reason: unknown, message: string) => void

function brandCheckFailure(reason: unknown, message: string): BrandCheckFailure {
  if (!isApiError(reason)) {
    return { code: 'BRAND_CHECK_FAILED', message, requestId: null, aiRequestId: null, missingInputs: [], canOverride: false }
  }
  const aiRequestId = reason.fields.aiRequestId?.trim() || null
  return {
    code: reason.code,
    message,
    requestId: reason.requestId,
    aiRequestId,
    missingInputs: reason.fields.missing?.split(',').map((item) => item.trim()).filter(Boolean) ?? [],
    canOverride: Boolean(aiRequestId && reason.fields.canOverride === 'true'),
  }
}

const blankBrief = (): ContentBrief => ({ context: 'company', product: '', pillar: 'educational', objective: 'awareness', audience: '', topic: '', thesis: '', constraints: '' })
const blankMaster = (): MasterContent => ({ id: 'master', label: 'Master Content', title: '', coreMessage: '', hook: '', body: '', cta: '' })
const blankVisualDirection = (): VisualDirection => ({ format: '', concept: '', structure: [], notes: '' })
const blankInstagram = (): InstagramVariant => ({ caption: '', cta: '', hashtags: '', visualRecommendation: '' })
const blankLinkedIn = (): LinkedInVariant => ({ postCopy: '', cta: '', hashtags: '', visualRecommendation: '' })
const blankAssessment = (): BrandAssessment => ({ score: 0, status: 'Needs Attention', recommendation: 'Run a backend brand check after the platform copy and creative are ready.', checks: [], state: 'needs-recheck' })
const blankSchedule = (): ContentSchedule => ({ date: '', time: '', status: 'Scheduled' })
const WORKFLOW_RESUME_KEY = 'shifd.contentWorkflow.resume'

function persistWorkflowResume(contentId: string, step: WorkflowStep) {
  if (typeof localStorage === 'undefined') return
  try {
    if (contentId) localStorage.setItem(WORKFLOW_RESUME_KEY, JSON.stringify({ contentId, step }))
    else localStorage.removeItem(WORKFLOW_RESUME_KEY)
  } catch {
    // The backend remains the source of truth if browser storage is unavailable.
  }
}

export function readWorkflowResume() {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(WORKFLOW_RESUME_KEY) ?? 'null') as { contentId?: unknown; step?: unknown } | null
    if (typeof value?.contentId !== 'string' || !value.contentId) return null
    const steps: WorkflowStep[] = ['brief', 'generate', 'adapt', 'creative', 'review', 'schedule']
    return { contentId: value.contentId, step: steps.includes(value.step as WorkflowStep) ? value.step as WorkflowStep : null }
  } catch {
    return null
  }
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

export function resumeDestinationForStatus(status: ContentLifecycleStatus): WorkflowStep | 'detail' {
  return workflowStepForStatus(status) ?? 'detail'
}

function backendDesignStatus(value: DesignStatus) { return value.replace('-', '_') as 'not_started' | 'in_progress' | 'ready' }
function uiDesignStatus(value: BackendContent['designStatus']): DesignStatus { return value === 'not_started' ? 'not-started' : value === 'in_progress' ? 'in-progress' : 'ready' }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

export const useContentWorkflowStore = defineStore('contentWorkflow', () => {
  const contentId = ref('')
  const sourceIdeaId = ref<string>()
  const canonical = ref<BackendContent | null>(null)
  const etag = ref<string | null>(null)
  const activeStep = ref<WorkflowStep>('brief')
  const brief = reactive<ContentBrief>(blankBrief())
  const generatedVariantIndex = ref(0)
  const generatedContent = reactive<MasterContent>(blankMaster())
  const visualDirection = reactive<VisualDirection>(blankVisualDirection())
  const enabledPlatforms = reactive({ instagram: true, linkedin: true })
  const instagramVariantIndex = ref(0)
  const linkedInVariantIndex = ref(0)
  const instagramContent = reactive<InstagramVariant>(blankInstagram())
  const linkedInContent = reactive<LinkedInVariant>(blankLinkedIn())
  const designStatus = ref<DesignStatus>('not-started')
  const reuseInstagramCreative = ref(true)
  const instagramAssets = ref<CreativeAsset[]>([])
  const linkedInAssets = ref<CreativeAsset[]>([])
  const isApproved = ref(false)
  const approvedBy = ref<string | null>(null)
  const approvedAt = ref<string | null>(null)
  const reviewChecklist = reactive({ copyReviewed: false, creativeReviewed: false, visualCopyConsistent: false, noErrors: false, readyForPublication: false })
  const reviewEditing = reactive({ instagram: false, linkedin: false })
  const reviewAssessments = reactive({ instagram: blankAssessment(), linkedin: blankAssessment() })
  const reviewOverrides = reactive({ instagram: '', linkedin: '' })
  const reviewCheckErrors = reactive<Record<PlatformKey, BrandCheckFailure | null>>({ instagram: null, linkedin: null })
  const reviewFailureOverrides = reactive<Record<PlatformKey, BrandCheckFailureOverride | null>>({ instagram: null, linkedin: null })
  const isScheduled = ref(false)
  const useSameSchedule = ref(true)
  const instagramSchedule = reactive({ date: '', time: '' })
  const linkedInSchedule = reactive({ date: '', time: '' })
  const scheduledRecords = reactive({ instagram: blankSchedule(), linkedin: blankSchedule() })
  const loading = ref(false)
  const error = ref('')
  const loaded = computed(() => Boolean(canonical.value))

  watch([contentId, activeStep], ([id, step]) => persistWorkflowResume(id, step), { flush: 'sync' })

  function applyCanonical(value: BackendContent, responseEtag?: string | null, preserveStep = false) {
    const preserveReviewEvidence = canonical.value?.id === value.id && canonical.value.editorialRevision === value.editorialRevision
    canonical.value = value
    contentId.value = value.id
    sourceIdeaId.value = value.sourceIdeaId ?? undefined
    etag.value = responseEtag ?? `"${value.version}"`
    const nextBrief = value.brief
    Object.assign(brief, { context: nextBrief.contextType, product: nextBrief.productId ?? '', pillar: nextBrief.pillarCode, objective: nextBrief.objective, audience: nextBrief.targetAudience, topic: nextBrief.topic, thesis: nextBrief.angle ?? '', constraints: nextBrief.additionalInstructions ?? '' })
    Object.assign(generatedContent, value.master ? { id: 'master', label: 'Master Content', ...value.master } : blankMaster())
    Object.assign(visualDirection, value.visualDirection ? clone(value.visualDirection) : blankVisualDirection())
    Object.assign(instagramContent, value.variants.find((item) => item.platform === 'instagram') ? variantValue(value.variants.find((item) => item.platform === 'instagram')!, 'instagram') : blankInstagram())
    Object.assign(linkedInContent, value.variants.find((item) => item.platform === 'linkedin') ? variantValue(value.variants.find((item) => item.platform === 'linkedin')!, 'linkedin') : blankLinkedIn())
    enabledPlatforms.instagram = Boolean(value.variants.find((item) => item.platform === 'instagram')?.enabled)
    enabledPlatforms.linkedin = Boolean(value.variants.find((item) => item.platform === 'linkedin')?.enabled)
    designStatus.value = uiDesignStatus(value.designStatus)
    reuseInstagramCreative.value = Boolean(value.variants.find((item) => item.platform === 'linkedin')?.reuseCreativeFromVariantId)
    instagramAssets.value = assetsFromVariant(value.variants.find((item) => item.platform === 'instagram'))
    linkedInAssets.value = assetsFromVariant(value.variants.find((item) => item.platform === 'linkedin'))
    ;[...instagramAssets.value, ...linkedInAssets.value].forEach((asset) => retainWorkflowAsset(asset.id, asset.url, value.id))
    Object.assign(reviewAssessments, {
      instagram: assessmentValue(value.variants.find((item) => item.platform === 'instagram')?.assessment ?? null),
      linkedin: assessmentValue(value.variants.find((item) => item.platform === 'linkedin')?.assessment ?? null),
    })
    isApproved.value = value.lifecycleStatus === 'Approved' || value.lifecycleStatus === 'Scheduled' || value.lifecycleStatus === 'Published' || value.approval?.action === 'approve'
    approvedBy.value = value.approval?.action === 'approve' ? value.approval.actor.name : null
    approvedAt.value = value.approval?.action === 'approve' ? value.approval.createdAt : null
    if (isApproved.value) Object.assign(reviewChecklist, { copyReviewed: true, creativeReviewed: true, visualCopyConsistent: true, noErrors: true, readyForPublication: true })
    const approvedOverrides = overridesFromApproval(value.approval, value)
    if (value.approval?.action === 'approve') {
      Object.assign(reviewOverrides, approvedOverrides)
      Object.assign(reviewFailureOverrides, failureOverridesFromApproval(value.approval, value))
    } else if (!preserveReviewEvidence) {
      Object.assign(reviewOverrides, { instagram: '', linkedin: '' })
      Object.assign(reviewFailureOverrides, { instagram: null, linkedin: null })
      Object.assign(reviewCheckErrors, { instagram: null, linkedin: null })
    }
    const schedules = { instagram: value.variants.find((item) => item.platform === 'instagram')?.schedule, linkedin: value.variants.find((item) => item.platform === 'linkedin')?.schedule }
    setSchedule('instagram', schedules.instagram)
    setSchedule('linkedin', schedules.linkedin)
    isScheduled.value = value.schedules.some((schedule) => schedule.status !== 'cancelled') || ['Scheduled', 'Published'].includes(value.lifecycleStatus)
    if (!preserveStep) activeStep.value = value.resumeStep ?? (value.lifecycleStatus === 'Published' || value.lifecycleStatus === 'Archived' ? 'schedule' : 'brief')
  }

  function reset() {
    const previousContentId = contentId.value
    if (previousContentId) releaseWorkflowAssets(previousContentId)
    clearCommandKeys('content.', 'asset.upload', 'schedule.')
    contentId.value = ''
    sourceIdeaId.value = undefined
    canonical.value = null
    etag.value = null
    activeStep.value = 'brief'
    Object.assign(brief, blankBrief())
    Object.assign(generatedContent, blankMaster())
    Object.assign(visualDirection, blankVisualDirection())
    Object.assign(instagramContent, blankInstagram())
    Object.assign(linkedInContent, blankLinkedIn())
    enabledPlatforms.instagram = true
    enabledPlatforms.linkedin = true
    generatedVariantIndex.value = 0
    instagramVariantIndex.value = 0
    linkedInVariantIndex.value = 0
    designStatus.value = 'not-started'
    reuseInstagramCreative.value = true
    instagramAssets.value = []
    linkedInAssets.value = []
    isApproved.value = false
    approvedBy.value = null
    approvedAt.value = null
    Object.assign(reviewChecklist, { copyReviewed: false, creativeReviewed: false, visualCopyConsistent: false, noErrors: false, readyForPublication: false })
    Object.assign(reviewEditing, { instagram: false, linkedin: false })
    Object.assign(reviewAssessments, { instagram: blankAssessment(), linkedin: blankAssessment() })
    Object.assign(reviewOverrides, { instagram: '', linkedin: '' })
    Object.assign(reviewCheckErrors, { instagram: null, linkedin: null })
    Object.assign(reviewFailureOverrides, { instagram: null, linkedin: null })
    isScheduled.value = false
    useSameSchedule.value = true
    Object.assign(instagramSchedule, { date: '', time: '' })
    Object.assign(linkedInSchedule, { date: '', time: '' })
    Object.assign(scheduledRecords, { instagram: blankSchedule(), linkedin: blankSchedule() })
    error.value = ''
    persistWorkflowResume('', 'brief')
  }

  function startNewWorkflow() { reset() }

  function startFromIdea(idea: ContentIdea) {
    if (idea.status !== 'Ready') return
    startNewWorkflow()
    sourceIdeaId.value = idea.id
    Object.assign(brief, { context: idea.contextType, product: idea.productId ?? '', pillar: idea.pillar, objective: idea.objective, audience: idea.targetAudience ?? '', topic: idea.title, thesis: '', constraints: idea.notes ?? '' })
  }

  function hydrateRecord(record: ContentLibraryRecord) {
    reset()
    contentId.value = record.id
    sourceIdeaId.value = record.ideaId
    activeStep.value = workflowStepForStatus(contentStatus(record)) ?? 'schedule'
    Object.assign(brief, { context: record.context, product: record.productId ?? '', pillar: record.pillar, objective: record.details.objective, audience: record.details.audience, topic: record.topic, thesis: record.details.angle, constraints: record.details.instructions ?? '' })
    Object.assign(generatedContent, record.details.masterContent ?? blankMaster())
    Object.assign(visualDirection, record.details.visualDirection ?? blankVisualDirection())
    Object.assign(instagramContent, record.details.instagram ?? blankInstagram())
    Object.assign(linkedInContent, record.details.linkedin ?? blankLinkedIn())
    enabledPlatforms.instagram = record.platforms.includes('instagram')
    enabledPlatforms.linkedin = record.platforms.includes('linkedin')
    designStatus.value = record.details.creative.instagram.length || record.details.creative.linkedin.length ? 'in-progress' : 'not-started'
    reuseInstagramCreative.value = record.details.creative.linkedinReusesInstagram
    instagramAssets.value = record.details.creative.instagram.map(assetFromLegacy)
    linkedInAssets.value = record.details.creative.linkedin.map(assetFromLegacy)
    isApproved.value = Boolean(record.details.approval) || ['Approved', 'Scheduled'].includes(contentStatus(record))
    approvedBy.value = record.details.approval?.approvedBy ?? null
    approvedAt.value = record.details.approval?.approvedAt ?? null
    Object.assign(reviewChecklist, { copyReviewed: isApproved.value, creativeReviewed: isApproved.value, visualCopyConsistent: isApproved.value, noErrors: isApproved.value, readyForPublication: isApproved.value })
    Object.assign(reviewAssessments, { instagram: record.details.brandAssessments.instagram ?? blankAssessment(), linkedin: record.details.brandAssessments.linkedin ?? blankAssessment() })
    Object.assign(reviewOverrides, { instagram: record.details.approval?.overrides.instagram ?? '', linkedin: record.details.approval?.overrides.linkedin ?? '' })
    setLegacySchedule('instagram', contentSchedules(record).instagram)
    setLegacySchedule('linkedin', contentSchedules(record).linkedin)
    isScheduled.value = ['Scheduled', 'Published'].includes(contentStatus(record)) || Object.keys(contentSchedules(record)).length > 0
    return Boolean(workflowStepForStatus(contentStatus(record)) || ['Scheduled', 'Published'].includes(contentStatus(record)))
  }

  async function createFromBrief() {
    if (contentId.value && canonical.value) return canonical.value
    const input = { sourceIdeaId: sourceIdeaId.value, brief: { contextType: brief.context, productId: brief.context === 'product' ? brief.product : null, pillarCode: brief.pillar, objective: brief.objective, targetAudience: brief.audience.trim(), topic: brief.topic.trim(), angle: brief.thesis.trim() || null, additionalInstructions: brief.constraints.trim() || null }, enabledPlatforms: enabledPlatformCodes() }
    const command = beginCommand('content.create', JSON.stringify(input))
    return perform(async () => {
      const result = await contentApi.createContent(input, command.key)
      applyCanonical(result.data, result.etag, true)
      return result.data
    }, 'Unable to create the Content brief.', command.identity)
  }

  async function load(id: string, _force = false) {
    if (contentId.value && contentId.value !== id) reset()
    return perform(async () => {
      const result = await contentApi.getContent(id)
      applyCanonical(result.data, result.etag)
      // A current warning override is an approval prerequisite but is stored
      // in the review-action history rather than on the Content projection.
      // Rehydrate it when resuming a review so a reload cannot lose the
      // server-recorded justification from the local review form.
      try {
        const actions = await contentApi.listReviewActions(id)
        const restoredPlatforms = new Set<PlatformKey>()
        actions.data
          .filter((action) => action.action === 'override' && action.editorialRevision === result.data.editorialRevision && action.justification)
          .forEach((action) => {
            const variant = result.data.variants.find((candidate) => candidate.id === action.variantId)
            const platform = variant?.platform
            if (!variant || !platform || restoredPlatforms.has(platform)) return
            const assessmentIsCurrent = Boolean(action.assessmentId && variant.assessment?.id === action.assessmentId && variant.assessment.freshness === 'current' && variant.assessment.status === 'needs_attention')
            const failureWasOverridden = Boolean(action.failedAiRequestId && action.evidenceCurrent === true && !(variant.assessment && variant.assessment.freshness === 'current'))
            if (!assessmentIsCurrent && !failureWasOverridden) return
            restoredPlatforms.add(platform)
            reviewOverrides[platform] = action.justification ?? ''
            if (action.failedAiRequestId) {
              const errorCode = action.failedAiRequestErrorCode ?? 'BRAND_CHECK_FAILED'
              reviewFailureOverrides[platform] = { failedAiRequestId: action.failedAiRequestId, errorCode, justification: action.justification ?? '' }
              reviewCheckErrors[platform] = {
                code: errorCode,
                message: 'The AI Brand Consistency Check failed. A human override was recorded for this attempt.',
                requestId: null,
                aiRequestId: action.failedAiRequestId,
                missingInputs: [],
                canOverride: true,
              }
            }
          })
      } catch {
        // Review history is secondary to the canonical Content read.
      }
      return result.data
    }, 'Unable to load this Content.')
  }

  async function saveEditorial() {
    return requireCanonical(async () => {
      const result = await contentApi.updateContent(contentId.value, editorialInput(), currentEtag())
      applyCanonical(result.data, result.etag, true)
      return result.data
    }, 'Unable to save editorial changes.')
  }

  async function generate() {
    const version = currentEtag()
    const command = beginCommand(`content.generate:${contentId.value}`, version)
    return requireCanonical(async () => {
      const result = await contentApi.generateContent(contentId.value, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      return result.data.content
    }, 'Unable to generate Content.', command.identity)
  }

  async function adapt(platform: PlatformKey) {
    const version = currentEtag()
    const command = beginCommand(`content.adapt:${contentId.value}:${platform}`, version)
    return requireCanonical(async () => {
      const result = await contentApi.adaptContent(contentId.value, platform, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      return result.data.content
    }, `Unable to adapt ${platform === 'instagram' ? 'Instagram' : 'LinkedIn'}.`, command.identity)
  }

  async function saveVariant(platform: PlatformKey, draft?: VariantCopyDraft) {
    return requireCanonical(async () => {
      const input = draft ?? (platform === 'instagram'
        ? { copy: instagramContent.caption, cta: instagramContent.cta, hashtags: instagramContent.hashtags, visualRecommendation: instagramContent.visualRecommendation }
        : { copy: linkedInContent.postCopy, cta: linkedInContent.cta, hashtags: linkedInContent.hashtags, visualRecommendation: linkedInContent.visualRecommendation })
      const result = await contentApi.updateVariant(contentId.value, platform, input, currentEtag())
      applyCanonical(result.data, result.etag, true)
      return result.data
    }, 'Unable to save platform copy.')
  }

  async function progress(stage: 'adapted' | 'creative_in_progress' | 'ready_for_review') {
    return requireCanonical(async () => {
      const result = await contentApi.progressContent(contentId.value, stage, currentEtag())
      applyCanonical(result.data, result.etag, true)
      return result.data
    }, 'Unable to update Content progress.')
  }

  async function uploadCreative(file: File) {
    const command = beginCommand('asset.upload', `${contentId.value}|${file.name}|${file.size}|${file.lastModified}`)
    try {
      const result = await assetApi.uploadAsset(file, 'creative', command.key)
      completeCommand(command.identity)
      const value = { id: result.data.id, name: result.data.fileName, url: result.data.contentUrl, mimeType: result.data.mimeType, file }
      retainWorkflowAsset(value.id, value.url, contentId.value)
      return value
    } catch (reason: unknown) {
      if (isApiError(reason) && reason.status >= 400 && reason.status < 500) discardCommand(command.identity)
      error.value = errorMessage(reason, 'Unable to upload the creative asset.')
      return undefined
    }
  }

  async function attachCreative(platform: PlatformKey, assets: CreativeAsset[]) {
    return requireCanonical(async () => {
      const selectedDesignStatus = designStatus.value
      const selectedReuse = reuseInstagramCreative.value
      const result = await assetApi.attachAssets(contentId.value, platform, assets.map((asset) => asset.id), currentEtag())
      applyCanonical(result.data, result.etag, true)
      designStatus.value = selectedDesignStatus
      reuseInstagramCreative.value = selectedReuse
      return result.data
    }, 'Unable to attach the creative assets.')
  }

  async function setReuseCreative(value: boolean) {
    return requireCanonical(async () => {
      const selectedDesignStatus = designStatus.value
      const result = await assetApi.setCreativeReuse(contentId.value, value, currentEtag())
      applyCanonical(result.data, result.etag, true)
      designStatus.value = selectedDesignStatus
      reuseInstagramCreative.value = value
      return result.data
    }, 'Unable to update the LinkedIn creative reuse setting.')
  }

  function clearBrandCheckEvidence(platform: PlatformKey) {
    reviewCheckErrors[platform] = null
    reviewFailureOverrides[platform] = null
    reviewOverrides[platform] = ''
  }

  function setBrandCheckPreparationError(platform: PlatformKey, message: string) {
    reviewCheckErrors[platform] = {
      code: 'CONTENT_SAVE_FAILED',
      message,
      requestId: null,
      aiRequestId: null,
      missingInputs: [],
      canOverride: false,
    }
  }

  async function brandCheck(platform: PlatformKey) {
    clearBrandCheckEvidence(platform)
    const version = currentEtag()
    const command = beginCommand(`content.brand-check:${contentId.value}:${platform}`, version)
    return requireCanonical(async () => {
      const result = await contentApi.brandCheckContent(contentId.value, platform, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      return result.data.content
    }, `Unable to check ${platform === 'instagram' ? 'Instagram' : 'LinkedIn'} alignment.`, command.identity, (reason, message) => {
      reviewCheckErrors[platform] = brandCheckFailure(reason, message)
    })
  }

  async function override(platform: PlatformKey, justification: string) {
    const variant = canonical.value?.variants.find((item) => item.platform === platform)
    const assessmentId = variant?.assessment?.freshness === 'current' && variant.assessment.status === 'needs_attention'
      ? variant.assessment.id
      : null
    const failedAiRequestId = !assessmentId && reviewCheckErrors[platform]?.canOverride
      ? reviewCheckErrors[platform]?.aiRequestId
      : null
    if (!assessmentId && !failedAiRequestId) {
      error.value = 'Run Brand Consistency Check first, or choose Override on a current Needs Attention result or failed AI attempt.'
      return undefined
    }
    const normalizedJustification = justification.trim()
    const version = currentEtag()
    const evidenceId = assessmentId ?? failedAiRequestId!
    const command = beginCommand(`content.override:${contentId.value}:${platform}`, `${evidenceId}|${normalizedJustification}|${version}`)
    return requireCanonical(async () => {
      const input = assessmentId
        ? { platform, assessmentId, justification: normalizedJustification }
        : { platform, failedAiRequestId: failedAiRequestId!, justification: normalizedJustification }
      const result = await contentApi.recordOverride(contentId.value, input, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      reviewOverrides[platform] = result.data.action.justification ?? normalizedJustification
      if (result.data.action.failedAiRequestId) {
        reviewFailureOverrides[platform] = {
          failedAiRequestId: result.data.action.failedAiRequestId,
          errorCode: result.data.action.failedAiRequestErrorCode ?? reviewCheckErrors[platform]?.code ?? 'BRAND_CHECK_FAILED',
          justification: result.data.action.justification ?? normalizedJustification,
        }
      }
      return result.data.content
    }, 'Unable to record the override.', command.identity)
  }

  async function approve() {
    const checklist: NonNullable<BackendApprovalAction['checklist']> = { ...reviewChecklist }
    const version = currentEtag()
    const command = beginCommand(`content.approve:${contentId.value}`, `${JSON.stringify(checklist)}|${version}`)
    return requireCanonical(async () => {
      const result = await contentApi.approveContent(contentId.value, checklist, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      return result.data.content
    }, 'Unable to approve Content.', command.identity)
  }

  async function requestRevision(reason: string) {
    const version = currentEtag()
    const command = beginCommand(`content.request-revision:${contentId.value}`, `${reason.trim()}|${version}`)
    return requireCanonical(async () => {
      const result = await contentApi.requestRevision(contentId.value, reason, version, command.key)
      applyCanonical(result.data.content, result.etag, true)
      activeStep.value = 'review'
      return result.data.content
    }, 'Unable to request a revision.', command.identity)
  }

  async function schedule() {
    const rows = enabledPlatformCodes().map((platform) => ({ platform, scheduledAt: scheduleTimestamp(platform === 'instagram' ? instagramSchedule : linkedInSchedule), timezone: 'Asia/Jakarta' }))
    const version = currentEtag()
    const command = beginCommand(`schedule.create:${contentId.value}`, `${JSON.stringify(rows)}|${version}`)
    return requireCanonical(async () => {
      const result = await schedulingApi.createSchedules(contentId.value, rows, version, command.key)
      applyCanonical(result.data, result.etag, true)
      return result.data
    }, 'Unable to schedule Content.', command.identity)
  }

  function currentEtag() { return etag.value ?? (canonical.value ? `"${canonical.value.version}"` : '') }
  function enabledPlatformCodes(): BackendPlatform[] { return [enabledPlatforms.instagram ? 'instagram' : null, enabledPlatforms.linkedin ? 'linkedin' : null].filter((value): value is BackendPlatform => Boolean(value)) }
  function masterInput() { return { title: generatedContent.title.trim(), coreMessage: generatedContent.coreMessage.trim(), hook: generatedContent.hook.trim(), body: generatedContent.body.trim(), cta: generatedContent.cta.trim() } }
  function visualInput() { return { format: visualDirection.format.trim(), concept: visualDirection.concept.trim(), structure: visualDirection.structure.map((item) => item.trim()).filter(Boolean), notes: visualDirection.notes.trim() } }
  function editorialInput() {
    const input: Record<string, unknown> = {
      brief: { contextType: brief.context, productId: brief.context === 'product' ? brief.product : null, pillarCode: brief.pillar, objective: brief.objective, targetAudience: brief.audience.trim(), topic: brief.topic.trim(), angle: brief.thesis.trim() || null, additionalInstructions: brief.constraints.trim() || null },
      enabledPlatforms: enabledPlatformCodes(),
      designStatus: backendDesignStatus(designStatus.value),
    }
    const master = masterInput()
    if (Object.values(master).some(Boolean)) input.master = master
    const visual = visualInput()
    if (visual.format || visual.concept || visual.structure.length || visual.notes) input.visualDirection = visual
    return input
  }
  function scheduleTimestamp(value: { date: string; time: string }) {
    return `${value.date}T${value.time}:00+07:00`
  }

  async function perform<T>(call: () => Promise<T>, fallback: string, commandIdentity?: string, onFailure?: FailureObserver): Promise<T | undefined> {
    loading.value = true
    error.value = ''
    try {
      const value = await call()
      if (commandIdentity) completeCommand(commandIdentity)
      return value
    } catch (reason: unknown) {
      const shouldRefreshCanonical = isApiError(reason) && (reason.status === 412 || reason.code === 'INPUT_CHANGED') && contentId.value
      if (shouldRefreshCanonical) {
        if (commandIdentity) discardCommand(commandIdentity)
        try {
          const latest = await contentApi.getContent(contentId.value)
          applyCanonical(latest.data, latest.etag, true)
          error.value = reason.code === 'INPUT_CHANGED'
            ? 'The saved AI inputs changed while the request was running. The latest content was refreshed; review it before retrying.'
            : 'This Content changed elsewhere. The latest version was refreshed; review your edits before retrying.'
          onFailure?.(reason, error.value)
          return undefined
        } catch {
          // Keep the original concurrency error if the refresh is unavailable.
        }
      }
      const requiresNewCommandKey = isApiError(reason) && [
        'INPUT_CHANGED',
        'REVIEW_LOCKED',
        'REVISION_CONFLICT',
        'RATE_LIMITED',
        'AI_TIMEOUT',
        'AI_PROVIDER_ERROR',
        'AI_OUTPUT_INVALID',
        'AI_NOT_CONFIGURED',
        'AI_INTERRUPTED',
        'IDEMPOTENCY_CONFLICT',
      ].includes(reason.code)
      if (commandIdentity && requiresNewCommandKey) discardCommand(commandIdentity)
      error.value = errorMessage(reason, fallback)
      onFailure?.(reason, error.value)
      return undefined
    } finally { loading.value = false }
  }
  async function requireCanonical<T>(call: () => Promise<T>, fallback: string, commandIdentity?: string, onFailure?: FailureObserver) {
    if (!canonical.value || !contentId.value) {
      error.value = 'Create the Content brief before continuing.'
      onFailure?.(null, error.value)
      return undefined
    }
    return perform(call, fallback, commandIdentity, onFailure)
  }

  function setSchedule(platform: PlatformKey, value: BackendContent['variants'][number]['schedule'] | null | undefined) {
    if (!value || value.status === 'cancelled') { setLegacySchedule(platform, undefined); return }
    const parts = dateTimeParts(value.scheduledAt, value.timezone)
    const schedule = { date: parts.date, time: parts.time }
    if (platform === 'instagram') Object.assign(instagramSchedule, schedule)
    else Object.assign(linkedInSchedule, schedule)
    Object.assign(scheduledRecords[platform], { ...schedule, status: 'Scheduled' })
  }
  function setLegacySchedule(platform: PlatformKey, value: ContentSchedule | undefined) {
    if (platform === 'instagram') Object.assign(instagramSchedule, value ?? { date: '', time: '' })
    else Object.assign(linkedInSchedule, value ?? { date: '', time: '' })
    Object.assign(scheduledRecords[platform], value ?? blankSchedule())
  }

  return { contentId, sourceIdeaId, canonical, etag, activeStep, brief, generatedVariantIndex, generatedContent, visualDirection, enabledPlatforms, instagramVariantIndex, linkedInVariantIndex, instagramContent, linkedInContent, designStatus, reuseInstagramCreative, instagramAssets, linkedInAssets, isApproved, approvedBy, approvedAt, reviewChecklist, reviewEditing, reviewAssessments, reviewOverrides, reviewCheckErrors, reviewFailureOverrides, isScheduled, useSameSchedule, instagramSchedule, linkedInSchedule, scheduledRecords, loading, error, loaded, startFromIdea, startNewWorkflow, reset, hydrateRecord, resumeContent: hydrateRecord, createFromBrief, load, saveEditorial, generate, adapt, saveVariant, progress, uploadCreative, attachCreative, setReuseCreative, clearBrandCheckEvidence, setBrandCheckPreparationError, brandCheck, override, approve, requestRevision, schedule }
})

function variantValue(value: BackendContent['variants'][number], platform: PlatformKey) {
  return platform === 'instagram'
    ? { caption: value.copy ?? '', cta: value.cta ?? '', hashtags: value.hashtags ?? '', visualRecommendation: value.visualRecommendation ?? '' }
    : { postCopy: value.copy ?? '', cta: value.cta ?? '', hashtags: value.hashtags ?? '', visualRecommendation: value.visualRecommendation ?? '' }
}

function assetsFromVariant(value: BackendContent['variants'][number] | undefined): CreativeAsset[] {
  return value?.ownAssets.map((link) => ({ id: link.asset.id, name: link.asset.fileName, url: link.asset.contentUrl, mimeType: link.asset.mimeType })) ?? []
}

function assetFromLegacy(value: ContentAssetRecord): CreativeAsset { return { id: value.id, name: value.name, url: value.url ?? '' } }

function assessmentValue(value: BackendContent['variants'][number]['assessment']): BrandAssessment {
  if (!value) return blankAssessment()
  return { score: value.score, status: value.status === 'aligned' ? 'Aligned' : 'Needs Attention', recommendation: value.recommendation, checks: value.checks.map((check) => ({ label: check.label, status: check.status })), state: value.freshness === 'current' ? 'assessed' : 'needs-recheck' }
}

function overridesFromApproval(approval: BackendApprovalAction | null, content: BackendContent) {
  const result = { instagram: '', linkedin: '' }
  if (!approval || approval.action !== 'approve' || !Array.isArray(approval.reviewedVariants)) return result
  const reviewed = approval.reviewedVariants as Array<{ variantId?: unknown; overrideId?: unknown }>
  reviewed.forEach((item) => {
    const variant = content.variants.find((candidate) => candidate.id === item.variantId)
    // Approval projections carry the override identity, while the action list
    // carries its justification. The UI keeps the field empty until the user
    // opens the current review action; server approval remains authoritative.
    if (variant && item.overrideId) result[variant.platform] = 'Recorded on the server'
  })
  return result
}

function failureOverridesFromApproval(approval: BackendApprovalAction | null, content: BackendContent) {
  const result: Record<PlatformKey, BrandCheckFailureOverride | null> = { instagram: null, linkedin: null }
  if (!approval || approval.action !== 'approve' || !Array.isArray(approval.reviewedVariants)) return result
  const reviewed = approval.reviewedVariants as Array<{ variantId?: unknown; evidenceType?: unknown; failedAiRequestId?: unknown; failureCode?: unknown; overrideId?: unknown }>
  reviewed.forEach((item) => {
    if (item.evidenceType !== 'failed_brand_check' || typeof item.failedAiRequestId !== 'string' || typeof item.failureCode !== 'string' || typeof item.overrideId !== 'string') return
    const variant = content.variants.find((candidate) => candidate.id === item.variantId)
    if (variant) result[variant.platform] = { failedAiRequestId: item.failedAiRequestId, errorCode: item.failureCode, justification: 'Recorded on the server' }
  })
  return result
}

function dateTimeParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
