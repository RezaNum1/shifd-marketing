<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/app/PageHeader.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseTable from '../components/ui/BaseTable.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import InlineAlert from '../components/ui/InlineAlert.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { usePerformanceStore } from '../stores/performance'
import type { BackendPublicationFeedItem } from '../types/backend'
import type { TableColumn } from '../types/ui'
import { addDateDays, mondayOfDate, publicationDateInJakarta, summarizeLinkedInPosts } from '../utils/linkedinWeeklySummary'

const router = useRouter()
const store = usePerformanceStore()
const pageHelp = {
  purpose: 'Enter metrics for each LinkedIn post and review automatic weekly summaries for a selected date range.',
  steps: [
    'In LinkedIn Content Matrix, select Add Metrics for a published post and copy its values from LinkedIn Analytics.',
    'Select a date range in Weekly LinkedIn Records to see totals calculated from published posts.',
    'Use Edit Metrics to correct a post; the weekly summary updates automatically.',
  ],
}
const rangeStart = ref('')
const rangeEnd = ref('')
const rangeInitialized = ref(false)
const postMetricModalOpen = ref(false)
const postMetricAttempted = ref(false)
const postMetricSaving = ref(false)
const postMetricError = ref('')
const selectedPublication = ref<BackendPublicationFeedItem | null>(null)
type PostMetricField = 'impressions' | 'impressionsInNetwork' | 'impressionsOutOfNetwork' | 'memberReached' | 'views' | 'followersGained' | 'profileViewers' | 'reactions' | 'comments'
const postMetricFields: Array<{ key: PostMetricField; label: string; unit: 'count' | 'percentage'; tooltip: string }> = [
  { key: 'impressions', label: 'Impression', unit: 'count', tooltip: 'Jumlah kali postingan ditampilkan di LinkedIn. Satu orang dapat menghasilkan lebih dari satu impresi.' },
  { key: 'impressionsInNetwork', label: 'Impression In Network (%)', unit: 'percentage', tooltip: 'Persentase impresi yang berasal dari pengikut atau koneksi Anda. Masukkan angka persennya, misalnya 62.5 untuk 62.5%.' },
  { key: 'impressionsOutOfNetwork', label: 'Impression Out of Network (%)', unit: 'percentage', tooltip: 'Persentase impresi dari orang di luar pengikut dan koneksi Anda. Masukkan angka persennya, misalnya 37.5 untuk 37.5%.' },
  { key: 'memberReached', label: 'Member Reached', unit: 'count', tooltip: 'Perkiraan jumlah anggota dan Halaman LinkedIn yang berbeda yang melihat postingan ini. Tayangan berulang dari akun yang sama tidak dihitung lagi.' },
  { key: 'views', label: 'Views', unit: 'count', tooltip: 'Jumlah penayangan video atau artikel yang ditampilkan LinkedIn untuk postingan ini. Berbeda dari Impression; kosongkan bila LinkedIn tidak menampilkan Views.' },
  { key: 'followersGained', label: 'Followers gained', unit: 'count', tooltip: 'Jumlah anggota yang mulai mengikuti akun Anda dari postingan ini.' },
  { key: 'profileViewers', label: 'Profile viewers', unit: 'count', tooltip: 'Jumlah anggota dan admin Halaman yang berbeda yang membuka profil Anda dari postingan ini.' },
  { key: 'reactions', label: 'Reactions', unit: 'count', tooltip: 'Jumlah reaksi yang diterima postingan ini, seperti Like, Celebrate, atau Support.' },
  { key: 'comments', label: 'Comments', unit: 'count', tooltip: 'Jumlah komentar yang diberikan anggota atau Halaman pada postingan ini.' },
]
const postMetricForm = reactive<Record<PostMetricField, string>>({ impressions: '', impressionsInNetwork: '', impressionsOutOfNetwork: '', memberReached: '', views: '', followersGained: '', profileViewers: '', reactions: '', comments: '' })
const weeklyColumns = [
  { key: 'period', label: 'Week' },
  { key: 'publishedPosts', label: 'Published Posts', align: 'right' as const },
  { key: 'postsWithMetrics', label: 'Posts with Metrics', align: 'right' as const },
  { key: 'impressions', label: 'Impression', align: 'right' as const },
  { key: 'impressionsInNetwork', label: 'In Network (%)', align: 'right' as const },
  { key: 'impressionsOutOfNetwork', label: 'Out of Network (%)', align: 'right' as const },
  { key: 'memberReached', label: 'Member Reached (sum)', align: 'right' as const },
  { key: 'views', label: 'Views', align: 'right' as const },
  { key: 'followersGained', label: 'Followers gained', align: 'right' as const },
  { key: 'profileViewers', label: 'Profile viewers', align: 'right' as const },
  { key: 'reactions', label: 'Reactions', align: 'right' as const },
  { key: 'comments', label: 'Comments', align: 'right' as const },
] satisfies TableColumn[]
const publicationColumns = [
  { key: 'content', label: 'Content' },
  { key: 'published', label: 'Published' },
  { key: 'impressions', label: 'Impression', align: 'right' as const },
  { key: 'impressionsInNetwork', label: 'Impression In Network (%)', align: 'right' as const },
  { key: 'impressionsOutOfNetwork', label: 'Impression Out of Network (%)', align: 'right' as const },
  { key: 'memberReached', label: 'Member Reached', align: 'right' as const },
  { key: 'views', label: 'Views', align: 'right' as const },
  { key: 'followersGained', label: 'Followers gained', align: 'right' as const },
  { key: 'profileViewers', label: 'Profile viewers', align: 'right' as const },
  { key: 'reactions', label: 'Reactions', align: 'right' as const },
  { key: 'comments', label: 'Comments', align: 'right' as const },
  { key: 'actions', label: 'Actions' },
] satisfies TableColumn[]
const linkedInPublications = computed(() => store.publications
  .filter((item) => item.publication.platform === 'linkedin')
  .map((item) => ({ ...item, id: item.publication.id })))
