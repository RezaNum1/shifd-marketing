import type { BackendApprovalAction, BackendAsset, BackendAssessment, BackendCompanyContext, BackendContent, BackendContentSummary, BackendIdea, BackendProduct, BackendResolvedContext, BackendSchedule, BackendVariant } from '../types/backend'
import type { AuthUser } from '../types/auth'
import type { BrandAssessment, ContentAssetRecord, ContentHistoryEvent, ContentLibraryRecord, ContentLifecycleStatus, ContentPlatform, ContentRecordDetails, ContentSchedule, CreativeAsset, InstagramVariant, LinkedInVariant, MasterContent, VisualDirection } from '../types/content'
import type { ContentIdea } from '../types/contentIdea'
import type { BrandProfile, BmcBlock, CompanyContextState, CompanyProfile } from '../types/companyContext'
import type { Product, ProductProfile, ProductStatus, ResolvedProductContext } from '../types/productContext'

const PILLAR_LABELS: Record<string, string> = {
  educational: 'Educational',
  problem: 'Problem / Pain Point',
  product: 'Product Insight',
  'use-case': 'Use Case',
  industry: 'Industry Insight',
  'thought-leadership': 'Thought Leadership',
  company: 'Company / Brand',
  // Compatibility for records created by the pre-integration fixtures.
  problem_pain_point: 'Problem / Pain Point',
  product_insight: 'Product Insight',
  use_case: 'Use Case',
  industry_insight: 'Industry Insight',
  thought_leadership: 'Thought Leadership',
  company_brand: 'Company / Brand',
}

export function authUser(user: { id: string; name: string; email: string; role: string }): AuthUser {
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
  return { ...user, initials: initials || user.email.slice(0, 2).toUpperCase() }
}

export function companyContext(value: BackendCompanyContext): CompanyContextState {
  const profile: CompanyProfile = {
    id: value.id,
    name: value.profile.name,
    description: value.profile.description,
    industry: value.profile.industry ?? '',
    businessTypes: value.profile.businessTypes as CompanyProfile['businessTypes'],
    primaryMarket: value.profile.primaryMarket ?? '',
    website: value.profile.website ?? '',
    mission: value.profile.mission ?? '',
    vision: value.profile.vision ?? '',
    positioning: value.profile.positioning ?? '',
    coreValueProposition: value.profile.coreValueProposition ?? '',
    differentiators: [...value.profile.differentiators],
    customerSegments: [...value.profile.customerSegments],
    decisionMakers: [...value.profile.decisionMakers],
    painPoints: [...value.profile.painPoints],
  }
  const brand: BrandProfile = {
    brandVoice: value.brand.brandVoice ?? '',
    toneDescription: value.brand.toneDescription ?? '',
    preferredLanguage: value.brand.preferredLanguage,
    communicationGuidelines: [...value.brand.communicationGuidelines],
    preferredTerms: [...value.brand.preferredTerms],
    thingsToAvoid: [...value.brand.thingsToAvoid],
    ctaStyle: value.brand.ctaStyle ?? '',
    brandKeywords: [...value.brand.brandKeywords],
  }
  const bmcBlocks: BmcBlock[] = value.bmcBlocks.map((block) => ({ id: block.id, type: block.type as BmcBlock['type'], title: block.title, entries: [...block.entries] }))
  return { companyProfile: profile, brandProfile: brand, bmcBlocks }
}

