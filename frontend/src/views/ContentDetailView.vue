<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import ContentAssetThumbnail from '../components/content/ContentAssetThumbnail.vue'
import VisualDirectionCard from '../components/content/VisualDirectionCard.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import AccessibleTabs from '../components/ui/AccessibleTabs.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import { useContentLibraryStore } from '../stores/contentLibrary'
import { useContentWorkflowStore } from '../stores/contentWorkflow'
import type { ContentAssetRecord, ContentLifecycleStatus, ContentPlatform } from '../types/content'
import type { Tone } from '../types/ui'
import { useContentIdeasStore } from '../stores/contentIdeas'
import { useProductsStore } from '../stores/products'
import { useCompanyContextStore } from '../stores/companyContext'
import { contentPublications, contentSchedules, contentStatus } from '../utils/contentRecords'

type DetailTab = 'overview' | 'instagram' | 'linkedin' | 'creative' | 'history'

const route = useRoute()
const router = useRouter()
const library = useContentLibraryStore()
const workflow = useContentWorkflowStore()
const products = useProductsStore()
const companyContext = useCompanyContextStore()
const ideas = useContentIdeasStore()
const activeTab = ref<DetailTab>('overview')
const previewAsset = ref<ContentAssetRecord | null>(null)
const previewModalOpen = ref(false)
const archiveModalOpen = ref(false)
const revisionModalOpen = ref(false)
const revisionReason = ref('')
const revisionError = ref('')
const detailLoading = ref(true)

const record = computed(() => library.records.find((item) => item.id === String(route.params.id)))
const sourceIdea = computed(() => ideas.ideas.find((idea) => idea.id === record.value?.ideaId))
const resolvedProductName = computed(() => record.value?.productId ? products.nameFor(record.value.productId) : '—')
const resolvedContextName = computed(() => {
  if (!record.value) return ''
  return record.value.context === 'company'
    ? companyContext.companyProfile.name
    : products.nameFor(record.value.productId)
})
const tabs = computed(() => {
  const items: { id: DetailTab; label: string }[] = [{ id: 'overview', label: 'Overview' }]
  if (record.value?.platforms.includes('instagram')) items.push({ id: 'instagram', label: 'Instagram' })
  if (record.value?.platforms.includes('linkedin')) items.push({ id: 'linkedin', label: 'LinkedIn' })
  items.push({ id: 'creative', label: 'Creative' }, { id: 'history', label: 'Review History' })
  return items
})
const isEditable = computed(() => record.value ? ['Draft', 'Generated', 'Adapted', 'Creative In Progress', 'Ready for Review', 'Needs Revision'].includes(contentStatus(record.value)) : false)
const primaryAction = computed(() => {
  if (!record.value) return null
  if (isEditable.value) return { label: 'Continue Editing', icon: 'arrow-right' as const }
  if (contentStatus(record.value) === 'Approved') return { label: 'Schedule Content', icon: 'calendar' as const }
  if (contentStatus(record.value) === 'Scheduled') return { label: 'View Schedule', icon: 'calendar' as const }
  return null
})
const instagramAssets = computed(() => record.value?.details.creative.instagram ?? [])
const linkedInAssets = computed(() => {
  if (!record.value) return []
  return record.value.details.creative.linkedinReusesInstagram
    ? record.value.details.creative.instagram
    : record.value.details.creative.linkedin
})

watch(record, () => {
  if (!tabs.value.some((tab) => tab.id === activeTab.value)) activeTab.value = 'overview'
})

function statusTone(value: ContentLifecycleStatus): Tone {
  if (value === 'Published' || value === 'Approved') return 'success'
  if (value === 'Scheduled' || value === 'Generated' || value === 'Adapted' || value === 'Creative In Progress') return 'info'
  if (value === 'Ready for Review' || value === 'Needs Revision') return 'warning'
  return 'neutral'
}

async function resumeStep() {
  if (!record.value) return
  if (contentStatus(record.value) === 'Scheduled') {
    router.push('/calendar')
    return
  }
  if (!(await workflow.load(record.value.id))) return
  router.push('/content/create')
}

