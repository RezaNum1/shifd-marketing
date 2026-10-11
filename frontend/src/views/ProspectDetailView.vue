<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, getProspect, updateProspect, startProspectResearch, listProspectResearch, getProspectResearch, reviewProspectResearchClaim } from '../api/prospects'
import type { Prospect, ProspectInput, ProspectResearchRun, ProspectResearchHistoryItem } from '../types/prospect'

const route = useRoute(); const router = useRouter()
const prospect = ref<Prospect | null>(null)
type ProspectForm = { name: string; industry: string; website: string; address: string; employeeCount: string | number; employeeSize: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; status: string }
const editForm = ref<ProspectForm | null>(null)
const loading = ref(true); const saving = ref(false); const error = ref(''); const notice = ref('')
const research = ref<ProspectResearchRun | null>(null); const researchHistory = ref<ProspectResearchHistoryItem[]>([]); const researching = ref(false); const researchError = ref(''); const researchNote = ref<Record<string, string>>({}); const reviewing = ref<string | null>(null)
const statuses = [{ value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'customer', label: 'Customer' }, { value: 'disqualified', label: 'Disqualified' }]
async function load() {
  loading.value = true; error.value = ''
  try { const result = await getProspect(String(route.params.id)); prospect.value = result.data; const p = result.data; editForm.value = { name: p.name, industry: p.industry ?? '', website: p.website ?? '', address: p.address ?? '', employeeCount: p.employeeCount === null ? '' : String(p.employeeCount), employeeSize: p.employeeSize ?? '', contactName: p.contactName ?? '', contactEmail: p.contactEmail ?? '', contactPhone: p.contactPhone ?? '', notes: p.notes ?? '', status: p.status }; await loadResearch() }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be loaded.') }
  finally { loading.value = false }
}
async function loadResearch(runId?: string) {
  if (!prospect.value) return
  researchError.value = ''
  try {
    const history = await listProspectResearch(prospect.value.id); researchHistory.value = history.data
    const selected = runId ?? history.data[0]?.id
    research.value = selected ? (await getProspectResearch(prospect.value.id, selected)).data : null
  } catch (reason) { researchError.value = errorMessage(reason, 'Company research could not be loaded.') }
}
async function runResearch() {
  if (!prospect.value) return
  researching.value = true; researchError.value = ''
  try { const result = await startProspectResearch(prospect.value.id); research.value = result.data; await loadResearch(result.data.id) }
  catch (reason) { researchError.value = errorMessage(reason, 'Company research could not be completed.') }
  finally { researching.value = false }
}
async function reviewClaim(claimId: string, status: 'approved' | 'rejected') {
  if (!prospect.value || !research.value) return
  reviewing.value = claimId; researchError.value = ''
  try { await reviewProspectResearchClaim(prospect.value.id, claimId, status, researchNote.value[claimId]?.trim() || null); await loadResearch(research.value.id) }
  catch (reason) { researchError.value = errorMessage(reason, 'The claim review could not be saved.') }
  finally { reviewing.value = null }
}
async function save() {
  if (!prospect.value || !editForm.value) return
  saving.value = true; error.value = ''; notice.value = ''
  try { const { employeeCount, status, ...fields } = editForm.value; const result = await updateProspect(prospect.value.id, { ...fields, status: status as ProspectInput['status'], employeeCount: employeeCount === '' ? null : Number(employeeCount) }, prospect.value.version); prospect.value = result.data; notice.value = 'Prospect changes saved.'; await load() }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be saved.') }
  finally { saving.value = false }
}
async function archive() {
  if (!prospect.value || !confirm('Archive this prospect? Its record will be preserved.')) return
  saving.value = true; error.value = ''
  try { await archiveProspect(prospect.value.id, prospect.value.version); await router.push('/prospects') }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be archived.') }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <section class="prospect-detail">
    <RouterLink to="/prospects">← Back to prospects</RouterLink>
    <div v-if="loading" class="detail-message">Loading prospect…</div>
    <p v-else-if="error && !prospect" class="detail-error" role="alert">{{ error }}</p>
    <template v-else-if="prospect && editForm">
      <header><div><p class="eyebrow">Prospect · {{ prospect.source === 'excel_import' ? 'Excel import' : 'Manual entry' }}</p><h1>{{ prospect.name }}</h1><p>Created {{ new Date(prospect.createdAt).toLocaleDateString() }}</p></div><BaseButton variant="danger" :loading="saving" @click="archive">Archive</BaseButton></header>
      <p v-if="notice" class="detail-notice" role="status">{{ notice }}</p><p v-if="error" class="detail-error" role="alert">{{ error }}</p>
      <form class="prospect-form" @submit.prevent="save">
        <BaseInput v-model="editForm.name" label="Company name" required maxlength="240"/><BaseInput v-model="editForm.industry" label="Industry / sector"/><BaseInput v-model="editForm.website" label="Website" type="url"/><BaseInput v-model="editForm.address" label="Address"/><BaseInput :model-value="editForm.employeeCount" label="Approximate employee count" type="number" min="0" @update:model-value="editForm.employeeCount = String($event)"/><BaseInput v-model="editForm.employeeSize" label="Employee size"/><BaseInput v-model="editForm.contactName" label="Contact name"/><BaseInput v-model="editForm.contactEmail" label="Contact email" type="email"/><BaseInput v-model="editForm.contactPhone" label="Contact phone"/><BaseSelect v-model="editForm.status" label="Prospect status" :options="statuses"/><div class="form-wide"><BaseTextarea v-model="editForm.notes" label="Notes" :rows="5"/></div>
        <div class="form-wide actions"><BaseButton type="submit" :loading="saving">Save changes</BaseButton></div>
      </form>
      <section class="company-research" aria-labelledby="research-heading">
        <header class="research-header"><div><p class="eyebrow">Source-backed prospect research</p><h2 id="research-heading">Company Research</h2><p v-if="research">Last researched {{ new Date(research.researchedAt).toLocaleString() }}</p></div><BaseButton :loading="researching" @click="runResearch">{{ research ? 'Research Company Again' : 'Research Company' }}</BaseButton></header>
        <p v-if="researching" class="detail-message" role="status">Researching public sources…</p>
        <p v-if="researchError" class="detail-error" role="alert">{{ researchError }}</p>
        <p v-if="!research && !researching" class="detail-message">No company research yet. Start a research run to review public information and sources.</p>
        <template v-if="research">
          <article class="research-card"><h3>Research summary</h3><p>{{ research.summary || 'No summary was available.' }}</p><p class="identity-state">Summary text is assembled only from source-linked claims below.</p><p class="identity-state"><strong>{{ research.identityStatus === 'matched' ? 'Identity matched' : 'Identity confirmation needed' }}:</strong> {{ research.identityExplanation }}</p><p v-if="research.status === 'empty'">No sufficiently supported claims were found in this run.</p><ul v-if="research.limitations.length"><li v-for="limitation in research.limitations" :key="limitation">{{ limitation }}</li></ul></article>
          <section aria-labelledby="claim-heading"><h3 id="claim-heading">Facts and opportunities</h3><p class="review-note">Human review records that you reviewed a claim; it does not guarantee objective truth. Only approved sourced facts are intended for future outreach inputs.</p>
            <article v-for="claim in research.claims" :key="claim.id" class="claim-card">
              <p class="claim-label">{{ claim.claimType === 'hypothesis' ? 'Potential Opportunity — Not a Confirmed Company Problem' : 'Sourced fact' }} · {{ claim.category.replaceAll('_', ' ') }}</p><p>{{ claim.text }}</p>
              <div v-if="claim.sources.length" class="claim-evidence"><span>Evidence:</span> <a v-for="source in claim.sources" :key="source.id" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ({{ source.domain }})</a></div>
              <p v-else class="unverified">Not verified / insufficient evidence</p>
              <p class="review-status">Review: {{ claim.reviewStatus }}<span v-if="claim.reviewedAt"> · {{ new Date(claim.reviewedAt).toLocaleString() }}</span></p><p v-if="claim.reviewNote" class="review-note">Note: {{ claim.reviewNote }}</p>
              <template v-if="claim.reviewStatus === 'pending'"><label class="note-field">Review note <textarea v-model="researchNote[claim.id]" rows="2" maxlength="1200" /></label><div class="review-actions"><BaseButton :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'approved')">Approve</BaseButton><BaseButton variant="secondary" :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'rejected')">Reject</BaseButton></div></template>
            </article>
            <p v-if="research.claims.length === 0" class="detail-message">No sourced facts or opportunities are available for review.</p>
          </section>
          <section aria-labelledby="sources-heading"><h3 id="sources-heading">Research Sources</h3><p v-if="research.sources.length === 0" class="detail-message">No source evidence was returned.</p><ul v-else class="source-list"><li v-for="source in research.sources" :key="source.id"><strong>{{ source.title }}</strong><span>{{ source.publisher || source.domain }} · {{ source.sourceType === 'official' ? 'Official source' : 'External source' }} · Retrieved {{ new Date(source.retrievedAt).toLocaleDateString() }}</span><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.url }}</a><span>Related claims: {{ research.claims.filter((claim) => claim.sources.some((item) => item.id === source.id)).map((claim) => claim.text).join(' · ') || 'No accepted claim linked' }}</span></li></ul></section>
        </template>
        <section aria-labelledby="history-heading"><h3 id="history-heading">Research History</h3><p v-if="researchHistory.length === 0" class="detail-message">No previous research runs.</p><ul v-else class="history-list"><li v-for="run in researchHistory" :key="run.id"><button type="button" :aria-current="research?.id === run.id ? 'true' : undefined" @click="loadResearch(run.id)">{{ new Date(run.researchedAt).toLocaleString() }} · {{ run.status.replaceAll('_', ' ') }} · {{ run.identityStatus === 'matched' ? 'identity matched' : 'identity check needed' }}</button><span>{{ run.summary }}</span></li></ul></section>
      </section>
    </template>
  </section>