export function product(value: BackendProduct): { product: Product; profile: ProductProfile } {
  const item: Product = {
    id: value.id,
    companyId: value.companyId,
    name: value.name,
    slug: value.slug,
    description: value.description,
    category: value.category ?? '',
    status: titleStatus(value.status) as ProductStatus,
    url: value.url ?? undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    version: value.version,
  }
  const profile: ProductProfile = {
    productId: value.id,
    targetUsers: [...value.profile.targetUsers],
    targetOrganizations: [...value.profile.targetOrganizations],
    decisionMakers: [...value.profile.decisionMakers],
    problemsAddressed: [...value.profile.problemsAddressed],
    valueProposition: value.profile.valueProposition ?? '',
    features: [...value.profile.features],
    benefits: [...value.profile.benefits],
    differentiators: [...value.profile.differentiators],
    useCases: [...value.profile.useCases],
    campaignObjective: (value.profile.campaignObjective ?? 'awareness') as ProductProfile['campaignObjective'],
    positioning: value.profile.positioning ?? '',
    keyMessages: [...value.profile.keyMessages],
    proofPoints: [...value.profile.proofPoints],
    defaultCta: value.profile.defaultCta ?? '',
    inheritCompanyTone: value.profile.inheritCompanyTone,
    toneOverride: value.profile.toneOverride ?? '',
  }
  return { product: item, profile }
}

export function resolvedProductContext(value: BackendResolvedContext): ResolvedProductContext | undefined {
  if (!value.product) return undefined
  const mapped = product(value.product)
  return {
    company: companyContext(value.company),
    product: mapped.product,
    profile: mapped.profile,
    resolvedBrandVoice: value.resolvedBrand.brandVoice ?? '',
    resolvedCtaStyle: value.resolvedBrand.ctaStyle ?? '',
    resolvedLanguage: value.resolvedBrand.preferredLanguage,
  }
}

export function idea(value: BackendIdea): ContentIdea {
  return {
    id: value.id,
    title: value.title,
    contextType: value.contextType,
    productId: value.productId ?? undefined,
    pillar: value.pillarCode,
    objective: value.objective,
    targetAudience: value.targetAudience ?? undefined,
    notes: value.notes ?? undefined,
    status: titleIdeaStatus(value.status),
    relatedContentId: value.relatedContentIds[0],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    version: value.version,
  }
}

export function contentSummary(value: BackendContentSummary): ContentLibraryRecord {
  const platforms = [...value.enabledPlatforms]
  const status = value.lifecycleStatus as ContentLifecycleStatus
  const schedules = Object.fromEntries(value.scheduleSummary.filter((schedule) => schedule.status !== 'cancelled').map((schedule) => [schedule.platform, scheduleToLegacy(schedule)])) as ContentRecordDetails['schedules']
  const publications = Object.fromEntries(value.publications.map((publication) => [publication.platform, { publishedAt: publication.publishedAt, postUrl: publication.postUrl ?? undefined, status: 'Published' as const }])) as ContentRecordDetails['publications']
  return baseRecord({
    id: value.id,
    companyId: value.company.id,
    productId: value.product?.id,
    title: value.title,
    topic: value.brief.topic,
    context: value.product ? 'product' : 'company',
    pillar: pillarLabel(value.brief.pillarCode),
    platforms,
    status,
    updatedAt: value.updatedAt,
    version: value.version,
    workflowStep: resumeStep(value.resumeStep, status),
    schedules,
    publications,
  })
}

