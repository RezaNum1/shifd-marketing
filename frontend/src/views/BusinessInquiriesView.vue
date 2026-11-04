<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/app/PageHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseCard from '../components/ui/BaseCard.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import { errorMessage } from '../api/client'
import { createBusinessInquiry, listBusinessInquiries } from '../api/performance'
import { listProspects } from '../api/prospects'
import type { BackendBusinessInquiry } from '../types/backend'
import type { Prospect } from '../types/prospect'
import type { SelectOption } from '../types/ui'

const inquiries = ref<BackendBusinessInquiry[]>([])
const prospects = ref<Prospect[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const modalOpen = ref(false)
const relevanceFilter = ref('all')
const channelFilter = ref('all')
const form = ref(blank())

function localDateTime() {
  const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
function blank() { return { receivedAt: localDateTime(), channel: 'linkedin', companyName: '', prospectId: '', summary: '', relevance: 'unreviewed', source: 'Outbound reach', sourceReference: '', followUpNotes: '' } }
const pageHelp = { purpose: 'Record every business inquiry that comes back from outbound reach, then use the pattern to improve targeting and follow-up.', steps: ['Log the message with its source and context while it is fresh.', 'Review relevance and connect it to a prospect when possible.', 'Use the summary cards and weekly trend to understand which channels are creating demand.'] }
const channelOptions: SelectOption[] = [{ value: 'all', label: 'All channels' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'instagram', label: 'Instagram' }, { value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'website', label: 'Website' }, { value: 'phone', label: 'Phone' }, { value: 'other', label: 'Other' }]
const formChannels = channelOptions.slice(1)
const relevanceOptions: SelectOption[] = [{ value: 'all', label: 'All outcomes' }, { value: 'relevant', label: 'Relevant opportunity' }, { value: 'unreviewed', label: 'Needs review' }, { value: 'unrelated', label: 'Unrelated' }]
const prospectOptions = computed<SelectOption[]>(() => [{ value: '', label: 'No linked prospect' }, ...prospects.value.map((item) => ({ value: item.id, label: item.name }))])
const filtered = computed(() => inquiries.value.filter((item) => (relevanceFilter.value === 'all' || item.relevance === relevanceFilter.value) && (channelFilter.value === 'all' || item.channel === channelFilter.value)))
const relevantCount = computed(() => inquiries.value.filter((item) => item.relevance === 'relevant').length)
const reviewCount = computed(() => inquiries.value.filter((item) => item.relevance === 'unreviewed').length)
const responseRate = computed(() => inquiries.value.length ? Math.round((relevantCount.value / inquiries.value.length) * 100) : 0)
const channelBreakdown = computed(() => channelOptions.slice(1).map((option) => ({ ...option, count: inquiries.value.filter((item) => item.channel === option.value).length })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count))
const weekly = computed(() => {
  const map = new Map<string, number>()
  for (const item of inquiries.value) { const date = new Date(item.receivedAt); date.setDate(date.getDate() - date.getDay()); const key = date.toISOString().slice(0, 10); map.set(key, (map.get(key) ?? 0) + 1) }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, count]) => ({ week, count }))
})
const maxWeekly = computed(() => Math.max(1, ...weekly.value.map((item) => item.count)))
const weeklyAverage = computed(() => weekly.value.length ? (weekly.value.reduce((sum, item) => sum + item.count, 0) / weekly.value.length).toFixed(1) : '0')
function formatWeekLabel(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function formatWeekFull(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }

async function load() {
  loading.value = true; error.value = ''
  try { const [result, prospectResult] = await Promise.all([listBusinessInquiries(), listProspects(new URLSearchParams({ page: '1', limit: '100' }))]); inquiries.value = result.data; prospects.value = prospectResult.data }
  catch (reason) { error.value = errorMessage(reason, 'Business inquiries could not be loaded.') }
  finally { loading.value = false }
}
function openCreate() { form.value = blank(); notice.value = ''; modalOpen.value = true }
async function save() {
  saving.value = true; error.value = ''; notice.value = ''
  try { await createBusinessInquiry({ ...form.value, receivedAt: new Date(form.value.receivedAt).toISOString(), companyName: form.value.companyName || null, prospectId: form.value.prospectId || null, sourceReference: form.value.sourceReference || null, followUpNotes: form.value.followUpNotes || null }); modalOpen.value = false; notice.value = 'Inquiry recorded.'; await load() }
  catch (reason) { error.value = errorMessage(reason, 'Business inquiry could not be saved.') }
  finally { saving.value = false }
}
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
onMounted(() => { void load() })
</script>

<template>
  <div class="inquiries-page">
    <PageHeader title="Business Inquiries" description="Capture and understand business interest generated by your outbound reach." :help="pageHelp">
      <template #actions><BaseButton @click="openCreate"><AppIcon name="plus" :size="16" /> Record inquiry</BaseButton></template>
    </PageHeader>
    <p v-if="notice" class="inquiry-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="inquiry-error" role="alert">{{ error }}</p>

    <div class="inquiry-stats">
      <BaseCard><div class="stat"><span>Total inquiries</span><strong>{{ inquiries.length }}</strong><small>All recorded responses</small></div></BaseCard>
      <BaseCard><div class="stat stat--green"><span>Relevant opportunities</span><strong>{{ relevantCount }}</strong><small>Qualified as worth pursuing</small></div></BaseCard>
      <BaseCard><div class="stat stat--amber"><span>Needs review</span><strong>{{ reviewCount }}</strong><small>Not classified yet</small></div></BaseCard>
      <BaseCard><div class="stat stat--blue"><span>Opportunity rate</span><strong>{{ responseRate }}%</strong><small>Relevant inquiries of total</small></div></BaseCard>
    </div>

    <div class="inquiry-grid">
      <BaseCard title="Weekly response trend" description="Recorded inquiries from outbound reach, grouped by week.">
        <div v-if="weekly.length" class="trend-summary"><div><strong>{{ weekly.at(-1)?.count ?? 0 }}</strong><span>latest week</span></div><div><strong>{{ weeklyAverage }}</strong><span>average / week</span></div><small>{{ formatWeekLabel(weekly[0].week) }} – {{ formatWeekLabel(weekly.at(-1)!.week) }}</small></div>
        <div v-if="weekly.length" class="weekly-chart" role="img" aria-label="Weekly inquiry volume chart"><div v-for="item in weekly" :key="item.week" class="week-bar" :title="`${item.count} inquiries from week of ${formatWeekFull(item.week)}`"><strong>{{ item.count }}</strong><span :style="{ height: `${Math.max(8, item.count / maxWeekly * 100)}%` }" /><small>{{ formatWeekLabel(item.week) }}</small></div></div><p v-if="weekly.length" class="chart-axis-label">Week starting · {{ formatWeekFull(weekly[0].week) }} to {{ formatWeekFull(weekly.at(-1)!.week) }}</p>
        <div v-else class="chart-empty">Your weekly trend will appear after the first inquiry is recorded.</div>
      </BaseCard>
      <BaseCard title="Channel mix" description="Where responses are coming from.">
        <div v-if="channelBreakdown.length" class="channel-list"><div v-for="item in channelBreakdown" :key="item.value" class="channel-row"><span>{{ item.label }}</span><div><i :style="{ width: `${Math.max(8, item.count / Math.max(1, inquiries.length) * 100)}%` }" /></div><strong>{{ item.count }}</strong></div></div>
        <div v-else class="chart-empty">No channel data yet.</div>
      </BaseCard>
    </div>

    <BaseCard title="Inquiry log" description="Review the response context and decide what deserves a follow-up.">
      <template #actions><BaseSelect v-model="channelFilter" label="Channel" :options="channelOptions" size="compact" /><BaseSelect v-model="relevanceFilter" label="Outcome" :options="relevanceOptions" size="compact" /></template>
      <div class="inquiry-table-wrap"><table class="inquiry-table"><thead><tr><th>Date</th><th>Company / prospect</th><th>Channel</th><th>Inquiry</th><th>Outcome</th><th>Source</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id"><td>{{ formatDate(item.receivedAt) }}</td><td><strong>{{ item.companyName || item.prospect?.name || 'Unidentified company' }}</strong><small v-if="item.prospect?.industry">{{ item.prospect.industry }}</small></td><td><span class="channel-pill">{{ label(item.channel) }}</span></td><td><p>{{ item.summary }}</p><small v-if="item.followUpNotes">Follow-up: {{ item.followUpNotes }}</small></td><td><StatusBadge :tone="item.relevance === 'relevant' ? 'success' : item.relevance === 'unreviewed' ? 'warning' : 'neutral'">{{ label(item.relevance) }}</StatusBadge></td><td>{{ item.source }}</td></tr><tr v-if="!loading && !filtered.length"><td colspan="6" class="table-empty">No inquiries match the selected filters.</td></tr><tr v-if="loading"><td colspan="6" class="table-empty">Loading inquiries…</td></tr></tbody></table></div>
    </BaseCard>

    <BaseModal v-model="modalOpen" title="Record business inquiry" description="Capture the response while its source and context are still clear." size="wide"><form class="inquiry-form" @submit.prevent="save"><div class="form-grid"><BaseInput v-model="form.receivedAt" label="Received at" type="datetime-local" required /><BaseSelect v-model="form.channel" label="Channel" :options="formChannels" required /><BaseInput v-model="form.companyName" label="Company name" placeholder="As mentioned in the message" /><BaseSelect v-model="form.prospectId" label="Link prospect" :options="prospectOptions" /><BaseSelect v-model="form.relevance" label="Initial outcome" :options="relevanceOptions.slice(1)" required /><BaseInput v-model="form.source" label="Source / campaign" required placeholder="e.g. LinkedIn outbound sequence" /><BaseInput v-model="form.sourceReference" label="Reference link" type="url" placeholder="Optional URL" /><div class="form-wide"><BaseTextarea v-model="form.summary" label="What did they ask about?" :rows="4" required placeholder="Summarize the inquiry and the business need." /></div><div class="form-wide"><BaseTextarea v-model="form.followUpNotes" label="Follow-up notes" :rows="3" placeholder="Next action, owner, or timing." /></div></div><div class="modal-actions"><BaseButton variant="ghost" type="button" @click="modalOpen = false">Cancel</BaseButton><BaseButton type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save inquiry' }}</BaseButton></div></form></BaseModal>
  </div>
</template>

<style scoped>
.inquiries-page { max-width: 1280px; margin: 0 auto; padding-bottom: 48px; }
.inquiry-notice, .inquiry-error { margin: 0 0 16px; padding: 12px 16px; border-radius: 10px; font-size: 14px; }
.inquiry-notice { background: #ecfdf5; color: #047857; } .inquiry-error { background: #fef2f2; color: #b91c1c; }
.inquiry-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px; margin-bottom: 20px; }
.stat { display: grid; gap: 5px; } .stat span { color: #64748b; font-size: 13px; } .stat strong { color: #0f172a; font-size: 30px; letter-spacing: -.04em; } .stat small { color: #94a3b8; } .stat--green strong { color: #047857; } .stat--amber strong { color: #b45309; } .stat--blue strong { color: #1d4ed8; }
.inquiry-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; margin-bottom: 20px; } .trend-summary { display: flex; align-items: end; gap: 22px; padding: 4px 0 12px; border-bottom: 1px solid #e2e8f0; } .trend-summary div { display: grid; gap: 2px; } .trend-summary strong { color: #1e3a8a; font-size: 22px; } .trend-summary span, .trend-summary small { color: #64748b; font-size: 11px; } .trend-summary > small { margin-left: auto; } .weekly-chart { display: flex; align-items: end; gap: 14px; height: 190px; padding: 16px 4px 0; background: repeating-linear-gradient(to bottom, transparent 0, transparent 45px, #f1f5f9 46px); } .week-bar { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: end; height: 100%; gap: 6px; } .week-bar span { display: block; width: min(34px, 70%); min-height: 8px; border-radius: 7px 7px 3px 3px; background: linear-gradient(180deg, #60a5fa, #2563eb); } .week-bar strong { color: #1e3a8a; font-size: 12px; } .week-bar small { color: #64748b; font-size: 10px; white-space: nowrap; } .chart-empty { display: grid; place-items: center; min-height: 170px; color: #94a3b8; font-size: 14px; text-align: center; }
.chart-axis-label { margin: 8px 0 0; color: #64748b; font-size: 11px; text-align: center; }
.channel-list { display: grid; gap: 18px; padding: 14px 0; } .channel-row { display: grid; grid-template-columns: 90px 1fr 28px; gap: 10px; align-items: center; font-size: 13px; } .channel-row > div { height: 8px; overflow: hidden; border-radius: 99px; background: #e2e8f0; } .channel-row i { display: block; height: 100%; border-radius: inherit; background: #2563eb; } .channel-row strong { text-align: right; color: #0f172a; }
.inquiry-table-wrap { overflow-x: auto; } .inquiry-table { width: 100%; border-collapse: collapse; min-width: 840px; } .inquiry-table th { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-align: left; text-transform: uppercase; } .inquiry-table td { padding: 15px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px; vertical-align: top; } .inquiry-table td strong, .inquiry-table td small { display: block; } .inquiry-table td small { margin-top: 4px; color: #94a3b8; } .inquiry-table td p { max-width: 330px; margin: 0; line-height: 1.45; } .channel-pill { display: inline-flex; padding: 5px 9px; border-radius: 99px; background: #eff6ff; color: #1d4ed8; font-size: 12px; } .table-empty { padding: 40px !important; color: #94a3b8 !important; text-align: center; }
.inquiry-form { display: grid; gap: 20px; } .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .form-wide { grid-column: 1 / -1; } .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
@media (max-width: 900px) { .inquiry-stats { grid-template-columns: repeat(2, 1fr); } .inquiry-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .inquiry-stats { grid-template-columns: 1fr 1fr; gap: 10px; } .form-grid { grid-template-columns: 1fr; } .form-wide { grid-column: auto; } }
</style>
