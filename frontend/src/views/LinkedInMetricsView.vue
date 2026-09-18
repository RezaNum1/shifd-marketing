<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseTable from '../components/ui/BaseTable.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { usePerformanceStore } from '../stores/performance'
import type { MetricEvidence, WeeklyMetric } from '../types/performance'
import type { TableColumn } from '../types/ui'

const router = useRouter()
const store = usePerformanceStore()
const modalOpen = ref(false)
const attempted = ref(false)
const formError = ref('')
const editingId = ref<string | undefined>()
const evidence = ref<MetricEvidence>()
const previewEvidence = ref<MetricEvidence>()
const previewOpen = ref(false)
const fileInput = ref<HTMLInputElement>()
const form = reactive({ weekStart: '', weekEnd: '', followers: '', impressions: '', reach: '', likes: '', comments: '', saves: '', publishedPosts: '', notes: '' })
const numericFields = ['followers', 'impressions', 'reach', 'likes', 'comments', 'saves', 'publishedPosts'] as const
const requiredNumericFields = ['followers', 'impressions', 'publishedPosts'] as const
const columns = [
  { key: 'week', label: 'Week' },
  { key: 'followers', label: 'Followers', align: 'right' as const },
  { key: 'reach', label: 'Reach', align: 'right' as const },
  { key: 'impressions', label: 'Impressions', align: 'right' as const },
  { key: 'engagements', label: 'Engagements', align: 'right' as const },
  { key: 'rate', label: 'Engagement Rate', align: 'right' as const },
  { key: 'publishedPosts', label: 'Published Posts', align: 'right' as const },
  { key: 'source', label: 'Source' },
  { key: 'actions', label: 'Actions' },
] satisfies TableColumn[]
const linkedInRecords = computed(() => store.weeklyMetrics.filter((metric) => metric.platform === 'linkedin').sort((a, b) => b.weekStart.localeCompare(a.weekStart)))
const totalPublishedPosts = computed(() => linkedInRecords.value.reduce((sum, metric) => sum + metric.publishedPosts, 0))
const formErrors = computed(() => {
  if (!attempted.value) return {} as Record<string, string>
  const errors: Record<string, string> = {}
  if (!form.weekStart) errors.weekStart = 'Week Start is required.'
  if (!form.weekEnd) errors.weekEnd = 'Week End is required.'
  if (form.weekStart && form.weekEnd && form.weekEnd < form.weekStart) errors.weekEnd = 'Week End cannot be earlier than Week Start.'
  numericFields.forEach((field) => {
    if (form[field] === '' && requiredNumericFields.includes(field as typeof requiredNumericFields[number])) errors[field] = `${fieldLabel(field)} is required.`
    else if (form[field] === '') return
    if (!Number.isFinite(Number(form[field])) || Number(form[field]) < 0) errors[field] = 'Enter zero or a positive number.'
  })
  return errors
})