</template>

<style scoped>
.prospect-detail{display:grid;gap:24px}.prospect-detail>a{color:#356653;text-decoration:none}.prospect-detail header{display:flex;justify-content:space-between;align-items:center;gap:20px}.prospect-detail h1{font-size:32px;margin:5px 0}.prospect-detail header p{color:#687581;margin:0}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em}.prospect-form{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:900px}.form-wide{grid-column:1/-1}.actions{display:flex;justify-content:flex-end}.detail-notice{color:#186149}.detail-error{color:#a13c36}.detail-message{padding:32px;color:#687581}@media(max-width:700px){.prospect-detail header{align-items:flex-start;flex-direction:column}.prospect-form{grid-template-columns:1fr}.form-wide{grid-column:auto}}
.company-research{display:grid;gap:20px;border-top:1px solid #dce4df;padding-top:24px}.company-research h2{margin:4px 0;font-size:26px}.company-research h3{margin:0 0 12px}.research-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.research-card,.claim-card{border:1px solid #dce4df;border-radius:12px;padding:18px;background:#fff}.claim-card{margin-top:12px}.claim-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#356653;font-weight:700}.identity-state,.review-note,.review-status,.source-list span{color:#687581;font-size:14px}.claim-evidence{display:flex;gap:8px;flex-wrap:wrap}.claim-evidence a,.source-list a{color:#28664f;overflow-wrap:anywhere}.unverified{color:#8b5b1b}.note-field{display:grid;gap:6px;margin-top:12px}.note-field textarea{width:100%;border:1px solid #cbd6cf;border-radius:8px;padding:9px;font:inherit}.review-actions{display:flex;gap:10px;margin-top:10px}.source-list,.history-list{display:grid;gap:12px;list-style:none;padding:0}.source-list li,.history-list li{display:grid;gap:5px;border-bottom:1px solid #e4e9e6;padding:10px 0}.history-list button{justify-self:start;background:none;border:0;padding:0;color:#28664f;text-decoration:underline;cursor:pointer}.history-list button[aria-current="true"]{font-weight:700}@media(max-width:700px){.research-header{align-items:flex-start;flex-direction:column}}
</style>