function startNewContent() {
  workflow.startNewWorkflow()
  router.push('/content/create')
}

async function duplicateRecord() {
  if (!record.value) return
  const duplicate = await library.duplicate(record.value.id)
  if (duplicate) router.push(`/content/${duplicate.id}`)
}

async function archiveRecord() {
  if (!record.value) return
  await library.archive(record.value.id)
  archiveModalOpen.value = false
}

function openRevisionRequest() {
  revisionReason.value = ''
  revisionError.value = ''
  revisionModalOpen.value = true
}

async function requestRevision() {
  const reason = revisionReason.value.trim()
  if (!reason) { revisionError.value = 'A revision reason is required.'; return }
  if (!record.value) return
  if (!(await workflow.load(record.value.id, true))) { revisionError.value = workflow.error || 'Unable to load the latest Content version.'; return }
  if (!(await workflow.requestRevision(reason))) { revisionError.value = workflow.error || 'Unable to request a revision.'; return }
  await library.getById(record.value.id, true)
  revisionModalOpen.value = false
  router.push('/content/create')
}

function openPreview(asset: ContentAssetRecord) {
  previewAsset.value = asset
  previewModalOpen.value = true
}

function formatPlatform(platform: ContentPlatform) {
  return platform === 'instagram' ? 'Instagram' : 'LinkedIn'
}

function formatDateTime(date: string, time?: string) {
  const value = time ? new Date(`${date}T${time}`) : new Date(date)
  if (Number.isNaN(value.getTime())) return time ? `${date} · ${time}` : date
  const includeTime = Boolean(time) || date.includes('T')
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  }).format(value)
}

async function loadDetail(id: string) {
  detailLoading.value = true
  await Promise.all([library.load(), products.load(), companyContext.load(), ideas.load()])
  await library.getById(id, true)
  detailLoading.value = false
}

onMounted(() => { void loadDetail(String(route.params.id)) })
watch(() => String(route.params.id), (id, previousId) => {
  if (previousId !== undefined && id !== previousId) void loadDetail(id)
})
</script>