function fieldLabel(field: typeof numericFields[number]) { return field === 'publishedPosts' ? 'Published Posts' : field.charAt(0).toUpperCase() + field.slice(1) }
function formatNumber(value: number | null) { return value === null ? '—' : value.toLocaleString() }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function formatWeek(record: WeeklyMetric) { return `${formatDate(record.weekStart)} – ${formatDate(record.weekEnd)}` }
function engagementCount(record: WeeklyMetric) { return record.engagements ?? 0 }
function formatRate(record: WeeklyMetric) { return record.engagementRate === null || record.engagementRate === undefined ? '—' : `${record.engagementRate.toFixed(2)}%` }
function resetForm() { Object.assign(form, { weekStart: '', weekEnd: '', followers: '', impressions: '', reach: '', likes: '', comments: '', saves: '', publishedPosts: '', notes: '' }); attempted.value = false; formError.value = ''; editingId.value = undefined; evidence.value = undefined }
function openAdd() { resetForm(); modalOpen.value = true }
function openEdit(record: WeeklyMetric) { Object.assign(form, { weekStart: record.weekStart, weekEnd: record.weekEnd, followers: String(record.followers), impressions: String(record.impressions), reach: record.reach === null ? '' : String(record.reach), likes: String(record.likes), comments: String(record.comments), saves: String(record.saves), publishedPosts: String(record.publishedPosts), notes: record.notes ?? '' }); attempted.value = false; formError.value = ''; editingId.value = record.id; evidence.value = record.referenceScreenshot ? { ...record.referenceScreenshot } : undefined; modalOpen.value = true }
function chooseFile() { fileInput.value?.click() }
function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (evidence.value?.url.startsWith('blob:')) URL.revokeObjectURL(evidence.value.url)
  const lowerName = file.name.toLowerCase()
  const type = file.type === 'image/png' || lowerName.endsWith('.png') ? 'PNG' : file.type === 'image/jpeg' || lowerName.endsWith('.jpeg') || lowerName.endsWith('.jpg') ? (lowerName.endsWith('.jpeg') ? 'JPEG' : 'JPG') : undefined
  if (!type) { formError.value = 'Choose a PNG, JPG, or JPEG image.'; return }
  evidence.value = { name: file.name, type, url: URL.createObjectURL(file), file }
  formError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
function removeEvidence() { if (evidence.value?.url.startsWith('blob:')) URL.revokeObjectURL(evidence.value.url); evidence.value = undefined }
async function save() {
  attempted.value = true
  if (Object.keys(formErrors.value).length) return
  const result = await store.saveLinkedInMetric({ id: editingId.value, weekStart: form.weekStart, weekEnd: form.weekEnd, followers: Number(form.followers), impressions: Number(form.impressions), reach: form.reach === '' ? null : Number(form.reach), likes: Number(form.likes), comments: Number(form.comments), saves: Number(form.saves), publishedPosts: Number(form.publishedPosts), notes: form.notes.trim() || undefined, referenceScreenshot: evidence.value })
  if ('error' in result) { formError.value = result.error ?? 'A LinkedIn metric record already exists for this week.'; return }
  if (evidence.value?.file && evidence.value.url.startsWith('blob:')) URL.revokeObjectURL(evidence.value.url)
  modalOpen.value = false
  formError.value = ''
}
function viewEvidence(record: WeeklyMetric) { if (!record.referenceScreenshot) return; previewEvidence.value = record.referenceScreenshot; previewOpen.value = true }

onMounted(() => { void store.loadSupportingData() })
</script>