export function content(value: BackendContent): ContentLibraryRecord {
  const platforms = value.variants.filter((variant) => variant.enabled).map((variant) => variant.platform)
  const status = value.lifecycleStatus as ContentLifecycleStatus
  const schedules = Object.fromEntries(value.schedules.filter((schedule) => schedule.status !== 'cancelled').map((schedule) => [schedule.platform, scheduleToLegacy(schedule)])) as ContentRecordDetails['schedules']
  const publications = Object.fromEntries(value.publications.map((publication) => [publication.platform, { publishedAt: publication.publishedAt, postUrl: publication.postUrl ?? undefined, status: 'Published' as const }])) as ContentRecordDetails['publications']
  const creative = {
    instagram: assetsFor(value.variants.find((variant) => variant.platform === 'instagram')?.ownAssets.map((link) => link.asset) ?? []),
    linkedin: assetsFor(value.variants.find((variant) => variant.platform === 'linkedin')?.ownAssets.map((link) => link.asset) ?? []),
    linkedinReusesInstagram: Boolean(value.variants.find((variant) => variant.platform === 'linkedin')?.reuseCreativeFromVariantId),
  }
  const details: ContentRecordDetails = {
    angle: value.brief.angle ?? '',
    objective: value.brief.objective,
    audience: value.brief.targetAudience,
    instructions: value.brief.additionalInstructions ?? '',
    createdBy: value.createdBy.name,
    createdAt: value.createdAt,
    masterContent: value.master ? master(value.master) : undefined,
    visualDirection: value.visualDirection ? visual(value.visualDirection) : undefined,
    instagram: variantFor(value.variants.find((variant) => variant.platform === 'instagram'), 'instagram'),
    linkedin: variantFor(value.variants.find((variant) => variant.platform === 'linkedin'), 'linkedin'),
    creative,
    brandAssessments: Object.fromEntries(value.variants.filter((variant) => variant.enabled && variant.assessment).map((variant) => [variant.platform, assessment(variant.assessment!)])),
    approval: value.approval?.action === 'approve' ? {
      approvedBy: value.approval.actor.name,
      approvedAt: value.approval.createdAt,
      overrides: {},
    } : undefined,
    schedules,
    publications,
    history: [],
  }
  return baseRecord({
    id: value.id,
    ideaId: value.sourceIdeaId ?? undefined,
    companyId: value.companyId,
    productId: value.brief.productId ?? undefined,
    title: value.title,
    topic: value.brief.topic,
    context: value.brief.contextType,
    pillar: pillarLabel(value.brief.pillarCode),
    platforms,
    status,
    updatedAt: value.updatedAt,
    version: value.version,
    workflowStep: resumeStep(value.resumeStep, status),
    details,
  })
}

export function resumeStep(step: BackendContent['resumeStep'], status: ContentLifecycleStatus): ContentLibraryRecord['workflowStep'] | null {
  if (step) return step
  if (status === 'Published' || status === 'Archived') return null
  return statusToStep(status)
}

export function contentAsset(value: BackendAsset): ContentAssetRecord {
  return { id: value.id, name: value.fileName, type: value.mimeType === 'image/png' ? 'PNG' : 'JPG', order: 0, url: value.contentUrl }
}

export function creativeAsset(value: BackendAsset): CreativeAsset {
  return { id: value.id, name: value.fileName, url: value.contentUrl }
}

function baseRecord(value: { id: string; ideaId?: string; companyId: string; productId?: string; title: string; topic: string; context: 'company' | 'product'; pillar: string; platforms: ContentPlatform[]; status: ContentLifecycleStatus; updatedAt: string; version: number; workflowStep: ContentLibraryRecord['workflowStep']; schedules?: ContentRecordDetails['schedules']; publications?: ContentRecordDetails['publications']; details?: ContentRecordDetails }): ContentLibraryRecord {
  const schedules = value.schedules ?? {}
  const publications = value.publications ?? {}
  return {
    ideaId: value.ideaId,
    companyId: value.companyId,
    productId: value.productId,
    id: value.id,
    title: value.title,
    topic: value.topic,
    context: value.context,
    pillar: value.pillar,
    platforms: value.platforms,
    status: value.status,
    updatedAt: value.updatedAt,
    version: value.version,
    workflowStep: value.workflowStep,
    lifecycle: { status: value.status, workflowStep: value.workflowStep, schedules, publications },
    details: value.details ?? emptyDetails(schedules, publications),
  }
}

function emptyDetails(schedules: ContentRecordDetails['schedules'], publications: ContentRecordDetails['publications']): ContentRecordDetails {
  return { angle: '', objective: '', audience: '', createdBy: '', createdAt: '', creative: { instagram: [], linkedin: [], linkedinReusesInstagram: false }, brandAssessments: {}, schedules, publications, history: [] }
}

function master(value: NonNullable<BackendContent['master']>): MasterContent {
  return { id: 'master', label: 'Master Content', ...value }
}

function visual(value: NonNullable<BackendContent['visualDirection']>): VisualDirection {
  return { format: value.format, concept: value.concept, structure: [...value.structure], notes: value.notes }
}