const weeklyRows = computed(() => summarizeLinkedInPosts(linkedInPublications.value, rangeStart.value, rangeEnd.value))
const totalPublishedPosts = computed(() => weeklyRows.value.reduce((sum, row) => sum + row.publishedPosts, 0))
const rangeError = computed(() => rangeStart.value && rangeEnd.value && rangeStart.value > rangeEnd.value ? 'Tanggal awal harus sebelum atau sama dengan tanggal akhir.' : '')
watch([linkedInPublications, () => store.supportingLoaded], ([publications, loaded]) => {
  if (rangeInitialized.value || !loaded) return
  const latestDate = publications.length
    ? publications.map((item) => publicationDateInJakarta(item.publication.publishedAt)).sort().at(-1)!
    : publicationDateInJakarta(new Date().toISOString())
  const latestMonday = mondayOfDate(latestDate)
  rangeStart.value = addDateDays(latestMonday, -21)
  rangeEnd.value = addDateDays(latestMonday, 6)
  rangeInitialized.value = true
}, { immediate: true })
const postMetricErrors = computed(() => {
  const errors: Record<string, string> = {}
  if (!postMetricAttempted.value) return errors
  let hasValue = false
  for (const { key, label, unit } of postMetricFields) {
    const value = postMetricForm[key]
    if (value === '') continue
    hasValue = true
    const number = Number(value)
    if (unit === 'percentage') {
      if (!Number.isFinite(number) || number < 0 || number > 100 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-8) errors[key] = `${label} harus 0–100 dengan maksimal dua angka desimal.`
    } else if (!Number.isSafeInteger(number) || number < 0) errors[key] = `${label} harus berupa bilangan bulat yang tidak negatif.`
  }
  if (!hasValue) errors.form = 'Enter at least one metric from LinkedIn Analytics.'
  return errors
})

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
function formatPeriod(start: string, end: string) { return `${formatDate(start)} – ${formatDate(end)}` }
function formatPostMetric(value: number | null | undefined) { return value === null || value === undefined ? 'Not available' : value.toLocaleString() }
function formatPostPercentage(value: number | null | undefined) { return value === null || value === undefined ? 'Not available' : `${value.toLocaleString()}%` }
function formatPublicationDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value)) }
function openPostMetricEditor(publication: BackendPublicationFeedItem) {
  selectedPublication.value = publication
  for (const { key } of postMetricFields) postMetricForm[key] = publication.postMetrics?.[key] == null ? '' : String(publication.postMetrics[key])
  postMetricAttempted.value = false
  postMetricError.value = ''
  postMetricModalOpen.value = true
}
async function savePostMetrics() {
  postMetricAttempted.value = true
  if (Object.keys(postMetricErrors.value).length || !selectedPublication.value) return
  postMetricSaving.value = true
  const input = Object.fromEntries(postMetricFields.map(({ key }) => [key, postMetricForm[key] === '' ? null : Number(postMetricForm[key])])) as Record<PostMetricField, number | null>
  const result = await store.saveLinkedInPublicationMetrics(selectedPublication.value.publication.id, input)
  postMetricSaving.value = false
  if (!result.success) { postMetricError.value = result.error; return }
  postMetricModalOpen.value = false
  selectedPublication.value = null
}

onMounted(() => { void store.loadSupportingData() })
</script>