<template>
  <div class="page-stack linkedin-metrics-page">
    <PageHeader title="LinkedIn Metrics" description="Record weekly LinkedIn performance data used in the Performance Tracker." :breadcrumbs="[{ label: 'Planning & Insights' }, { label: 'Performance', to: '/performance' }, { label: 'LinkedIn Metrics' }]">
      <template #actions><BaseButton variant="secondary" @click="router.push('/performance')"><AppIcon name="arrow-left" :size="16" />Back to Performance</BaseButton><BaseButton @click="openAdd"><AppIcon name="plus" :size="16" />Add Weekly Metrics</BaseButton></template>
    </PageHeader>

    <InlineAlert v-if="store.supportingLoading" title="Loading metrics">Reading weekly metrics from the backend…</InlineAlert>
    <InlineAlert v-else-if="store.error" title="Metrics unavailable" tone="danger">{{ store.error }}</InlineAlert>

    <template v-if="store.supportingLoaded">
    <section class="metrics-summary" aria-label="LinkedIn metrics summary"><div><span>Data Source</span><strong>Manual Entry</strong></div><div><span>Weekly Target</span><strong>2 posts / week</strong></div><div><span>Weeks Recorded</span><strong>{{ linkedInRecords.length }}</strong></div><div><span>Total Published Posts</span><strong>{{ formatNumber(totalPublishedPosts) }}</strong></div></section>

    <BaseCard title="Weekly LinkedIn Records" description="Followers represent the ending count for each week. Published Posts counts posts published manually during that week."><template #actions><StatusBadge tone="info" dot>Manual Entry</StatusBadge></template><div v-if="linkedInRecords.length" class="metrics-table-wrap"><BaseTable :columns="columns" :rows="linkedInRecords" caption="LinkedIn weekly metrics">
      <template #cell-week="{ row }"><time :datetime="row.weekStart">{{ formatWeek(row) }}</time></template>
      <template #cell-followers="{ row }">{{ formatNumber(row.followers) }}</template>
      <template #cell-reach="{ row }">{{ formatNumber(row.reach) }}</template>
      <template #cell-impressions="{ row }">{{ formatNumber(row.impressions) }}</template>
      <template #cell-engagements="{ row }">{{ formatNumber(engagementCount(row)) }}</template>
      <template #cell-rate="{ row }">{{ formatRate(row) }}</template>
      <template #cell-publishedPosts="{ row }">{{ row.publishedPosts }}</template>
      <template #cell-source="{ row }"><span class="source-cell"><StatusBadge tone="neutral">{{ row.source === 'linkedin_manual' || row.source === 'manual' ? 'Manual' : row.source === 'mixed' ? 'Mixed' : 'Backend' }}</StatusBadge><span v-if="row.referenceScreenshot" class="evidence-label">Evidence Attached</span></span></template>
      <template #cell-actions="{ row }"><div class="record-actions"><BaseButton variant="ghost" size="compact" @click="openEdit(row)">Edit</BaseButton><BaseButton v-if="row.referenceScreenshot" variant="ghost" size="compact" @click="viewEvidence(row)">View Evidence</BaseButton></div></template>
    </BaseTable></div><EmptyState v-else icon="chart" title="No LinkedIn metrics recorded yet." description="Add weekly LinkedIn data to include it in the Performance Tracker."><BaseButton @click="openAdd">Add Weekly Metrics</BaseButton></EmptyState></BaseCard>

    <BaseCard class="metrics-note"><strong>Engagement Rate</strong><p>The backend calculates (likes + comments + saves) ÷ impressions × 100 after saving. When impressions are zero, the rate displays as —.</p><button type="button" class="metrics-link" @click="router.push('/performance')">View the Performance Tracker <AppIcon name="arrow-right" :size="14" /></button></BaseCard>
    </template>

    <BaseModal v-model="modalOpen" :title="editingId ? 'Edit Weekly Metrics' : 'Add Weekly Metrics'" description="Enter observed LinkedIn values. Data Source is fixed to Manual Entry for this page." size="wide"><form class="metrics-form" @submit.prevent="save"><div class="metrics-form__dates"><BaseInput v-model="form.weekStart" label="Week Start" type="date" required :error="formErrors.weekStart" /><BaseInput v-model="form.weekEnd" label="Week End" type="date" required :error="formErrors.weekEnd" /></div><div class="metrics-form__grid"><BaseInput v-model="form.followers" label="Followers" type="number" min="0" required :error="formErrors.followers" hint="Ending follower count for the week." /><BaseInput v-model="form.impressions" label="Impressions" type="number" min="0" required :error="formErrors.impressions" /><BaseInput v-model="form.reach" label="Reach" type="number" min="0" :error="formErrors.reach" /><BaseInput v-model="form.likes" label="Likes" type="number" min="0" :error="formErrors.likes" /><BaseInput v-model="form.comments" label="Comments" type="number" min="0" :error="formErrors.comments" /><BaseInput v-model="form.saves" label="Saves" type="number" min="0" :error="formErrors.saves" /><BaseInput v-model="form.publishedPosts" label="Published Posts" type="number" min="0" required :error="formErrors.publishedPosts" hint="Count posts actually published, not scheduled." /></div><div class="derived-rate"><span>Engagement Rate</span><strong>Calculated by backend after save</strong></div><BaseTextarea v-model="form.notes" label="Notes" :rows="3" /><div class="evidence-upload"><div><strong>Reference Screenshot <span>(optional)</span></strong><p>Supporting evidence only. Metrics are entered manually and are not extracted from this image.</p></div><input ref="fileInput" type="file" accept="image/png,image/jpeg,.jpg,.jpeg" hidden @change="onFileChange" /><div v-if="evidence" class="evidence-preview"><img :src="evidence.url" :alt="evidence.name" /><div><strong>{{ evidence.name }}</strong><small>{{ evidence.type }} · Evidence Attached</small></div><BaseButton variant="ghost" size="compact" type="button" @click="removeEvidence">Remove</BaseButton></div><BaseButton v-else variant="secondary" type="button" @click="chooseFile"><AppIcon name="upload" :size="16" />Choose Screenshot</BaseButton></div><p v-if="formError" class="form-error" role="alert">{{ formError }}</p><div class="modal-actions"><BaseButton variant="ghost" type="button" @click="modalOpen = false">Cancel</BaseButton><BaseButton type="submit">Save Metrics</BaseButton></div></form></BaseModal>
    <BaseModal v-model="previewOpen" title="Reference Screenshot" :description="previewEvidence?.name"><div v-if="previewEvidence" class="evidence-large"><img :src="previewEvidence.url" :alt="previewEvidence.name" /></div></BaseModal>
  </div>