<template>
  <div v-if="record && !detailLoading" class="page-stack content-detail-page">
    <PageHeader :title="record.title" :breadcrumbs="[{ label: 'Content Studio' }, { label: 'Content Library', to: '/content' }, { label: record.title }]">
      <template #actions>
        <BaseButton v-if="primaryAction" @click="resumeStep"><AppIcon :name="primaryAction.icon" :size="16" />{{ primaryAction.label }}</BaseButton>
        <BaseButton v-if="['Approved', 'Scheduled'].includes(contentStatus(record))" variant="secondary" @click="openRevisionRequest">Request Revision</BaseButton>
        <BaseButton variant="secondary" @click="duplicateRecord"><AppIcon name="plus" :size="15" />Duplicate</BaseButton>
        <BaseButton v-if="contentStatus(record) !== 'Archived'" variant="ghost" @click="archiveModalOpen = true">Archive</BaseButton>
      </template>
    </PageHeader>

    <div class="detail-heading-meta">
      <div class="detail-heading-tags"><span>{{ resolvedContextName }}</span><span>{{ record.pillar }}</span><span>{{ record.platforms.map(formatPlatform).join(' + ') }}</span></div>
      <StatusBadge :tone="statusTone(contentStatus(record))" dot>{{ contentStatus(record) }}</StatusBadge>
    </div>

    <section class="detail-metadata" aria-label="Content metadata">
      <dl>
        <div><dt>Context</dt><dd>{{ record.context === 'product' ? 'Product' : 'Company' }}</dd></div>
        <div><dt>Product</dt><dd>{{ resolvedProductName ?? '—' }}</dd></div>
        <div><dt>Content Pillar</dt><dd>{{ record.pillar }}</dd></div>
        <div><dt>Objective</dt><dd>{{ record.details.objective }}</dd></div>
        <div><dt>Target Audience</dt><dd>{{ record.details.audience }}</dd></div>
        <div><dt>Created By</dt><dd>{{ record.details.createdBy }}</dd></div>
        <div><dt>Created At</dt><dd>{{ record.details.createdAt }}</dd></div>
        <div><dt>Last Updated</dt><dd>{{ record.updatedAt }}</dd></div>
      </dl>
    </section>

    <AccessibleTabs v-model="activeTab" :items="tabs" label="Content detail sections" id-prefix="detail-tab" panel-prefix="detail-panel" variant="detail" />

    <div v-if="activeTab === 'overview'" id="detail-panel-overview" class="detail-overview" role="tabpanel" aria-labelledby="detail-tab-overview">
      <div class="detail-main-column">
        <BaseCard title="Content Brief">
          <dl class="detail-field-list">
            <div v-if="sourceIdea"><dt>Source Idea</dt><dd><RouterLink to="/content/ideas">{{ sourceIdea.title }}</RouterLink></dd></div>
            <div><dt>Topic / Idea</dt><dd>{{ record.topic }}</dd></div>
            <div><dt>Content Angle</dt><dd>{{ record.details.angle }}</dd></div>
            <div><dt>Objective</dt><dd>{{ record.details.objective }}</dd></div>
            <div><dt>Target Audience</dt><dd>{{ record.details.audience }}</dd></div>
            <div v-if="record.details.instructions"><dt>Additional Instructions</dt><dd>{{ record.details.instructions }}</dd></div>
          </dl>
        </BaseCard>

        <BaseCard v-if="record.details.masterContent" title="Master Content">
          <dl class="detail-copy-list">
            <div><dt>Title</dt><dd>{{ record.details.masterContent.title }}</dd></div>
            <div><dt>Core Message</dt><dd>{{ record.details.masterContent.coreMessage }}</dd></div>
            <div><dt>Hook</dt><dd>{{ record.details.masterContent.hook }}</dd></div>
            <div><dt>Body</dt><dd class="preserve-copy">{{ record.details.masterContent.body }}</dd></div>
            <div><dt>CTA</dt><dd>{{ record.details.masterContent.cta }}</dd></div>
          </dl>
        </BaseCard>

        <VisualDirectionCard v-if="record.details.visualDirection" :direction="record.details.visualDirection" />
        <BaseCard v-if="!record.details.masterContent" title="Master Content"><p class="detail-helper">Generated content will appear here after this draft completes the Generate step.</p></BaseCard>
      </div>

      <aside class="detail-side-column">
        <BaseCard v-if="Object.keys(record.details.brandAssessments).length" title="AI Brand Assessment" description="Advisory assessment only. Human approval is recorded separately.">
          <div class="assessment-summary-list">
            <div v-for="platform in record.platforms" :key="platform">
              <template v-if="record.details.brandAssessments[platform]"><span>{{ formatPlatform(platform) }}</span><strong>{{ record.details.brandAssessments[platform]!.score }} / 100</strong><StatusBadge :tone="record.details.brandAssessments[platform]!.status === 'Aligned' ? 'success' : 'warning'">{{ record.details.brandAssessments[platform]!.status }}</StatusBadge></template>
            </div>
          </div>
        </BaseCard>

        <BaseCard v-if="record.details.approval" title="Human Approval">
          <dl class="detail-field-list compact"><div><dt>Approved by</dt><dd>{{ record.details.approval.approvedBy }}</dd></div><div><dt>Approval timestamp</dt><dd>{{ record.details.approval.approvedAt }}</dd></div></dl>
          <div v-for="(justification, platform) in record.details.approval.overrides" :key="platform" class="override-detail"><StatusBadge tone="warning" dot>Override recorded · {{ formatPlatform(platform) }}</StatusBadge><p>{{ justification }}</p></div>
        </BaseCard>

        <BaseCard v-if="contentStatus(record) === 'Approved' || Object.keys(contentSchedules(record)).length" title="Schedule">
          <div class="schedule-detail-list"><div v-for="platform in record.platforms" :key="platform"><template v-if="contentSchedules(record)[platform]"><span>{{ formatPlatform(platform) }}</span><strong>{{ formatDateTime(contentSchedules(record)[platform]!.date, contentSchedules(record)[platform]!.time) }}</strong><StatusBadge tone="info">Scheduled</StatusBadge></template></div></div>
          <p v-if="contentStatus(record) === 'Approved' && !Object.keys(contentSchedules(record)).length" class="detail-helper">Approved content is ready to schedule. No publication time has been selected yet.</p>
          <BaseButton v-if="contentStatus(record) === 'Approved'" variant="secondary" size="compact" @click="resumeStep"><AppIcon name="calendar" :size="15" />Schedule Content</BaseButton>
          <BaseButton v-if="contentStatus(record) === 'Scheduled'" variant="secondary" size="compact" @click="router.push('/calendar')"><AppIcon name="calendar" :size="15" />View in Calendar</BaseButton>
        </BaseCard>

        <BaseCard v-if="Object.keys(contentPublications(record)).length" title="Publication">
          <div class="schedule-detail-list"><div v-for="platform in record.platforms" :key="platform"><template v-if="contentPublications(record)[platform]"><span>{{ formatPlatform(platform) }}</span><div class="publication-detail-value"><strong>{{ formatDateTime(contentPublications(record)[platform]!.publishedAt) }}</strong><a v-if="contentPublications(record)[platform]!.postUrl" :href="contentPublications(record)[platform]!.postUrl" target="_blank" rel="noopener noreferrer">View Post</a></div><StatusBadge tone="success">Published</StatusBadge></template></div></div>
          <p class="detail-helper">Publication was recorded manually. No social platform publishing action was performed by Shifd Marketing.</p>
        </BaseCard>
      </aside>
    </div>

    <BaseCard v-else-if="activeTab === 'instagram' && record.details.instagram" id="detail-panel-instagram" role="tabpanel" aria-labelledby="detail-tab-instagram" title="Instagram" description="Final platform variant and creative in saved carousel order.">
      <template #actions><StatusBadge :tone="statusTone(contentStatus(record))">{{ contentStatus(record) }}</StatusBadge></template>
      <div class="platform-detail-grid">
        <dl class="detail-copy-list"><div><dt>Caption</dt><dd class="preserve-copy">{{ record.details.instagram.caption }}</dd></div><div><dt>CTA</dt><dd>{{ record.details.instagram.cta }}</dd></div><div><dt>Suggested Hashtags</dt><dd>{{ record.details.instagram.hashtags }}</dd></div><div><dt>Visual Recommendation</dt><dd>{{ record.details.instagram.visualRecommendation }}</dd></div></dl>
        <div><h3 class="detail-section-label">Instagram Creative</h3><div v-if="instagramAssets.length" class="asset-grid"><ContentAssetThumbnail v-for="asset in instagramAssets" :key="asset.id" :asset="asset" @preview="openPreview" /></div><p v-else class="detail-helper">No Instagram creative has been added.</p></div>
      </div>
      <template v-if="isEditable" #footer><BaseButton variant="secondary" @click="resumeStep">Continue Editing</BaseButton></template>
    </BaseCard>

    <BaseCard v-else-if="activeTab === 'linkedin' && record.details.linkedin" id="detail-panel-linkedin" role="tabpanel" aria-labelledby="detail-tab-linkedin" title="LinkedIn" description="Final B2B platform variant and selected creative.">
      <template #actions><div class="detail-card-actions"><StatusBadge v-if="record.details.creative.linkedinReusesInstagram" tone="neutral">Using Instagram creative</StatusBadge><StatusBadge :tone="statusTone(contentStatus(record))">{{ contentStatus(record) }}</StatusBadge></div></template>
      <div class="platform-detail-grid">
        <dl class="detail-copy-list"><div><dt>Final Post Copy</dt><dd class="preserve-copy">{{ record.details.linkedin.postCopy }}</dd></div><div><dt>CTA</dt><dd>{{ record.details.linkedin.cta }}</dd></div><div><dt>Suggested Hashtags</dt><dd>{{ record.details.linkedin.hashtags }}</dd></div><div><dt>Visual Recommendation</dt><dd>{{ record.details.linkedin.visualRecommendation }}</dd></div></dl>
        <div><h3 class="detail-section-label">LinkedIn Creative</h3><div v-if="linkedInAssets.length" class="asset-grid"><ContentAssetThumbnail v-for="asset in linkedInAssets" :key="asset.id" :asset="asset" @preview="openPreview" /></div><p v-else class="detail-helper">No LinkedIn creative has been added.</p></div>
      </div>
      <template v-if="isEditable" #footer><BaseButton variant="secondary" @click="resumeStep">Continue Editing</BaseButton></template>
    </BaseCard>

    <div v-else-if="activeTab === 'creative'" id="detail-panel-creative" class="creative-detail-sections" role="tabpanel" aria-labelledby="detail-tab-creative">
      <BaseCard v-if="record.platforms.includes('instagram')" title="Instagram Creative" description="Carousel assets in their saved order."><div v-if="instagramAssets.length" class="asset-grid asset-grid--wide"><ContentAssetThumbnail v-for="asset in instagramAssets" :key="asset.id" :asset="asset" show-metadata @preview="openPreview" /></div><p v-else class="detail-helper">No Instagram creative has been added.</p></BaseCard>
      <BaseCard v-if="record.platforms.includes('linkedin')" title="LinkedIn Creative" :description="record.details.creative.linkedinReusesInstagram ? 'Using the Instagram creative in the same order.' : 'Separate LinkedIn creative assets.'"><template #actions><StatusBadge v-if="record.details.creative.linkedinReusesInstagram" tone="neutral">Using Instagram creative</StatusBadge></template><div v-if="linkedInAssets.length" class="asset-grid asset-grid--wide"><ContentAssetThumbnail v-for="asset in linkedInAssets" :key="asset.id" :asset="asset" show-metadata @preview="openPreview" /></div><p v-else class="detail-helper">No LinkedIn creative has been added.</p></BaseCard>
      <BaseButton v-if="isEditable" variant="secondary" @click="resumeStep(); workflow.activeStep = 'creative'">Continue to Creative</BaseButton>
    </div>

    <div v-else-if="activeTab === 'history'" id="detail-panel-history" class="history-layout" role="tabpanel" aria-labelledby="detail-tab-history">
      <BaseCard title="Review History" description="Content lifecycle activity recorded by the backend.">
        <ol class="audit-timeline">
          <li v-for="event in record.details.history" :key="event.id"><span class="audit-timeline__marker" aria-hidden="true" /><div><div class="audit-timeline__title"><strong>{{ event.event }}</strong><StatusBadge v-if="event.platform" tone="neutral">{{ formatPlatform(event.platform) }}</StatusBadge></div><p v-if="event.metadata">{{ event.metadata }}</p><small>{{ event.actor }} · {{ event.timestamp }}</small></div></li>
        </ol>
      </BaseCard>
      <BaseCard v-if="Object.keys(record.details.brandAssessments).length || record.details.approval" title="Review Outcome">
        <div v-if="Object.keys(record.details.brandAssessments).length"><span class="detail-section-label">AI Brand Assessment</span><div class="assessment-summary-list"><div v-for="platform in record.platforms" :key="platform"><template v-if="record.details.brandAssessments[platform]"><span>{{ formatPlatform(platform) }}</span><strong>{{ record.details.brandAssessments[platform]!.score }} / 100</strong><StatusBadge :tone="record.details.brandAssessments[platform]!.status === 'Aligned' ? 'success' : 'warning'">{{ record.details.brandAssessments[platform]!.status }}</StatusBadge></template></div></div></div>
        <div v-if="record.details.approval" class="human-approval-summary"><span class="detail-section-label">Human Approval</span><strong>Approved by {{ record.details.approval.approvedBy }}</strong><p>{{ record.details.approval.approvedAt }}</p><div v-for="(justification, platform) in record.details.approval.overrides" :key="platform" class="override-detail"><StatusBadge tone="warning" dot>Override recorded · {{ formatPlatform(platform) }}</StatusBadge><p>{{ justification }}</p></div></div>
      </BaseCard>
    </div>

    <BaseModal v-model="archiveModalOpen" title="Archive content" description="The content will remain available in the library under Archived."><p>Archive “{{ record.title }}”?</p><template #footer><div class="detail-modal-actions"><BaseButton variant="ghost" @click="archiveModalOpen = false">Cancel</BaseButton><BaseButton variant="danger" @click="archiveRecord">Archive</BaseButton></div></template></BaseModal>
    <BaseModal v-model="revisionModalOpen" title="Request a revision" description="This unlocks the review workflow and cancels any unpublished schedules. Published variants remain immutable."><BaseTextarea v-model="revisionReason" label="Revision reason" :rows="4" :error="revisionError" required /><template #footer><div class="detail-modal-actions"><BaseButton variant="ghost" @click="revisionModalOpen = false">Cancel</BaseButton><BaseButton @click="requestRevision">Request Revision</BaseButton></div></template></BaseModal>
    <BaseModal v-model="previewModalOpen" title="Creative preview" :description="previewAsset?.name" size="wide"><div v-if="previewAsset" class="large-asset-preview"><img v-if="previewAsset.url" :src="previewAsset.url" :alt="previewAsset.name" /><div v-else><small>Creative placeholder</small><strong>{{ previewAsset.previewLabel ?? 'Creative' }}</strong><span>Preview {{ String(previewAsset.order).padStart(2, '0') }}</span></div></div></BaseModal>
  </div>

  <div v-else-if="detailLoading || library.loading" class="page-stack"><InlineAlert title="Loading content">Loading the canonical Content record…</InlineAlert></div>

  <div v-else-if="library.error" class="page-stack"><InlineAlert title="Content unavailable" tone="danger">{{ library.error }}</InlineAlert><BaseButton variant="secondary" @click="router.push('/content')">Back to Content Library</BaseButton></div>

  <div v-else class="page-stack">
    <PageHeader title="Content not found" description="The requested content record is not available." :breadcrumbs="[{ label: 'Content Studio' }, { label: 'Content Library', to: '/content' }, { label: 'Not found' }]" />
    <BaseCard><EmptyState icon="search" title="Content not found." description="The record may have been archived or the link may be incorrect."><BaseButton variant="secondary" @click="router.push('/content')"><AppIcon name="arrow-left" :size="16" />Back to Content Library</BaseButton><BaseButton @click="startNewContent"><AppIcon name="plus" :size="16" />Create Content</BaseButton></EmptyState></BaseCard>
  </div>