<template>
  <div class="page-stack linkedin-metrics-page">
    <PageHeader title="LinkedIn Metrics" description="Record post metrics and review weekly summaries." :breadcrumbs="[{ label: 'Performance', to: '/performance' }, { label: 'LinkedIn Metrics' }]" :help="pageHelp">
      <template #actions><BaseButton variant="secondary" @click="router.push('/performance')"><AppIcon name="arrow-left" :size="16" />Back to Performance</BaseButton></template>
    </PageHeader>

    <InlineAlert v-if="store.supportingLoading" title="Loading metrics">Reading weekly metrics from the backend…</InlineAlert>
    <InlineAlert v-else-if="store.error" title="Metrics unavailable" tone="danger">{{ store.error }}</InlineAlert>

    <template v-if="store.supportingLoaded">
    <section class="metrics-summary" aria-label="LinkedIn metrics summary"><div><span>Data Source</span><strong>Post Analytics</strong></div><div><span>Weekly Target</span><strong>2 posts / week</strong></div><div><span>Weeks with Posts</span><strong>{{ weeklyRows.length }}</strong></div><div><span>Published Posts in Range</span><strong>{{ totalPublishedPosts.toLocaleString() }}</strong></div></section>

    <BaseCard title="LinkedIn Content Matrix" description="Enter post-level performance from LinkedIn Analytics for each published LinkedIn post. Saved values also appear in the Performance table."><template #actions><StatusBadge tone="info" dot>Manual per post</StatusBadge></template><div v-if="linkedInPublications.length" class="metrics-table-wrap"><BaseTable :columns="publicationColumns" :rows="linkedInPublications" caption="LinkedIn published content metrics">
      <template #cell-content="{ row }"><span class="publication-title"><strong>{{ row.content.title }}</strong></span></template>
      <template #cell-published="{ row }"><time :datetime="row.publication.publishedAt">{{ formatPublicationDate(row.publication.publishedAt) }}</time></template>
      <template #cell-impressions="{ row }">{{ formatPostMetric(row.postMetrics?.impressions) }}</template>
      <template #cell-impressionsInNetwork="{ row }">{{ formatPostPercentage(row.postMetrics?.impressionsInNetwork) }}</template>
      <template #cell-impressionsOutOfNetwork="{ row }">{{ formatPostPercentage(row.postMetrics?.impressionsOutOfNetwork) }}</template>
      <template #cell-memberReached="{ row }">{{ formatPostMetric(row.postMetrics?.memberReached) }}</template>
      <template #cell-views="{ row }">{{ formatPostMetric(row.postMetrics?.views) }}</template>
      <template #cell-followersGained="{ row }">{{ formatPostMetric(row.postMetrics?.followersGained) }}</template>
      <template #cell-profileViewers="{ row }">{{ formatPostMetric(row.postMetrics?.profileViewers) }}</template>
      <template #cell-reactions="{ row }">{{ formatPostMetric(row.postMetrics?.reactions) }}</template>
      <template #cell-comments="{ row }">{{ formatPostMetric(row.postMetrics?.comments) }}</template>
      <template #cell-actions="{ row }"><div class="record-actions"><StatusBadge v-if="row.postMetrics?.source === 'linkedin_manual'" tone="neutral">Entered</StatusBadge><BaseButton size="compact" :variant="row.postMetrics?.source === 'linkedin_manual' ? 'ghost' : 'secondary'" @click="openPostMetricEditor(row)">{{ row.postMetrics?.source === 'linkedin_manual' ? 'Edit Metrics' : 'Add Metrics' }}</BaseButton></div></template>
    </BaseTable></div><EmptyState v-else icon="chart" title="No published LinkedIn posts yet." description="Once a LinkedIn publication is recorded, you can enter its post metrics here." /></BaseCard>

    <BaseCard title="Weekly LinkedIn Records" description="Ringkasan otomatis dari LinkedIn Content Matrix untuk setiap minggu dalam rentang tanggal yang dipilih."><template #actions><StatusBadge tone="info" dot>Calculated from posts</StatusBadge></template>
      <div class="weekly-range" role="group" aria-label="Weekly LinkedIn date range"><BaseInput v-model="rangeStart" label="Start Date" type="date" /><BaseInput v-model="rangeEnd" label="End Date" type="date" /></div>
      <p v-if="rangeError" class="form-error" role="alert">{{ rangeError }}</p>
      <p class="form-guidance weekly-guidance">Jumlah dihitung dari nilai yang tersedia pada post dalam rentang tanggal. Persentase In/Out Network adalah rata-rata berbobot Impression. Member Reached adalah jumlah per post, sehingga orang yang melihat beberapa post dapat terhitung lebih dari sekali. Posts with Metrics menunjukkan berapa post yang sudah punya data; metrik yang kosong tidak dihitung. Performance Tracker menggunakan catatan akun mingguan yang tersimpan secara terpisah.</p>
      <div v-if="weeklyRows.length" class="metrics-table-wrap"><BaseTable :columns="weeklyColumns" :rows="weeklyRows" caption="LinkedIn weekly summaries from post metrics">
        <template #cell-period="{ row }"><time class="weekly-week-cell" :datetime="row.periodStart">{{ formatPeriod(row.periodStart, row.periodEnd) }}</time></template>
        <template #cell-publishedPosts="{ row }">{{ row.publishedPosts.toLocaleString() }}</template>
        <template #cell-postsWithMetrics="{ row }">{{ row.postsWithMetrics }} / {{ row.publishedPosts }}</template>
        <template #cell-impressions="{ row }">{{ formatPostMetric(row.impressions) }}</template>
        <template #cell-impressionsInNetwork="{ row }">{{ formatPostPercentage(row.impressionsInNetwork) }}</template>
        <template #cell-impressionsOutOfNetwork="{ row }">{{ formatPostPercentage(row.impressionsOutOfNetwork) }}</template>
        <template #cell-memberReached="{ row }">{{ formatPostMetric(row.memberReached) }}</template>
        <template #cell-views="{ row }">{{ formatPostMetric(row.views) }}</template>
        <template #cell-followersGained="{ row }">{{ formatPostMetric(row.followersGained) }}</template>
        <template #cell-profileViewers="{ row }">{{ formatPostMetric(row.profileViewers) }}</template>
        <template #cell-reactions="{ row }">{{ formatPostMetric(row.reactions) }}</template>
        <template #cell-comments="{ row }">{{ formatPostMetric(row.comments) }}</template>
      </BaseTable></div><EmptyState v-else icon="chart" title="No LinkedIn posts in this date range." description="Choose another date range or add metrics to published LinkedIn posts." />
    </BaseCard>
    </template>

    <BaseModal v-model="postMetricModalOpen" :title="selectedPublication?.postMetrics?.source === 'linkedin_manual' ? 'Edit LinkedIn Post Metrics' : 'Add LinkedIn Post Metrics'" :description="selectedPublication?.content.title" size="wide"><form class="metrics-form" @submit.prevent="savePostMetrics"><p class="form-guidance">Salin angka dari Analytics untuk postingan ini. Impression In Network dan Impression Out of Network diisi dalam persen (0–100), sedangkan field lain berisi jumlah. Arahkan ke ikon info di tiap field untuk melihat artinya. Kosongkan metrik yang tidak tersedia.</p><div class="metrics-form__grid"><BaseInput v-for="field in postMetricFields" :key="field.key" v-model="postMetricForm[field.key]" :label="field.label" :tooltip="field.tooltip" :hint="field.unit === 'percentage' ? 'Masukkan angka persen tanpa simbol %.' : undefined" type="number" min="0" :max="field.unit === 'percentage' ? 100 : undefined" :step="field.unit === 'percentage' ? '0.01' : '1'" :error="postMetricErrors[field.key]" /></div><p v-if="postMetricErrors.form" class="form-error" role="alert">{{ postMetricErrors.form }}</p><p v-if="postMetricError" class="form-error" role="alert">{{ postMetricError }}</p><div class="modal-actions"><BaseButton variant="ghost" type="button" :disabled="postMetricSaving" @click="postMetricModalOpen = false">Cancel</BaseButton><BaseButton type="submit" :disabled="postMetricSaving">{{ postMetricSaving ? 'Saving…' : 'Save Post Metrics' }}</BaseButton></div></form></BaseModal>
  </div>