</template>

<style scoped>
.linkedin-metrics-page { max-width: 1280px; }
.metrics-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-border); }
.metrics-summary > div { display: grid; gap: 6px; padding: 16px; background: var(--color-surface); }
.metrics-summary span { color: var(--color-subtle); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
.metrics-summary strong { font-size: 16px; }
.metrics-table-wrap { overflow-x: auto; }
.source-cell { display: inline-flex; align-items: center; gap: 8px; }
.evidence-label { color: var(--color-muted); font-size: 11px; }
.record-actions { display: flex; gap: 4px; }
.metrics-note { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: var(--color-well); }
.metrics-note p { flex: 1; min-width: 250px; color: var(--color-muted); font-size: 12px; }
.metrics-link { display: inline-flex; align-items: center; gap: 5px; color: var(--color-link); font-size: 12px; font-weight: 500; }
.metrics-form { display: grid; gap: 18px; }
.metrics-form__dates, .metrics-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.derived-rate { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-well); color: var(--color-muted); font-size: 12px; }
.derived-rate strong { color: var(--color-ink); font-size: 15px; }
.evidence-upload { display: grid; gap: 12px; padding: 14px; border: 1px dashed var(--color-control-border); border-radius: var(--radius-control); }
.evidence-upload > div:first-child { display: grid; gap: 4px; }
.evidence-upload strong { font-size: 13px; }
.evidence-upload strong span { color: var(--color-subtle); font-weight: 400; }
.evidence-upload p, .evidence-preview small { color: var(--color-muted); font-size: 12px; }
.evidence-preview { display: flex; align-items: center; gap: 10px; }
.evidence-preview img { width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-control); border: 1px solid var(--color-border); }
.evidence-preview > div { display: grid; gap: 2px; flex: 1; min-width: 0; }
.evidence-preview strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.form-error { color: var(--color-danger); font-size: 12px; }
.evidence-large { display: grid; place-items: center; min-height: 280px; background: var(--color-well); border-radius: var(--radius-control); }
.evidence-large img { max-width: 100%; max-height: 70vh; object-fit: contain; }
@media (max-width: 760px) { .metrics-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .metrics-note { align-items: flex-start; flex-direction: column; } }
@media (max-width: 540px) { .metrics-form__dates, .metrics-form__grid { grid-template-columns: 1fr; } .metrics-summary { grid-template-columns: 1fr; } }
</style>
