<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, getProspect, updateProspect, startProspectResearch, listProspectResearch, getProspectResearch, reviewProspectResearchClaim, listProspectEmailDrafts, getProspectEmailDraft, createProspectEmailDraft, updateProspectEmailDraft, archiveProspectEmailDraft, getProspectOutreachFacts, generateProspectEmailDraft, listProspectOutboundActivities, getProspectOutboundSummary, createProspectOutboundActivity, updateProspectOutboundActivity, completeProspectOutboundActivity, cancelProspectOutboundActivity, archiveProspectOutboundActivity } from '../api/prospects'
import type { Prospect, ProspectInput, ProspectResearchRun, ProspectResearchHistoryItem, ProspectEmailDraft, ProspectEmailDraftListItem, ProspectOutreachFact, OutboundActivity, OutboundActivityType, OutboundProvenance, ResponseClassification, OutboundSummary } from '../types/prospect'

const route = useRoute(); const router = useRouter()
const prospect = ref<Prospect | null>(null)
type ProspectForm = { name: string; industry: string; website: string; address: string; employeeCount: string | number; employeeSize: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; status: string }
const editForm = ref<ProspectForm | null>(null)
const loading = ref(true); const saving = ref(false); const error = ref(''); const notice = ref('')
const research = ref<ProspectResearchRun | null>(null); const researchHistory = ref<ProspectResearchHistoryItem[]>([]); const researching = ref(false); const researchError = ref(''); const researchNote = ref<Record<string, string>>({}); const reviewing = ref<string | null>(null)
const drafts = ref<ProspectEmailDraftListItem[]>([]); const draft = ref<ProspectEmailDraft | null>(null); const draftSubject = ref(''); const draftBody = ref(''); const draftError = ref(''); const factError = ref(''); const draftNotice = ref(''); const draftLoading = ref(false); const draftSaving = ref(false); const draftMode = ref<'manual' | 'ai' | ''>(''); const generatedId = ref<string | null>(null); const facts = ref<ProspectOutreachFact[]>([]); const selectedFactIds = ref<string[]>([])
const generation = ref({ objective: 'introduce_shifd_labs', offering: 'custom_web_application', tone: 'professional', language: 'English' as 'English' | 'Indonesian', customInstructions: '' })
const recipientChoice = ref('saved')
const recipientOptions = [{ value: 'saved', label: 'Use saved prospect contact' }, { value: 'none', label: 'No recipient contact' }]
const generatedClaims = ref<ProspectOutreachFact[]>([])
const activities = ref<OutboundActivity[]>([]); const activitySummary = ref<OutboundSummary | null>(null); const activityLoading = ref(false); const activitySaving = ref(false); const activityError = ref(''); const activityNotice = ref(''); const activityEditId = ref<string | null>(null)
const localDateTime = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
const activityForm = ref({ activityType: 'email_sent' as OutboundActivityType, occurredAt: localDateTime(), dueAt: localDateTime(), status: 'completed' as 'scheduled' | 'completed', provenance: '' as '' | OutboundProvenance, contactChoice: 'none', emailDraftId: '', subject: '', description: '', responseClassification: '' as '' | ResponseClassification, notes: '' })
const activityTypeOptions = [{ value: 'email_sent', label: 'Email sent' }, { value: 'follow_up', label: 'Follow-up planned' }, { value: 'reply_received', label: 'Reply received' }, { value: 'meeting', label: 'Meeting' }, { value: 'product_demonstration', label: 'Product demonstration' }, { value: 'other', label: 'Other interaction' }]
const provenanceOptions = [{ value: 'historical', label: 'Historical activity' }, { value: 'artifact_assisted', label: 'Artifact-assisted' }, { value: 'non_artifact_assisted', label: 'Not artifact-assisted' }]
const responseOptions = [{ value: '', label: 'Choose classification' }, { value: 'interested', label: 'Interested' }, { value: 'not_interested', label: 'Not interested' }, { value: 'requested_information', label: 'Requested more information' }, { value: 'follow_up_requested', label: 'Follow-up requested' }, { value: 'meeting_requested', label: 'Meeting requested' }, { value: 'other', label: 'Other' }]
const contactActivityOptions = [{ value: 'none', label: 'No contact' }, { value: 'saved', label: 'Use prospect saved contact' }]
const activityLabel = (type: OutboundActivityType) => activityTypeOptions.find((option) => option.value === type)?.label ?? type
const activityDateInput = (value: string | null) => { if (!value) return ''; const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
const eventTimestamp = (value: string) => value ? new Date(value).toISOString() : undefined
const activeDraftClaims = computed(() => draft.value?.researchClaims ?? generatedClaims.value)
const objectiveOptions = [{ value: 'introduce_shifd_labs', label: 'Introduce Shifd Labs' }, { value: 'introduce_service', label: 'Introduce a service' }, { value: 'introduce_shifd_approval', label: 'Introduce Shifd Approval' }, { value: 'explore_partnership', label: 'Explore a technology partnership' }, { value: 'follow_up', label: 'Follow up on previous outreach' }]
const offeringOptions = [{ value: 'custom_web_application', label: 'Custom web application development' }, { value: 'mobile_application', label: 'Mobile application development' }, { value: 'workflow_digitalization', label: 'Business workflow digitalization' }, { value: 'it_consultation', label: 'IT consultation' }, { value: 'shifd_approval', label: 'Shifd Approval' }]
const toneOptions = [{ value: 'professional', label: 'Professional' }, { value: 'consultative', label: 'Consultative' }, { value: 'friendly_professional', label: 'Friendly professional' }, { value: 'concise', label: 'Concise' }]
const languageOptions = [{ value: 'English', label: 'English' }, { value: 'Indonesian', label: 'Indonesian' }]
const statuses = [{ value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'customer', label: 'Customer' }, { value: 'disqualified', label: 'Disqualified' }]
async function load() {
  loading.value = true; error.value = ''
  try { const result = await getProspect(String(route.params.id)); prospect.value = result.data; const p = result.data; editForm.value = { name: p.name, industry: p.industry ?? '', website: p.website ?? '', address: p.address ?? '', employeeCount: p.employeeCount === null ? '' : String(p.employeeCount), employeeSize: p.employeeSize ?? '', contactName: p.contactName ?? '', contactEmail: p.contactEmail ?? '', contactPhone: p.contactPhone ?? '', notes: p.notes ?? '', status: p.status }; await Promise.all([loadResearch(), loadDrafts(), loadActivities()]) }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be loaded.') }
  finally { loading.value = false }
}
async function loadDrafts(openId?: string) {
  if (!prospect.value) return
  draftError.value = ''; factError.value = ''
  const [list, eligible] = await Promise.allSettled([listProspectEmailDrafts(prospect.value.id), getProspectOutreachFacts(prospect.value.id)])
  if (list.status === 'fulfilled') {
    drafts.value = list.value.data
    if (openId) await openDraft(openId)
  } else draftError.value = errorMessage(list.reason, 'Email drafts could not be loaded.')
  if (eligible.status === 'fulfilled') facts.value = eligible.value.data
  else { facts.value = []; factError.value = errorMessage(eligible.reason, 'Approved research facts could not be loaded. AI drafting can continue without them.') }
}
async function openDraft(id: string) {
  if (!prospect.value) return
  draftLoading.value = true; draftError.value = ''; draftNotice.value = ''; draftMode.value = ''
  try { const result = await getProspectEmailDraft(prospect.value.id, id); draft.value = result.data; draftSubject.value = result.data.subject; draftBody.value = result.data.body; generatedId.value = result.data.generation?.id ?? null; generatedClaims.value = result.data.researchClaims; selectedFactIds.value = result.data.researchClaims.map((claim) => claim.id); recipientChoice.value = result.data.recipientEmail || result.data.recipientName ? 'saved' : 'none' }
  catch (reason) { draftError.value = errorMessage(reason, 'Email draft could not be opened.') }
  finally { draftLoading.value = false }
}
function newManualDraft() { draft.value = null; draftMode.value = 'manual'; generatedId.value = null; generatedClaims.value = []; selectedFactIds.value = []; draftSubject.value = ''; draftBody.value = ''; draftError.value = ''; draftNotice.value = ''; recipientChoice.value = prospect.value?.contactEmail || prospect.value?.contactName ? 'saved' : 'none' }
function showAiForm() { newManualDraft(); draftMode.value = 'ai' }
function regenerateSavedDraft() {
  if (!draft.value) return
  const previous = draft.value
  generation.value = { objective: previous.objective, offering: previous.offering, tone: previous.tone, language: previous.language, customInstructions: '' }
  selectedFactIds.value = previous.researchClaims.filter((claim) => facts.value.some((eligible) => eligible.id === claim.id)).map((claim) => claim.id)
  draft.value = null; draftMode.value = 'ai'; generatedId.value = null; generatedClaims.value = []; draftSubject.value = ''; draftBody.value = ''; draftError.value = ''; draftNotice.value = ''
}
async function generateDraft() {
  if (!prospect.value) return
  draftSaving.value = true; draftError.value = ''; draftNotice.value = ''
  try { const result = await generateProspectEmailDraft(prospect.value.id, { ...generation.value, claimIds: selectedFactIds.value }); draftSubject.value = result.data.subject; draftBody.value = result.data.body; generatedId.value = result.data.generationId; generatedClaims.value = result.data.claims; draftNotice.value = 'AI draft generated. Review and edit it before saving.' }
  catch (reason) { draftError.value = errorMessage(reason, 'Email could not be generated.') }
  finally { draftSaving.value = false }
}
async function saveDraft() {
  if (!prospect.value || !draftSubject.value.trim() || !draftBody.value.trim()) { draftError.value = 'Enter both a subject and email body.'; return }
  draftSaving.value = true; draftError.value = ''; draftNotice.value = ''
  try {
    const contact = recipientChoice.value === 'saved' ? { recipientName: prospect.value.contactName, recipientEmail: prospect.value.contactEmail } : { recipientName: null, recipientEmail: null }
    const saved = draft.value
      ? await updateProspectEmailDraft(prospect.value.id, draft.value.id, { subject: draftSubject.value, body: draftBody.value, ...contact })
      : await createProspectEmailDraft(prospect.value.id, { subject: draftSubject.value, body: draftBody.value, ...contact, origin: generatedId.value ? 'ai' : 'manual', generationId: generatedId.value, claimIds: generatedId.value ? selectedFactIds.value : [], ...(generatedId.value ? { language: generation.value.language, tone: generation.value.tone, objective: generation.value.objective, offering: generation.value.offering } : {}) })
    draft.value = saved.data; draftSubject.value = saved.data.subject; draftBody.value = saved.data.body; draftNotice.value = 'Draft saved.'; await loadDrafts()
  } catch (reason) { draftError.value = errorMessage(reason, 'Email draft could not be saved.') }
  finally { draftSaving.value = false }
}
async function archiveDraft() {
  if (!prospect.value || !draft.value || !confirm('Archive this email draft?')) return
  draftSaving.value = true; draftError.value = ''
  try { await archiveProspectEmailDraft(prospect.value.id, draft.value.id); draft.value = null; draftMode.value = ''; draftSubject.value = ''; draftBody.value = ''; draftNotice.value = 'Draft archived.'; await loadDrafts() }
  catch (reason) { draftError.value = errorMessage(reason, 'Email draft could not be archived.') }
  finally { draftSaving.value = false }
}
async function copy(value: string, message: string) { try { await navigator.clipboard.writeText(value); draftNotice.value = message } catch { draftError.value = 'Clipboard access is unavailable in this browser.' } }
function copyFullEmail() { const recipient = draft.value?.recipientEmail || prospect.value?.contactEmail; void copy([recipient ? `To: ${recipient}` : '', `Subject: ${draftSubject.value}`, '', draftBody.value].filter(Boolean).join('\n'), 'Full email copied.') }
async function loadActivities() {
  if (!prospect.value) return
  activityLoading.value = true; activityError.value = ''
  try { const [list, summary] = await Promise.all([listProspectOutboundActivities(prospect.value.id), getProspectOutboundSummary(prospect.value.id)]); activities.value = list.data; activitySummary.value = summary.data }
  catch (reason) { activityError.value = errorMessage(reason, 'Outbound activities could not be loaded.') }
  finally { activityLoading.value = false }
}
function resetActivityForm(type: OutboundActivityType = 'email_sent') {
  activityEditId.value = null; activityForm.value = { activityType: type, occurredAt: localDateTime(), dueAt: localDateTime(), status: 'completed', provenance: '', contactChoice: 'none', emailDraftId: '', subject: '', description: '', responseClassification: '', notes: '' }; activityError.value = ''; activityNotice.value = ''
}
function recordDraftAsSent() {
  if (!draft.value) return
  resetActivityForm('email_sent'); activityForm.value.emailDraftId = draft.value.id; activityForm.value.subject = draft.value.subject
  document.getElementById('outbound-activities')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}
function editActivity(item: OutboundActivity) {
  activityEditId.value = item.id; activityError.value = ''; activityNotice.value = ''
  activityForm.value = { activityType: item.activityType, occurredAt: activityDateInput(item.occurredAt), dueAt: activityDateInput(item.dueAt), status: item.status === 'scheduled' ? 'scheduled' : 'completed', provenance: item.provenance, contactChoice: item.contactName || item.contactEmail ? 'saved' : 'none', emailDraftId: item.emailDraftId ?? '', subject: item.subject ?? '', description: item.description ?? '', responseClassification: item.responseClassification ?? '', notes: item.notes ?? '' }
}
async function saveActivity() {
  if (!prospect.value) return
  if (!activityForm.value.provenance) { activityError.value = 'Choose the activity provenance.'; return }
  if (activityForm.value.activityType !== 'follow_up' && !activityForm.value.occurredAt) { activityError.value = 'Enter the actual event date.'; return }
  if (activityForm.value.activityType === 'follow_up' && !activityForm.value.dueAt) { activityError.value = 'Enter the planned follow-up date.'; return }
  const contact = activityForm.value.contactChoice === 'saved' ? { contactName: prospect.value.contactName, contactEmail: prospect.value.contactEmail } : { contactName: null, contactEmail: null }
  const common = { ...contact, provenance: activityForm.value.provenance, notes: activityForm.value.notes || null }
  activitySaving.value = true; activityError.value = ''; activityNotice.value = ''
  try {
    if (activityEditId.value) {
      await updateProspectOutboundActivity(prospect.value.id, activityEditId.value, { ...common, ...(activityForm.value.activityType === 'follow_up' ? { dueAt: eventTimestamp(activityForm.value.dueAt) } : { occurredAt: eventTimestamp(activityForm.value.occurredAt) }), subject: activityForm.value.subject || null, description: activityForm.value.description || null, responseClassification: activityForm.value.responseClassification || null })
    } else {
      await createProspectOutboundActivity(prospect.value.id, { activityType: activityForm.value.activityType, ...common, ...(activityForm.value.activityType === 'follow_up' ? { dueAt: eventTimestamp(activityForm.value.dueAt) } : { occurredAt: eventTimestamp(activityForm.value.occurredAt) }), ...(activityForm.value.emailDraftId ? { emailDraftId: activityForm.value.emailDraftId } : {}), ...(activityForm.value.subject ? { subject: activityForm.value.subject } : {}), ...(activityForm.value.description ? { description: activityForm.value.description } : {}), ...(activityForm.value.responseClassification ? { responseClassification: activityForm.value.responseClassification } : {}), ...(['meeting', 'product_demonstration'].includes(activityForm.value.activityType) ? { status: activityForm.value.status } : {}) })
    }
    const savedNotice = activityEditId.value ? 'Activity updated.' : 'Activity recorded.'; resetActivityForm(); await loadActivities(); activityNotice.value = savedNotice
  } catch (reason) { activityError.value = errorMessage(reason, 'Activity could not be saved.') }
  finally { activitySaving.value = false }
}
async function changeActivity(item: OutboundActivity, action: 'complete' | 'cancel' | 'archive') {
  if (!prospect.value) return
  if (action === 'archive' && !confirm('Archive this activity from the timeline?')) return
  activityError.value = ''; activityNotice.value = ''
  try {
    if (action === 'complete') await completeProspectOutboundActivity(prospect.value.id, item.id)
    else if (action === 'cancel') await cancelProspectOutboundActivity(prospect.value.id, item.id)
    else await archiveProspectOutboundActivity(prospect.value.id, item.id)
    activityNotice.value = action === 'archive' ? 'Activity archived.' : action === 'complete' ? 'Follow-up completed.' : 'Activity cancelled.'; await loadActivities()
  } catch (reason) { activityError.value = errorMessage(reason, 'Activity could not be updated.') }
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
      <section class="outreach" aria-labelledby="outreach-heading">
        <header class="outreach-header"><div><p class="eyebrow">Personalized outbound email drafting</p><h2 id="outreach-heading">Outreach</h2></div><div class="outreach-actions"><BaseButton @click="newManualDraft">Manual Draft</BaseButton><BaseButton variant="secondary" @click="showAiForm">Generate with AI</BaseButton></div></header>
        <p v-if="draftError" class="detail-error" role="alert">{{ draftError }}</p><p v-if="draftNotice" class="detail-notice" role="status">{{ draftNotice }}</p>
        <div class="draft-layout">
          <section aria-label="Saved email drafts" class="draft-list"><h3>Saved drafts</h3><p v-if="drafts.length === 0" class="detail-message">No saved drafts for this prospect.</p><ul v-else><li v-for="item in drafts" :key="item.id"><button type="button" @click="openDraft(item.id)"><strong>{{ item.subject || '(No subject)' }}</strong><span>{{ item.origin === 'ai' ? 'AI-assisted' : 'Manual' }} · Updated {{ new Date(item.updatedAt).toLocaleString() }}</span></button></li></ul></section>
          <section class="draft-editor" aria-label="Email draft editor">
            <p v-if="draftLoading" class="detail-message" role="status">Loading draft…</p>
            <p v-else-if="!draft && !draftMode" class="detail-message">Choose Manual Draft or Generate with AI to begin. Drafts are never sent automatically.</p>
            <template v-else>
              <h3>{{ draft ? 'Edit email draft' : draftMode === 'ai' ? 'Generate personalized draft' : 'New manual draft' }}</h3>
              <form v-if="draftMode === 'ai' && !generatedId" class="generation-form" @submit.prevent="generateDraft">
                <BaseSelect v-model="generation.objective" label="Outreach objective" :options="objectiveOptions" />
                <BaseSelect v-model="generation.offering" label="Shifd Labs service or product" :options="offeringOptions" />
                <BaseSelect v-model="generation.tone" label="Tone" :options="toneOptions" />
                <BaseSelect v-model="generation.language" label="Language" :options="languageOptions" />
                <BaseTextarea v-model="generation.customInstructions" label="Optional guidance" :rows="3" maxlength="1500" />
                <fieldset class="fact-picker"><legend>Approved sourced facts (optional)</legend><p v-if="factError" role="alert">{{ factError }}</p><p v-else-if="facts.length === 0">No eligible approved facts. AI can still draft from the prospect profile.</p><label v-for="fact in facts" :key="fact.id"><input v-model="selectedFactIds" type="checkbox" :value="fact.id" :disabled="selectedFactIds.length >= 8 && !selectedFactIds.includes(fact.id)"><span>{{ fact.text }} <a v-for="source in fact.sources" :key="source.id" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ({{ source.domain }})</a></span></label></fieldset>
                <div><BaseButton type="submit" :loading="draftSaving">Generate email</BaseButton></div>
              </form>
              <p v-if="generatedId && !draft" class="detail-notice">Review and edit the generated content before saving.</p>
              <div v-if="draft || draftMode === 'manual' || generatedId" class="email-fields">
                <BaseSelect v-if="prospect.contactName || prospect.contactEmail" v-model="recipientChoice" label="Recipient contact" :options="recipientOptions" /><p v-if="recipientChoice === 'saved' && (prospect.contactName || prospect.contactEmail)" class="recipient-line">{{ prospect.contactName || 'Saved contact' }} <span v-if="prospect.contactEmail">({{ prospect.contactEmail }})</span></p>
                <BaseInput v-model="draftSubject" label="Email subject" maxlength="500" required />
                <BaseTextarea v-model="draftBody" label="Email body" :rows="12" maxlength="20000" required />
                <p v-if="activeDraftClaims.length" class="evidence-label">Approved research references used</p>
                <ul v-if="activeDraftClaims.length" class="draft-evidence"><li v-for="claim in activeDraftClaims" :key="claim.id"><span>{{ claim.reviewStatus === 'approved' ? 'Approved sourced fact · human reviewed' : 'Research claim status changed · review before reuse' }}</span><p>{{ claim.text }}</p><a v-for="source in claim.sources" :key="source.id" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ({{ source.domain }})</a></li></ul>
                <div class="editor-actions"><BaseButton @click="saveDraft" :loading="draftSaving">{{ draft ? 'Save changes' : 'Save draft' }}</BaseButton><BaseButton variant="secondary" @click="copy(draftSubject, 'Subject copied.')">Copy subject</BaseButton><BaseButton variant="secondary" @click="copy(draftBody, 'Body copied.')">Copy body</BaseButton><BaseButton variant="secondary" @click="copyFullEmail">Copy full email</BaseButton><BaseButton v-if="draft && draft.status === 'draft'" variant="secondary" @click="recordDraftAsSent">Record as sent</BaseButton><BaseButton v-if="draft" variant="danger" @click="archiveDraft" :loading="draftSaving">Archive draft</BaseButton><BaseButton v-if="draft?.origin === 'ai'" variant="secondary" @click="regenerateSavedDraft">Regenerate as a new draft</BaseButton><BaseButton v-if="draftMode === 'ai' && generatedId" variant="secondary" @click="generatedId = null; generatedClaims = []; draftSubject = ''; draftBody = ''">Regenerate</BaseButton></div>
                <p v-if="draft" class="draft-meta">{{ draft.origin === 'ai' ? 'AI-assisted draft' : 'Manual draft' }} · Saved {{ new Date(draft.updatedAt).toLocaleString() }} · Created by {{ draft.createdBy }}</p>
              </div>
            </template>
          </section>
        </div>
        <p class="draft-disclaimer">Drafting and copying do not record an email as sent. Sending remains a manual action outside Shifd Marketing.</p>
      </section>
      <section id="outbound-activities" class="outbound-activities" aria-labelledby="activities-heading">
        <header class="outbound-header"><div><p class="eyebrow">Manual outreach record</p><h2 id="activities-heading">Outbound Activities</h2></div><BaseButton variant="secondary" @click="resetActivityForm()">Record activity</BaseButton></header>
        <p class="draft-disclaimer">Only record events that actually happened. Activity records do not verify email delivery. A planned follow-up remains pending until completed.</p>
        <p v-if="activityError" class="detail-error" role="alert">{{ activityError }}</p><p v-if="activityNotice" class="detail-notice" role="status">{{ activityNotice }}</p>
        <div v-if="activitySummary" class="activity-summary" aria-label="Outreach summary">
          <article><strong>{{ activitySummary.emailsSent }}</strong><span>Emails sent</span></article><article><strong>{{ activitySummary.followUpsCompleted }}</strong><span>Follow-ups completed</span></article><article><strong>{{ activitySummary.repliesReceived }}</strong><span>Replies</span></article><article><strong>{{ activitySummary.interestedResponses }}</strong><span>Interested</span></article><article><strong>{{ activitySummary.meetings }}</strong><span>Meetings</span></article><article><strong>{{ activitySummary.demonstrations }}</strong><span>Demonstrations</span></article><article><strong>{{ activitySummary.pendingFollowUps }}</strong><span>Pending follow-ups · {{ activitySummary.overdueFollowUps }} overdue</span></article><article><strong>{{ activitySummary.lastInteractionAt ? new Date(activitySummary.lastInteractionAt).toLocaleDateString() : '—' }}</strong><span>Last interaction</span></article>
        </div>
        <form class="activity-form" @submit.prevent="saveActivity">
          <h3>{{ activityEditId ? 'Edit activity' : 'Record an activity' }}</h3>
          <BaseSelect v-model="activityForm.activityType" label="Activity type" :options="activityTypeOptions" :disabled="Boolean(activityEditId)" />
          <BaseInput v-if="activityForm.activityType === 'follow_up'" v-model="activityForm.dueAt" label="Planned follow-up date" type="datetime-local" required />
          <BaseInput v-else v-model="activityForm.occurredAt" label="Actual event date" type="datetime-local" required />
          <BaseSelect v-if="['meeting', 'product_demonstration'].includes(activityForm.activityType) && !activityEditId" v-model="activityForm.status" label="Meeting/demo status" :options="[{value:'scheduled',label:'Scheduled'},{value:'completed',label:'Completed'}]" />
          <BaseSelect v-if="prospect.contactName || prospect.contactEmail" v-model="activityForm.contactChoice" label="Contact" :options="contactActivityOptions" />
          <BaseSelect v-if="activityForm.activityType === 'email_sent' && !activityEditId" v-model="activityForm.emailDraftId" label="Linked saved draft (optional)" :options="[{value:'',label:'No linked draft'}, ...drafts.filter(item => item.status === 'draft').map(item => ({value:item.id,label:item.subject || '(No subject)'}))]" />
          <BaseInput v-if="activityForm.activityType === 'email_sent'" v-model="activityForm.subject" label="Email subject" maxlength="500" required />
          <BaseSelect v-if="activityForm.activityType === 'reply_received'" v-model="activityForm.responseClassification" label="Response classification" :options="responseOptions" />
          <BaseInput v-if="activityForm.activityType === 'other'" v-model="activityForm.description" label="Interaction description" maxlength="1000" required />
          <BaseSelect v-model="activityForm.provenance" label="Activity provenance" :options="[{value:'',label:'Choose provenance'}, ...provenanceOptions]" />
          <BaseTextarea v-model="activityForm.notes" label="Notes" :rows="3" maxlength="5000" />
          <div class="editor-actions"><BaseButton type="submit" :loading="activitySaving">{{ activityEditId ? 'Save activity changes' : activityForm.activityType === 'follow_up' ? 'Schedule follow-up' : 'Record activity' }}</BaseButton><BaseButton v-if="activityEditId" type="button" variant="secondary" @click="resetActivityForm()">Cancel edit</BaseButton></div>
        </form>
        <section class="activity-timeline" aria-label="Activity timeline"><h3>Activity timeline</h3><p v-if="activityLoading" class="detail-message" role="status">Loading outbound activities…</p><p v-else-if="!activities.length" class="detail-message">No outbound activities recorded for this prospect.</p><ol v-else><li v-for="item in activities" :key="item.id" :class="{'overdue-follow-up': item.activityType === 'follow_up' && item.status === 'pending' && item.dueAt && new Date(item.dueAt) < new Date()}">
          <div class="timeline-title"><span class="activity-badge">{{ activityLabel(item.activityType) }}</span><strong>{{ item.activityType === 'follow_up' ? item.status : item.status === 'scheduled' ? 'scheduled' : item.activityType === 'meeting' || item.activityType === 'product_demonstration' ? item.status : item.responseClassification?.replaceAll('_', ' ') || '' }}</strong><time>{{ new Date(item.activityType === 'follow_up' && item.status === 'pending' ? item.dueAt! : item.occurredAt!).toLocaleString() }}</time></div>
          <p v-if="item.subject"><strong>Subject:</strong> {{ item.subject }}</p><p v-if="item.description">{{ item.description }}</p><p v-if="item.contactName || item.contactEmail">Contact: {{ item.contactName || item.contactEmail }} <span v-if="item.contactName && item.contactEmail">({{ item.contactEmail }})</span></p>
          <p v-if="item.emailDraft">Linked draft: {{ item.emailDraft.subject }} · {{ item.emailDraft.origin === 'ai' ? 'AI-assisted' : 'Manual' }}. This does not verify delivery.</p><p v-if="item.notes">{{ item.notes }}</p><p class="activity-meta">{{ item.provenance.replaceAll('_', ' ') }} · Recorded {{ new Date(item.createdAt).toLocaleString() }} by {{ item.creator.name }}</p><p v-if="item.activityType === 'follow_up' && item.status === 'pending' && item.dueAt && new Date(item.dueAt) < new Date()" class="overdue-label">Overdue follow-up</p>
          <div class="editor-actions"><BaseButton variant="secondary" @click="editActivity(item)">Edit</BaseButton><BaseButton v-if="item.status === 'pending' || item.status === 'scheduled'" @click="changeActivity(item, 'complete')">Mark completed</BaseButton><BaseButton v-if="item.status === 'pending' || item.status === 'scheduled'" variant="secondary" @click="changeActivity(item, 'cancel')">Cancel</BaseButton><BaseButton variant="danger" @click="changeActivity(item, 'archive')">Archive</BaseButton></div>
        </li></ol></section>
      </section>
    </template>
  </section>
</template>

<style scoped>
.prospect-detail{display:grid;gap:24px}.prospect-detail>a{color:#356653;text-decoration:none}.prospect-detail header{display:flex;justify-content:space-between;align-items:center;gap:20px}.prospect-detail h1{font-size:32px;margin:5px 0}.prospect-detail header p{color:#687581;margin:0}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em}.prospect-form{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:900px}.form-wide{grid-column:1/-1}.actions{display:flex;justify-content:flex-end}.detail-notice{color:#186149}.detail-error{color:#a13c36}.detail-message{padding:32px;color:#687581}@media(max-width:700px){.prospect-detail header{align-items:flex-start;flex-direction:column}.prospect-form{grid-template-columns:1fr}.form-wide{grid-column:auto}}
.company-research{display:grid;gap:20px;border-top:1px solid #dce4df;padding-top:24px}.company-research h2{margin:4px 0;font-size:26px}.company-research h3{margin:0 0 12px}.research-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.research-card,.claim-card{border:1px solid #dce4df;border-radius:12px;padding:18px;background:#fff}.claim-card{margin-top:12px}.claim-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#356653;font-weight:700}.identity-state,.review-note,.review-status,.source-list span{color:#687581;font-size:14px}.claim-evidence{display:flex;gap:8px;flex-wrap:wrap}.claim-evidence a,.source-list a{color:#28664f;overflow-wrap:anywhere}.unverified{color:#8b5b1b}.note-field{display:grid;gap:6px;margin-top:12px}.note-field textarea{width:100%;border:1px solid #cbd6cf;border-radius:8px;padding:9px;font:inherit}.review-actions{display:flex;gap:10px;margin-top:10px}.source-list,.history-list{display:grid;gap:12px;list-style:none;padding:0}.source-list li,.history-list li{display:grid;gap:5px;border-bottom:1px solid #e4e9e6;padding:10px 0}.history-list button{justify-self:start;background:none;border:0;padding:0;color:#28664f;text-decoration:underline;cursor:pointer}.history-list button[aria-current="true"]{font-weight:700}@media(max-width:700px){.research-header{align-items:flex-start;flex-direction:column}}
.outreach{display:grid;gap:18px;border-top:1px solid #dce4df;padding-top:24px}.outreach h2{margin:4px 0;font-size:26px}.outreach h3{margin:0 0 12px}.outreach-header,.outreach-actions,.editor-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.draft-layout{display:grid;grid-template-columns:minmax(220px, .8fr) minmax(0, 1.7fr);gap:24px}.draft-list,.draft-editor{border:1px solid #dce4df;border-radius:12px;padding:18px;background:#fff}.draft-list ul,.draft-evidence{list-style:none;padding:0;display:grid;gap:10px}.draft-list li button{width:100%;display:grid;gap:5px;text-align:left;border:1px solid #e0e7e2;border-radius:8px;padding:12px;background:#fff;color:inherit;cursor:pointer}.draft-list li button span,.draft-meta,.draft-disclaimer,.recipient-line{color:#687581;font-size:13px}.generation-form,.email-fields{display:grid;gap:16px}.fact-picker{display:grid;gap:12px;border:1px solid #dce4df;border-radius:8px;padding:14px}.fact-picker label{display:flex;align-items:flex-start;gap:9px}.fact-picker label span{display:grid;gap:4px}.fact-picker a,.draft-evidence a{color:#28664f;overflow-wrap:anywhere;font-size:13px}.draft-evidence li{border-left:3px solid #7ea28d;padding:4px 10px}.draft-evidence p{margin:6px 0}.draft-evidence span,.evidence-label{font-size:13px;color:#356653;font-weight:700}.draft-disclaimer{margin:0}@media(max-width:760px){.draft-layout{grid-template-columns:1fr}.outreach-header{align-items:flex-start}}
.outbound-activities{display:grid;gap:18px;border-top:1px solid #dce4df;padding-top:24px;scroll-margin-top:24px}.outbound-activities h2{margin:4px 0;font-size:26px}.outbound-activities h3{margin:0 0 12px}.outbound-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.activity-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.activity-summary article{display:grid;gap:5px;border:1px solid #dce4df;border-radius:10px;background:#fff;padding:14px}.activity-summary strong{font-size:22px;color:#244f3e}.activity-summary span,.activity-meta{font-size:12px;color:#687581}.activity-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;border:1px solid #dce4df;border-radius:12px;background:#fff;padding:18px}.activity-form h3,.activity-form .editor-actions{grid-column:1/-1}.activity-timeline ol{list-style:none;padding:0;margin:0;display:grid;gap:12px}.activity-timeline li{border:1px solid #dce4df;border-radius:10px;padding:16px;background:#fff}.timeline-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.timeline-title time{margin-left:auto;color:#687581;font-size:13px}.activity-badge{border-radius:999px;background:#e8f0eb;color:#285540;padding:4px 9px;font-size:12px;font-weight:700}.activity-meta{margin-top:12px}.overdue-follow-up{border-color:#c87a56!important}.overdue-label{font-weight:700;color:#a13c36}@media(max-width:700px){.activity-form{grid-template-columns:1fr}.activity-form h3,.activity-form .editor-actions{grid-column:auto}.timeline-title time{margin-left:0}}
</style>