function variantFor(value: BackendVariant | undefined, platform: 'instagram'): InstagramVariant | undefined
function variantFor(value: BackendVariant | undefined, platform: 'linkedin'): LinkedInVariant | undefined
function variantFor(value: BackendVariant | undefined, platform: ContentPlatform): InstagramVariant | LinkedInVariant | undefined {
  if (!value) return undefined
  return platform === 'instagram'
    ? { caption: value.copy ?? '', cta: value.cta ?? '', hashtags: value.hashtags ?? '', visualRecommendation: value.visualRecommendation ?? '' }
    : { postCopy: value.copy ?? '', cta: value.cta ?? '', hashtags: value.hashtags ?? '', visualRecommendation: value.visualRecommendation ?? '' }
}

function assessment(value: BackendAssessment): BrandAssessment {
  return { score: value.score, status: value.status === 'aligned' ? 'Aligned' : 'Needs Attention', recommendation: value.recommendation, checks: value.checks.map((check) => ({ label: check.label, status: check.status })), state: value.freshness === 'current' ? 'assessed' : 'needs-recheck' }
}

function assetsFor(values: BackendAsset[]): ContentAssetRecord[] {
  return values.map((asset, index) => ({ ...contentAsset(asset), order: index + 1 }))
}

function scheduleToLegacy(value: BackendSchedule): ContentSchedule {
  const parts = dateTimeParts(value.scheduledAt, value.timezone)
  return { date: parts.date, time: parts.time, status: 'Scheduled' }
}

function dateTimeParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function statusToStep(status: ContentLifecycleStatus): ContentLibraryRecord['workflowStep'] | null {
  if (status === 'Draft') return 'brief'
  if (status === 'Generated') return 'generate'
  if (status === 'Adapted') return 'adapt'
  if (status === 'Creative In Progress') return 'creative'
  if (status === 'Ready for Review' || status === 'Needs Revision') return 'review'
  if (status === 'Approved' || status === 'Scheduled') return 'schedule'
  return null
}

function pillarLabel(code: string) { return PILLAR_LABELS[code] ?? code }
function titleStatus(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function titleIdeaStatus(value: BackendIdea['status']): ContentIdea['status'] { return value === 'ready' ? 'Ready' : value === 'used' ? 'Used' : 'Archived' }

export function event(value: { id: string; eventType: string; variantId: string | null; actor: { name: string }; metadata: Record<string, unknown>; createdAt: string }): ContentHistoryEvent {
  const platform = value.metadata.platform
  return { id: value.id, event: eventLabel(value.eventType), platform: platform === 'instagram' || platform === 'linkedin' ? platform : undefined, actor: value.actor.name, timestamp: value.createdAt, metadata: metadataText(value.metadata) }
}

export function reviewAction(value: Pick<BackendApprovalAction, 'id' | 'action' | 'actor' | 'justification' | 'createdAt' | 'variantId'> & { platform?: ContentPlatform }): ContentHistoryEvent {
  const label = value.action === 'approve' ? 'Content approved' : value.action === 'request_revision' ? 'Revision requested' : 'Brand check override recorded'
  return { id: `review-${value.id}`, event: label, actor: value.actor.name, timestamp: value.createdAt, metadata: value.justification ?? undefined, platform: value.platform }
}

function eventLabel(value: string) {
  const labels: Record<string, string> = { brief_created: 'Content brief created', generated: 'Content generated', adapted: 'Platform variant generated', content_updated: 'Content updated', variant_updated: 'Variant updated', progress_changed: 'Workflow progress changed', brand_checked: 'Brand alignment checked', override_recorded: 'Override recorded', approved: 'Content approved', request_revision: 'Revision requested', content_duplicated: 'Content duplicated as a new draft', content_archived: 'Content archived', scheduled: 'Content scheduled', rescheduled: 'Content rescheduled', cancelled: 'Schedule cancelled', published: 'Content published' }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function metadataText(value: Record<string, unknown>) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && typeof item !== 'object')
  return entries.map(([key, item]) => `${key}: ${String(item)}`).join(' · ') || undefined
}