</template>

<style scoped>
.detail-heading-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: -12px; }
.detail-heading-tags { display: flex; flex-wrap: wrap; gap: 8px; color: var(--color-muted); font-size: 12px; }
.detail-heading-tags span { padding: 4px 8px; border-radius: 5px; background: var(--color-well); }
.detail-metadata { padding: 16px 20px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.detail-metadata dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 24px; }
.detail-metadata dt, .detail-field-list dt, .detail-copy-list dt { color: var(--color-muted); font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.detail-metadata dd { margin-top: 4px; font-size: 13px; font-weight: 500; }
.detail-tabs { display: flex; max-width: 100%; overflow-x: auto; gap: 4px; padding: 4px; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); }
.detail-tabs button { flex: 0 0 auto; min-height: 36px; padding: 0 14px; border-radius: 6px; color: var(--color-muted); font-size: 13px; font-weight: 500; }
.detail-tabs button:hover { background: var(--color-well); color: var(--color-text); }
.detail-tabs button.is-active { background: var(--color-primary); color: white; }
.detail-tabs button:focus-visible { outline: 3px solid rgb(29 78 216 / .2); outline-offset: 1px; }
.detail-overview { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(280px, .75fr); gap: 20px; align-items: start; }
.detail-main-column, .detail-side-column, .creative-detail-sections, .history-layout { display: flex; flex-direction: column; gap: 20px; }
.detail-side-column { position: sticky; top: 84px; }
.detail-field-list, .detail-copy-list { display: grid; gap: 16px; }
.detail-field-list > div, .detail-copy-list > div { display: grid; gap: 6px; }
.detail-field-list > div + div, .detail-copy-list > div + div { padding-top: 16px; border-top: 1px solid var(--color-border); }
.detail-field-list dd, .detail-copy-list dd { color: var(--color-text); line-height: 1.65; }
.detail-field-list.compact { gap: 12px; }
.preserve-copy { white-space: pre-line; }
.assessment-summary-list, .schedule-detail-list { display: grid; gap: 10px; }
.assessment-summary-list > div, .schedule-detail-list > div { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; min-height: 32px; }
.assessment-summary-list strong, .schedule-detail-list strong { font-size: 13px; font-weight: 600; }
.publication-detail-value { display: grid; justify-items: end; gap: 2px; }
.publication-detail-value a { color: var(--color-primary); font-size: 11px; font-weight: 500; }
.override-detail { display: grid; gap: 8px; margin-top: 16px; padding: 12px; border: 1px solid #f3d39b; border-radius: 6px; background: #fffaf0; }
.override-detail p, .detail-helper { color: var(--color-muted); font-size: 12px; line-height: 1.55; }
.platform-detail-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(240px, .55fr); gap: 24px; }
.detail-section-label { display: block; margin-bottom: 10px; color: var(--color-muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.detail-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(105px, 1fr)); gap: 12px; }
.asset-grid--wide { grid-template-columns: repeat(auto-fill, minmax(140px, 180px)); }
.history-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .7fr); align-items: start; }
.audit-timeline { display: grid; }
.audit-timeline li { position: relative; display: grid; grid-template-columns: 16px 1fr; gap: 12px; padding-bottom: 22px; }
.audit-timeline li:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 11px; bottom: 0; width: 1px; background: var(--color-border); }
.audit-timeline__marker { position: relative; z-index: 1; width: 11px; height: 11px; margin-top: 5px; border: 3px solid #dce9ff; border-radius: 50%; background: var(--color-primary); }
.audit-timeline__title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.audit-timeline__title strong { font-size: 13px; font-weight: 600; }
.audit-timeline p { margin-top: 3px; color: var(--color-muted); font-size: 12px; }
.audit-timeline small { display: block; margin-top: 5px; color: var(--color-subtle); font-size: 11px; }
.human-approval-summary { display: grid; gap: 6px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--color-border); }
.human-approval-summary strong { font-size: 13px; }
.human-approval-summary > p { color: var(--color-muted); font-size: 12px; }
.detail-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.large-asset-preview { min-height: 440px; overflow: hidden; border-radius: var(--radius-card); background: #eff4ff; }
.large-asset-preview img { width: 100%; max-height: 70vh; object-fit: contain; }
.large-asset-preview > div { display: flex; flex-direction: column; justify-content: flex-end; min-height: 440px; padding: 40px; color: white; background: linear-gradient(145deg, #0b1c30, #153d83); }
.large-asset-preview small { margin-bottom: auto; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }
.large-asset-preview strong { max-width: 12ch; font-size: clamp(28px, 5vw, 52px); line-height: 1.05; font-weight: 600; }
.large-asset-preview span { margin-top: 28px; color: #bae6fd; }
@media (max-width: 1050px) { .detail-overview, .platform-detail-grid, .history-layout { grid-template-columns: 1fr; } .detail-side-column { position: static; } .detail-metadata dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .detail-metadata dl { grid-template-columns: 1fr; } .detail-heading-meta { align-items: flex-start; flex-direction: column; } .asset-grid--wide { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