</template>

<style scoped>
.linkedin-metrics-page { max-width: 1280px; }
.metrics-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-border); }
.metrics-summary > div { display: grid; gap: 6px; padding: 16px; background: var(--color-surface); }
.metrics-summary span { color: var(--color-subtle); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
.metrics-summary strong { font-size: 16px; }
.metrics-table-wrap { overflow-x: auto; }
.publication-title { display: inline-flex; max-width: 300px; }
.publication-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 148px; }
.record-actions :deep(.ui-badge) { min-width: 58px; justify-content: center; padding: 5px 8px; border-radius: 999px; font-size: 11px; line-height: 1.2; white-space: nowrap; }
.record-actions :deep(.ui-button) { min-width: 96px; justify-content: center; white-space: nowrap; }
.weekly-week-cell { white-space: nowrap; }
.weekly-range { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: 560px; margin-bottom: 14px; }
.weekly-guidance { margin-bottom: 16px; }
.metrics-form { display: grid; gap: 18px; }
.form-guidance { margin: 0; color: var(--color-muted); font-size: 12px; line-height: 1.55; }
.metrics-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.form-error { color: var(--color-danger); font-size: 12px; }
@media (max-width: 760px) { .metrics-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 540px) { .weekly-range, .metrics-form__grid { grid-template-columns: 1fr; } .metrics-summary { grid-template-columns: 1fr; } }
</style>
