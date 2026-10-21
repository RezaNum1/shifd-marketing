<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeaderHelp from '../components/app/PageHeaderHelp.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, getProspect, updateProspect, startProspectResearch, listProspectResearch, getProspectResearch, reviewProspectResearchClaim, listProspectEmailDrafts, getProspectEmailDraft, createProspectEmailDraft, updateProspectEmailDraft, archiveProspectEmailDraft, createProspectEmailDraftShare, listProspectEmailDraftFeedback, getProspectOutreachFacts, generateProspectEmailDraft, listProspectOutboundActivities, getProspectOutboundSummary, createProspectOutboundActivity, updateProspectOutboundActivity, completeProspectOutboundActivity, cancelProspectOutboundActivity, archiveProspectOutboundActivity } from '../api/prospects'
import type { Prospect, ProspectInput, ProspectResearchRun, ProspectResearchHistoryItem, ProspectEmailDraft, ProspectEmailDraftListItem, ProspectEmailDraftFeedback, ProspectOutreachFact, OutboundActivity, OutboundActivityType, OutboundProvenance, ResponseClassification, OutboundSummary } from '../types/prospect'

const route = useRoute(); const router = useRouter()
const pageHelp = {
  purpose: 'Maintain one organization record and manage the research and outreach history associated with it.',
  steps: ['Update the company or contact information, then save your changes.', 'Use Company Research to gather and review source-backed information.', 'Create an outreach draft or record an activity as it happens.'],
}
const prospect = ref<Prospect | null>(null)
type ProspectForm = { name: string; industry: string; website: string; address: string; employeeCount: string | number; employeeSize: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; status: string }
const editForm = ref<ProspectForm | null>(null)
const loading = ref(true); const saving = ref(false); const error = ref(''); const notice = ref('')
const research = ref<ProspectResearchRun | null>(null); const researchHistory = ref<ProspectResearchHistoryItem[]>([]); const researching = ref(false); const researchError = ref(''); const researchNote = ref<Record<string, string>>({}); const reviewing = ref<string | null>(null)
const researchResultsOpen = ref(false)
const drafts = ref<ProspectEmailDraftListItem[]>([]); const draft = ref<ProspectEmailDraft | null>(null); const draftSubject = ref(''); const draftBody = ref(''); const draftError = ref(''); const factError = ref(''); const draftNotice = ref(''); const draftLoading = ref(false); const draftSaving = ref(false); const draftMode = ref<'manual' | 'ai' | ''>(''); const generatedId = ref<string | null>(null); const facts = ref<ProspectOutreachFact[]>([]); const selectedFactIds = ref<string[]>([])
const generation = ref({ objective: 'introduce_shifd_labs', offering: 'custom_web_application', tone: 'professional', language: 'English' as 'English' | 'Indonesian', customInstructions: '' })
const recipientChoice = ref('saved')
const sharingDraftId = ref<string | null>(null)
const sharedDraftUrl = ref('')
const draftFeedback = ref<ProspectEmailDraftFeedback[]>([])
const draftFeedbackError = ref('')
const recipientOptions = [{ value: 'saved', label: 'Use saved prospect contact' }, { value: 'none', label: 'No recipient contact' }]
const generatedClaims = ref<ProspectOutreachFact[]>([])
const activities = ref<OutboundActivity[]>([]); const activitySummary = ref<OutboundSummary | null>(null); const activityLoading = ref(false); const activitySaving = ref(false); const activityError = ref(''); const activityNotice = ref(''); const activityEditId = ref<string | null>(null)
const localDateTime = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
const activityForm = ref({ activityType: 'email_sent' as OutboundActivityType, occurredAt: localDateTime(), dueAt: localDateTime(), status: 'completed' as 'scheduled' | 'completed', provenance: '' as '' | OutboundProvenance, contactChoice: 'none', emailDraftId: '', subject: '', description: '', responseClassification: '' as '' | ResponseClassification, notes: '' })
const activityTypeOptions = [
  { value: 'email_sent', label: 'Email sent', description: 'Record an email that was actually sent to this prospect.' },
  { value: 'follow_up', label: 'Follow-up', description: 'Create a reminder to contact this prospect again later.' },
  { value: 'reply_received', label: 'Reply received', description: 'Record a reply that was actually received from this prospect.' },
  { value: 'meeting', label: 'Meeting', description: 'Record a meeting with this prospect, whether scheduled or completed.' },
  { value: 'product_demonstration', label: 'Product demo', description: 'Record a product demo that is scheduled or has taken place.' },
  { value: 'other', label: 'Other interaction', description: 'Record another communication or interaction not covered above.' },
]
const provenanceOptions = [
  { value: 'historical', label: 'Previous activity', description: 'This activity took place before it was recorded in Shifd Marketing.' },
  { value: 'artifact_assisted', label: 'Used Shifd materials', description: 'This activity used an email draft or research saved in Shifd Marketing.' },
  { value: 'non_artifact_assisted', label: 'No Shifd materials used', description: 'This activity did not use an email draft or research from Shifd Marketing.' },
]
const responseOptions = [
  { value: '', label: 'Select a reply type', description: 'Choose the summary that best matches the reply.' },
  { value: 'interested', label: 'Interested', description: 'The prospect expressed interest in learning more or discussing the service.' },
  { value: 'not_interested', label: 'Not interested', description: 'The prospect said they do not want to continue the discussion.' },
  { value: 'requested_information', label: 'Requested information', description: 'The prospect requested more details or materials.' },
  { value: 'follow_up_requested', label: 'Requested a follow-up', description: 'The prospect asked to be contacted again later.' },
  { value: 'meeting_requested', label: 'Requested a meeting', description: 'The prospect requested or agreed to a meeting.' },
  { value: 'other', label: 'Other reply', description: 'Use this when the reply does not match the options above.' },
]
const contactActivityOptions = [
  { value: 'none', label: 'No related contact', description: 'Record this activity without associating a contact name or email.' },
  { value: 'saved', label: 'Use saved contact', description: 'Include the contact name and email from the prospect profile in this activity.' },
]
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
  draftLoading.value = true; draftError.value = ''; draftNotice.value = ''; draftFeedbackError.value = ''; draftMode.value = ''
  try { const result = await getProspectEmailDraft(prospect.value.id, id); draft.value = result.data; draftSubject.value = result.data.subject; draftBody.value = result.data.body; generatedId.value = result.data.generation?.id ?? null; generatedClaims.value = result.data.researchClaims; selectedFactIds.value = result.data.researchClaims.map((claim) => claim.id); recipientChoice.value = result.data.recipientEmail || result.data.recipientName ? 'saved' : 'none'; try { draftFeedback.value = (await listProspectEmailDraftFeedback(prospect.value.id, id)).data } catch (reason) { draftFeedback.value = []; draftFeedbackError.value = errorMessage(reason, 'Draft feedback could not be loaded.') } }
  catch (reason) { draftError.value = errorMessage(reason, 'Email draft could not be opened.') }
  finally { draftLoading.value = false }
}
function newManualDraft() { draft.value = null; draftFeedback.value = []; draftFeedbackError.value = ''; draftMode.value = 'manual'; generatedId.value = null; generatedClaims.value = []; selectedFactIds.value = []; draftSubject.value = ''; draftBody.value = ''; draftError.value = ''; draftNotice.value = ''; recipientChoice.value = prospect.value?.contactEmail || prospect.value?.contactName ? 'saved' : 'none' }
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
async function shareDraft(item: ProspectEmailDraftListItem) {
  if (!prospect.value) return
  sharingDraftId.value = item.id; draftError.value = ''; draftNotice.value = ''; sharedDraftUrl.value = ''
  try {
    const result = await createProspectEmailDraftShare(prospect.value.id, item.id)
    const url = new URL(router.resolve({ name: 'public-email-draft', params: { token: result.data.token } }).href, window.location.origin).toString()
    sharedDraftUrl.value = url
    try { await navigator.clipboard.writeText(url); draftNotice.value = 'Stable view-only link copied. Anyone with the link can view this draft.' }
    catch { draftNotice.value = 'Stable view-only link created. Copy it from the link shown below.' }
  } catch (reason) { draftError.value = errorMessage(reason, 'Share link could not be created or copied.') }
  finally { sharingDraftId.value = null }
}
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
    <div v-if="loading" class="detail-message">Loading prospect…</div>
    <p v-else-if="error && !prospect" class="detail-error" role="alert">{{ error }}</p>
    <template v-else-if="prospect && editForm">
      <RouterLink class="detail-back" to="/prospects">← All prospects</RouterLink>
      <header class="detail-header">
        <div class="detail-heading">
          <p class="eyebrow">Prospect details <span aria-hidden="true">·</span> {{ prospect.source === 'excel_import' ? 'Imported from Excel' : 'Added manually' }}</p>
          <div class="prospect-detail-title-row"><h1>{{ prospect.name }}</h1><PageHeaderHelp :help="pageHelp" /></div>
          <div class="detail-meta"><span class="detail-status">{{ prospect.status }}</span><span>Added {{ new Date(prospect.createdAt).toLocaleDateString() }}</span><a v-if="prospect.website" :href="prospect.website" target="_blank" rel="noopener noreferrer">{{ prospect.website }}</a></div>
        </div>
        <BaseButton variant="danger" :loading="saving" @click="archive">Archive prospect</BaseButton>
      </header>
      <p v-if="notice" class="detail-notice" role="status">{{ notice }}</p><p v-if="error" class="detail-error" role="alert">{{ error }}</p>
      <form class="prospect-form detail-panel" @submit.prevent="save">
        <div class="panel-heading form-heading"><div class="section-heading"><span class="section-heading-icon" aria-hidden="true"><AppIcon name="company" :size="17" /></span><div class="section-heading-copy"><p class="eyebrow">Organization record</p><h2>Company profile</h2></div><p class="section-heading-detail">Keep the company and contact details up to date.</p></div><BaseButton type="submit" :loading="saving">Save changes</BaseButton></div>
        <section class="profile-group" aria-labelledby="company-info-heading">
          <h3 id="company-info-heading">Company information</h3>
          <div class="profile-fields"><BaseInput v-model="editForm.name" label="Company name" required maxlength="240"/><BaseInput v-model="editForm.industry" label="Industry / sector"/><BaseInput v-model="editForm.website" label="Website" type="url"/><BaseInput v-model="editForm.address" label="Address"/><BaseInput :model-value="editForm.employeeCount" label="Approximate employee count" type="number" min="0" @update:model-value="editForm.employeeCount = String($event)"/><BaseSelect v-model="editForm.status" label="Prospect status" :options="statuses"/></div>
        </section>
        <section class="profile-group" aria-labelledby="contact-info-heading">
          <h3 id="contact-info-heading">Main contact</h3>
          <div class="profile-fields"><BaseInput v-model="editForm.contactName" label="Contact name"/><BaseInput v-model="editForm.contactEmail" label="Contact email" type="email"/><BaseInput v-model="editForm.contactPhone" label="Contact phone"/></div>
        </section>
        <div class="form-wide"><BaseTextarea v-model="editForm.notes" label="Notes" :rows="3"/></div>
      </form>
      <section class="company-research" aria-labelledby="research-heading">
        <header class="research-header"><div class="section-heading"><span class="section-heading-icon" aria-hidden="true"><AppIcon name="company" :size="17" /></span><div class="section-heading-copy"><p class="eyebrow">Source-backed prospect research</p><h2 id="research-heading">Company Research</h2></div><p v-if="research" class="section-heading-detail">Last researched {{ new Date(research.researchedAt).toLocaleString() }}</p></div><BaseButton size="compact" :loading="researching" @click="runResearch">{{ research ? 'Research again' : 'Research company' }}</BaseButton></header>
        <p v-if="researching" class="detail-message" role="status">Researching public sources…</p>
        <p v-if="researchError" class="detail-error" role="alert">{{ researchError }}</p>
        <p v-if="!research && !researching" class="detail-message">No company research yet. Start a research run to review public information and sources.</p>
        <template v-if="research">
          <article class="research-card"><h3>Research summary</h3><p>{{ research.summary || 'No summary was available.' }}</p><p class="identity-state">Summary text is assembled only from source-linked claims below.</p><p class="identity-state"><strong>{{ research.identityStatus === 'matched' ? 'Identity matched' : 'Identity confirmation needed' }}:</strong> {{ research.identityExplanation }}</p><p v-if="research.status === 'empty'">No sufficiently supported claims were found in this run.</p><ul v-if="research.limitations.length"><li v-for="limitation in research.limitations" :key="limitation">{{ limitation }}</li></ul></article>
          <section class="research-results" aria-label="Research results"><header class="research-results-toolbar"><BaseButton v-if="research.claims.length || research.sources.length || researchHistory.length" size="compact" variant="secondary" @click="researchResultsOpen = true">Full screen</BaseButton></header>
            <div class="research-content-scroll" role="region" aria-label="Facts, opportunities, and sources; scroll to see all results" tabindex="0">
              <section class="research-claims" aria-labelledby="claim-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">01</span><div><h3 id="claim-heading">Facts and opportunities</h3><p class="review-note">Only approved sourced facts are used as future outreach inputs. Reviewing a claim does not guarantee it is objectively true.</p></div></header>
              <article v-for="claim in research.claims" :key="claim.id" class="claim-card">
                <p class="claim-label">{{ claim.claimType === 'hypothesis' ? 'Potential Opportunity — Not a Confirmed Company Problem' : 'Sourced fact' }} · {{ claim.category.replaceAll('_', ' ') }}</p><p>{{ claim.text }}</p>
                <div v-if="claim.sources.length" class="claim-evidence"><span>Evidence:</span> <a v-for="source in claim.sources" :key="source.id" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ({{ source.domain }})</a></div>
                <p v-else class="unverified">Not verified / insufficient evidence</p>
                <p class="review-status">Review: {{ claim.reviewStatus }}<span v-if="claim.reviewedAt"> · {{ new Date(claim.reviewedAt).toLocaleString() }}</span></p><p v-if="claim.reviewNote" class="review-note">Note: {{ claim.reviewNote }}</p>
                <template v-if="claim.reviewStatus === 'pending'"><label class="note-field">Review note <textarea v-model="researchNote[claim.id]" rows="2" maxlength="1200" /></label><div class="review-actions"><BaseButton :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'approved')">Approve</BaseButton><BaseButton variant="secondary" :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'rejected')">Reject</BaseButton></div></template>
              </article>
              <p v-if="research.claims.length === 0" class="detail-message">No sourced facts or opportunities are available for review.</p>
              </section>
              <section class="research-sources" aria-labelledby="sources-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">02</span><h3 id="sources-heading">Research Sources</h3></header><p v-if="research.sources.length === 0" class="detail-message">No source evidence was returned.</p><ul v-else class="source-list"><li v-for="source in research.sources" :key="source.id"><strong>{{ source.title }}</strong><span>{{ source.publisher || source.domain }} · {{ source.sourceType === 'official' ? 'Official source' : 'External source' }} · Retrieved {{ new Date(source.retrievedAt).toLocaleDateString() }}</span><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.url }}</a><span>Related claims: {{ research.claims.filter((claim) => claim.sources.some((item) => item.id === source.id)).map((claim) => claim.text).join(' · ') || 'No accepted claim linked' }}</span></li></ul></section>
              <section class="research-history" aria-labelledby="history-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">03</span><h3 id="history-heading">Research History</h3></header><p v-if="researchHistory.length === 0" class="detail-message">No previous research runs.</p><ul v-else class="history-list"><li v-for="run in researchHistory" :key="run.id"><button type="button" :aria-current="research?.id === run.id ? 'true' : undefined" @click="loadResearch(run.id)">{{ new Date(run.researchedAt).toLocaleString() }} · {{ run.status.replaceAll('_', ' ') }} · {{ run.identityStatus === 'matched' ? 'identity matched' : 'identity check needed' }}</button><span>{{ run.summary }}</span></li></ul></section>
            </div>
          </section>
        </template>
      </section>
      <BaseModal v-if="research" v-model="researchResultsOpen" title="Research results" description="Review facts, opportunities, and the sources behind them." size="fullscreen">
        <div class="research-results-fullscreen">
          <section class="research-claims" aria-labelledby="fullscreen-claim-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">01</span><div><h3 id="fullscreen-claim-heading">Facts and opportunities</h3><p class="review-note">Only approved sourced facts are used as future outreach inputs. Reviewing a claim does not guarantee it is objectively true.</p></div></header>
          <article v-for="claim in research.claims" :key="claim.id" class="claim-card">
            <p class="claim-label">{{ claim.claimType === 'hypothesis' ? 'Potential Opportunity — Not a Confirmed Company Problem' : 'Sourced fact' }} · {{ claim.category.replaceAll('_', ' ') }}</p><p>{{ claim.text }}</p>
            <div v-if="claim.sources.length" class="claim-evidence"><span>Evidence:</span> <a v-for="source in claim.sources" :key="source.id" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ({{ source.domain }})</a></div>
            <p v-else class="unverified">Not verified / insufficient evidence</p>
            <p class="review-status">Review: {{ claim.reviewStatus }}<span v-if="claim.reviewedAt"> · {{ new Date(claim.reviewedAt).toLocaleString() }}</span></p><p v-if="claim.reviewNote" class="review-note">Note: {{ claim.reviewNote }}</p>
            <template v-if="claim.reviewStatus === 'pending'"><label class="note-field">Review note <textarea v-model="researchNote[claim.id]" rows="2" maxlength="1200" /></label><div class="review-actions"><BaseButton :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'approved')">Approve</BaseButton><BaseButton variant="secondary" :loading="reviewing === claim.id" @click="reviewClaim(claim.id, 'rejected')">Reject</BaseButton></div></template>
          </article>
          <p v-if="research.claims.length === 0" class="detail-message">No sourced facts or opportunities are available for review.</p>
          </section>
          <section class="research-sources" aria-labelledby="fullscreen-sources-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">02</span><h3 id="fullscreen-sources-heading">Research Sources</h3></header><p v-if="research.sources.length === 0" class="detail-message">No source evidence was returned.</p><ul v-else class="source-list research-sources-fullscreen"><li v-for="source in research.sources" :key="source.id"><strong>{{ source.title }}</strong><span>{{ source.publisher || source.domain }} · {{ source.sourceType === 'official' ? 'Official source' : 'External source' }} · Retrieved {{ new Date(source.retrievedAt).toLocaleDateString() }}</span><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.url }}</a><span>Related claims: {{ research.claims.filter((claim) => claim.sources.some((item) => item.id === source.id)).map((claim) => claim.text).join(' · ') || 'No accepted claim linked' }}</span></li></ul></section>
          <section class="research-history" aria-labelledby="fullscreen-history-heading"><header class="research-section-title"><span class="research-section-index" aria-hidden="true">03</span><h3 id="fullscreen-history-heading">Research History</h3></header><p v-if="researchHistory.length === 0" class="detail-message">No previous research runs.</p><ul v-else class="history-list"><li v-for="run in researchHistory" :key="run.id"><button type="button" :aria-current="research?.id === run.id ? 'true' : undefined" @click="loadResearch(run.id)">{{ new Date(run.researchedAt).toLocaleString() }} · {{ run.status.replaceAll('_', ' ') }} · {{ run.identityStatus === 'matched' ? 'identity matched' : 'identity check needed' }}</button><span>{{ run.summary }}</span></li></ul></section>
        </div>
      </BaseModal>
      <section class="outreach" aria-labelledby="outreach-heading">
        <header class="outreach-header"><div class="section-heading"><span class="section-heading-icon outreach-icon" aria-hidden="true"><AppIcon name="sparkles" :size="17" /></span><div class="section-heading-copy"><p class="eyebrow">Personalized outbound email drafting</p><h2 id="outreach-heading">Outreach</h2></div><p class="section-heading-detail">Create a draft tailored to this prospect.</p></div><button type="button" class="draft-mode-switch" role="switch" :aria-checked="draftMode === 'ai'" aria-label="Generate with AI" @click="draftMode === 'ai' ? newManualDraft() : showAiForm()"><span class="draft-mode-label"><AppIcon name="edit" :size="14" />Manual draft</span><span class="draft-mode-label"><AppIcon name="sparkles" :size="14" />Generate with AI</span></button></header>
        <p v-if="draftError" class="detail-error" role="alert">{{ draftError }}</p><p v-if="draftNotice" class="detail-notice" role="status">{{ draftNotice }}</p><a v-if="sharedDraftUrl" class="shared-draft-url" :href="sharedDraftUrl" target="_blank" rel="noopener noreferrer">{{ sharedDraftUrl }}</a>
        <div class="draft-layout">
          <section aria-label="Saved email drafts" class="draft-list"><h3>Saved drafts</h3><p v-if="drafts.length === 0" class="detail-message">No saved drafts for this prospect.</p><ul v-else><li v-for="item in drafts" :key="item.id"><button type="button" @click="openDraft(item.id)"><strong>{{ item.subject || '(No subject)' }}</strong><span>{{ item.origin === 'ai' ? 'AI-assisted' : 'Manual' }} · Updated {{ new Date(item.updatedAt).toLocaleString() }}</span></button><BaseButton variant="secondary" :loading="sharingDraftId === item.id" @click="shareDraft(item)"><AppIcon name="link" :size="14" /> Share link</BaseButton></li></ul></section>
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
              <section v-if="draft" class="draft-feedback" aria-label="Partner feedback"><h4>Partner feedback</h4><p v-if="draftFeedbackError" class="detail-error" role="alert">{{ draftFeedbackError }}</p><p v-else-if="draftFeedback.length === 0" class="detail-message">No feedback has been submitted yet.</p><ul v-else><li v-for="item in draftFeedback" :key="item.id"><p>{{ item.message }}</p><time>{{ new Date(item.createdAt).toLocaleString() }}</time></li></ul></section>
            </template>
          </section>
        </div>
        <p class="draft-disclaimer">Drafting and copying do not record an email as sent. Sending remains a manual action outside Shifd Marketing.</p>
      </section>
      <section id="outbound-activities" class="outbound-activities" aria-labelledby="activities-heading">
        <header class="outbound-header"><div class="section-heading"><span class="section-heading-icon activity-icon" aria-hidden="true"><AppIcon name="calendar" :size="17" /></span><div class="section-heading-copy"><p class="eyebrow">Manual outreach record</p><h2 id="activities-heading">Outbound Activities</h2></div><p class="section-heading-detail">Track messages, replies, meetings, and follow-ups.</p></div></header>
        <p class="draft-disclaimer">Only record events that actually happened. Activity records do not verify email delivery. A planned follow-up remains pending until completed.</p>
        <p v-if="activityError" class="detail-error" role="alert">{{ activityError }}</p><p v-if="activityNotice" class="detail-notice" role="status">{{ activityNotice }}</p>
        <div v-if="activitySummary" class="activity-summary" aria-label="Outreach summary">
          <article><strong>{{ activitySummary.emailsSent }}</strong><span>Emails sent</span></article><article><strong>{{ activitySummary.followUpsCompleted }}</strong><span>Follow-ups completed</span></article><article><strong>{{ activitySummary.repliesReceived }}</strong><span>Replies</span></article><article><strong>{{ activitySummary.interestedResponses }}</strong><span>Interested</span></article><article><strong>{{ activitySummary.meetings }}</strong><span>Meetings</span></article><article><strong>{{ activitySummary.demonstrations }}</strong><span>Demonstrations</span></article><article><strong>{{ activitySummary.pendingFollowUps }}</strong><span>Pending follow-ups · {{ activitySummary.overdueFollowUps }} overdue</span></article><article><strong>{{ activitySummary.lastInteractionAt ? new Date(activitySummary.lastInteractionAt).toLocaleDateString() : '—' }}</strong><span>Last interaction</span></article>
        </div>
        <form class="activity-form" @submit.prevent="saveActivity">
          <h3>{{ activityEditId ? 'Edit activity' : 'Log activity' }}</h3>
          <BaseSelect v-model="activityForm.activityType" label="Activity type" :options="activityTypeOptions" :disabled="Boolean(activityEditId)" />
          <BaseInput v-if="activityForm.activityType === 'follow_up'" v-model="activityForm.dueAt" label="Planned follow-up date" type="datetime-local" required />
          <BaseInput v-else v-model="activityForm.occurredAt" label="Actual activity date" type="datetime-local" required />
          <BaseSelect v-if="['meeting', 'product_demonstration'].includes(activityForm.activityType) && !activityEditId" v-model="activityForm.status" label="Meeting or demo status" :options="[{value:'scheduled',label:'Scheduled',description:'The meeting or demo has not happened yet and has a scheduled time.'},{value:'completed',label:'Completed',description:'The meeting or demo has taken place.'}]" />
          <BaseSelect v-if="prospect.contactName || prospect.contactEmail" v-model="activityForm.contactChoice" label="Related contact" :options="contactActivityOptions" />
          <BaseSelect v-if="activityForm.activityType === 'email_sent' && !activityEditId" v-model="activityForm.emailDraftId" label="Related email draft (optional)" :options="[{value:'',label:'No related draft',description:'Record the sent email without linking it to a saved draft.'}, ...drafts.filter(item => item.status === 'draft').map(item => ({value:item.id,label:item.subject || '(No subject)',description:'Link this activity to the draft for history. This does not prove that the email was sent.'}))]" />
          <BaseInput v-if="activityForm.activityType === 'email_sent'" v-model="activityForm.subject" label="Email subject" maxlength="500" required />
          <BaseSelect v-if="activityForm.activityType === 'reply_received'" v-model="activityForm.responseClassification" label="Reply type" :options="responseOptions" />
          <BaseInput v-if="activityForm.activityType === 'other'" v-model="activityForm.description" label="Interaction details" maxlength="1000" required />
          <BaseSelect v-model="activityForm.provenance" label="Activity source" :options="[{value:'',label:'Select activity source',description:'Choose whether this activity happened previously or used materials from Shifd Marketing.'}, ...provenanceOptions]" />
          <div class="activity-form__notes"><BaseTextarea v-model="activityForm.notes" label="Notes" :rows="3" maxlength="5000" /></div>
          <div class="editor-actions"><BaseButton type="submit" :loading="activitySaving">{{ activityEditId ? 'Save changes' : activityForm.activityType === 'follow_up' ? 'Schedule follow-up' : 'Save activity' }}</BaseButton><BaseButton v-if="activityEditId" type="button" variant="secondary" @click="resetActivityForm()">Cancel edit</BaseButton></div>
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
.prospect-detail{display:grid;gap:16px;max-width:1180px;margin:0 auto;padding-bottom:32px;color:#29352f}.detail-back{width:max-content;color:#356653;text-decoration:none;font-size:14px}.detail-back:hover{text-decoration:underline}.detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:6px 0 4px}.detail-heading{min-width:0}.prospect-detail-title-row{display:flex;align-items:center;gap:10px}.prospect-detail-title-row h1{margin-right:0}.prospect-detail h1{font-size:30px;line-height:1.2;letter-spacing:-.025em;margin:5px 0 10px;color:#1f3028;overflow-wrap:anywhere}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#687b70;margin:0}.detail-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;color:#687581;font-size:13px}.detail-meta a{color:#28664f;overflow-wrap:anywhere}.detail-status{border-radius:999px;background:#eaf2ed;padding:4px 9px;color:#285540;font-size:12px;font-weight:700;text-transform:capitalize}.detail-panel,.company-research,.outreach,.outbound-activities{border:1px solid #e0e7e2;border-radius:16px;background:#fff;box-shadow:0 2px 8px rgb(31 48 40 / 3%)}.prospect-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 24px;padding:20px}.form-heading{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid #edf1ee}.form-heading h2{margin:3px 0 4px;font-size:19px;color:#26382f}.form-heading p:last-child{margin:0;color:#687581;font-size:13px}.profile-group{display:grid;align-content:start;gap:12px}.profile-group h3{margin:0;font-size:14px;color:#3d5146}.profile-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}.profile-group + .form-wide{min-width:0}.form-wide{grid-column:1/-1}.detail-notice,.detail-error{margin:0;padding:10px 12px;border-radius:9px;font-size:14px}.detail-notice{background:#eff8f1;color:#186149}.detail-error{background:#fff2f0;color:#a13c36}.detail-message{padding:18px;color:#687581;margin:0}.actions{display:flex;justify-content:flex-end}@media(max-width:700px){.detail-header{align-items:flex-start;flex-direction:column;gap:14px}.prospect-detail h1{font-size:25px}.prospect-form{grid-template-columns:1fr;padding:16px;gap:18px}.form-heading,.form-wide{grid-column:auto}.profile-fields{grid-template-columns:1fr}}
.company-research{display:grid;gap:20px;border-top:1px solid #dce4df;padding-top:24px}.company-research h2{margin:4px 0;font-size:26px}.company-research h3{margin:0 0 12px}.research-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.research-card,.claim-card{border:1px solid #dce4df;border-radius:12px;padding:18px;background:#fff}.claim-card{margin-top:12px}.claim-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#356653;font-weight:700}.identity-state,.review-note,.review-status,.source-list span{color:#687581;font-size:14px}.claim-evidence{display:flex;gap:8px;flex-wrap:wrap}.claim-evidence a,.source-list a{color:#28664f;overflow-wrap:anywhere}.unverified{color:#8b5b1b}.note-field{display:grid;gap:6px;margin-top:12px}.note-field textarea{width:100%;border:1px solid #cbd6cf;border-radius:8px;padding:9px;font:inherit}.review-actions{display:flex;gap:10px;margin-top:10px}.source-list,.history-list{display:grid;gap:12px;list-style:none;padding:0}.source-list li,.history-list li{display:grid;gap:5px;border-bottom:1px solid #e4e9e6;padding:10px 0}.history-list button{justify-self:start;background:none;border:0;padding:0;color:#28664f;text-decoration:underline;cursor:pointer}.history-list button[aria-current="true"]{font-weight:700}@media(max-width:700px){.research-header{align-items:flex-start;flex-direction:column}}
.company-research,.outreach,.outbound-activities{display:grid;gap:16px;padding:18px;scroll-margin-top:24px}.company-research h2,.outreach h2,.outbound-activities h2{margin:3px 0;font-size:20px;line-height:1.3;color:#26382f}.company-research h3,.outreach h3,.outbound-activities h3{margin:0 0 8px;font-size:15px;color:#33463c}.research-header,.outreach-header,.outbound-header{display:flex;align-items:center;justify-content:space-between;gap:14px}.research-header>div,.outreach-header>div,.outbound-header>div{display:grid;gap:3px}.research-card,.claim-card{border:1px solid #e5ebe7;border-radius:11px;padding:14px;background:#fbfcfb}.claim-card{margin-top:10px}.claim-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#356653;font-weight:700}.identity-state,.review-note,.review-status,.source-list span{color:#687581;font-size:13px}.claim-evidence{display:flex;gap:8px;flex-wrap:wrap}.claim-evidence a,.source-list a{color:#28664f;overflow-wrap:anywhere}.unverified{color:#8b5b1b}.note-field{display:grid;gap:6px;margin-top:10px}.note-field textarea{width:100%;border:1px solid #cbd6cf;border-radius:8px;padding:9px;font:inherit}.review-actions{display:flex;gap:8px;margin-top:8px}.source-list,.history-list{display:grid;gap:8px;list-style:none;padding:0;margin:0}.source-list li,.history-list li{display:grid;gap:5px;border-bottom:1px solid #e8ede9;padding:9px 0}.history-list button{justify-self:start;background:none;border:0;padding:0;color:#28664f;text-decoration:underline;cursor:pointer}.history-list button[aria-current="true"]{font-weight:700}.outreach-actions,.editor-actions{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap}.draft-layout{display:grid;grid-template-columns:minmax(210px,.7fr) minmax(0,1.8fr);gap:14px}.draft-list,.draft-editor{min-width:0;border:1px solid #e5ebe7;border-radius:11px;padding:14px;background:#fbfcfb}.draft-list ul,.draft-evidence{list-style:none;padding:0;margin:0;display:grid;gap:8px}.draft-list li button{width:100%;display:grid;gap:5px;text-align:left;border:1px solid #e0e7e2;border-radius:8px;padding:10px;background:#fff;color:inherit;cursor:pointer}.draft-list li button span,.draft-meta,.draft-disclaimer,.recipient-line{color:#687581;font-size:12px}.generation-form,.email-fields{display:grid;gap:12px}.fact-picker{display:grid;gap:10px;border:1px solid #dce4df;border-radius:8px;padding:12px}.fact-picker label{display:flex;align-items:flex-start;gap:9px}.fact-picker label span{display:grid;gap:4px}.fact-picker a,.draft-evidence a{color:#28664f;overflow-wrap:anywhere;font-size:12px}.draft-evidence li{border-left:3px solid #7ea28d;padding:4px 10px}.draft-evidence p{margin:5px 0}.draft-evidence span,.evidence-label{font-size:12px;color:#356653;font-weight:700}.draft-disclaimer{margin:0}.activity-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.activity-summary article{display:grid;gap:4px;border:1px solid #e5ebe7;border-radius:10px;background:#fbfcfb;padding:11px}.activity-summary strong{font-size:20px;color:#244f3e}.activity-summary span,.activity-meta{font-size:12px;color:#687581}.activity-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 18px;border:1px solid #e5ebe7;border-radius:11px;background:#fbfcfb;padding:18px}.activity-form h3,.activity-form .editor-actions,.activity-form__notes{grid-column:1/-1}.activity-form__notes{min-width:0}.activity-form__notes :deep(.ui-field),.activity-form__notes :deep(.ui-textarea){width:100%;min-width:0}.activity-form .editor-actions{padding-top:2px}.activity-timeline ol{list-style:none;padding:0;margin:0;display:grid;gap:9px}.activity-timeline li{border:1px solid #e5ebe7;border-radius:10px;padding:13px;background:#fff}.timeline-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.timeline-title time{margin-left:auto;color:#687581;font-size:12px}.activity-badge{border-radius:999px;background:#e8f0eb;color:#285540;padding:4px 9px;font-size:11px;font-weight:700}.activity-meta{margin-top:10px}.overdue-follow-up{border-color:#c87a56!important}.overdue-label{font-weight:700;color:#a13c36}@media(max-width:760px){.draft-layout{grid-template-columns:1fr}.research-header,.outreach-header,.outbound-header{align-items:flex-start;flex-direction:column}.activity-form{grid-template-columns:1fr;gap:12px}.activity-form h3,.activity-form .editor-actions,.activity-form__notes{grid-column:1}.timeline-title time{margin-left:0}}
.section-heading{display:grid!important;grid-template-columns:32px minmax(0,1fr);align-items:center;column-gap:10px;row-gap:2px;flex:1;min-width:0}.section-heading-icon{grid-column:1;grid-row:1 / span 2;align-self:start;display:grid;place-items:center;width:32px;height:32px;border:1px solid #d8e8de;border-radius:10px;background:linear-gradient(145deg,#f2f8f4,#e6f1ea);box-shadow:inset 0 1px 0 #fff,0 1px 3px rgb(34 71 53 / 6%);color:#32644b}.section-heading-icon.outreach-icon{border-color:#d8e3ed;background:linear-gradient(145deg,#f3f7fb,#e9f0f7);color:#456987}.section-heading-icon.activity-icon{border-color:#eadfce;background:linear-gradient(145deg,#fbf7f0,#f4ecdf);color:#84633e}.section-heading-copy{display:grid;gap:3px!important;min-width:0}.section-heading-copy .eyebrow{font-size:10px;font-weight:700;letter-spacing:.13em;color:#71847a}.section-heading-copy h2{margin:0!important;font-size:22px!important;line-height:1.18!important;letter-spacing:-.025em}.section-heading-detail{grid-column:2;margin:0;color:#748078;font-size:12px;line-height:1.35}.research-header>.section-heading,.outreach-header>.section-heading,.outbound-header>.section-heading{column-gap:12px}.draft-mode-switch{position:relative;isolation:isolate;display:grid;grid-template-columns:1fr 1fr;align-items:center;min-width:264px;min-height:48px;padding:4px;border:1px solid #dbe5df;border-radius:999px;background:#f1f6f3;color:#617168;font:inherit;font-size:12px;font-weight:650;cursor:pointer;flex-shrink:0;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease}.draft-mode-switch::before{position:absolute;z-index:0;top:4px;left:4px;width:calc(50% - 4px);height:calc(100% - 8px);border-radius:999px;background:#fff;box-shadow:0 2px 6px rgb(31 48 40 / 13%);content:"";transition:transform .32s cubic-bezier(.2,.8,.2,1),background-color .2s ease,box-shadow .2s ease}.draft-mode-switch[aria-checked="true"]{border-color:#b9d1c3;background:#eaf4ee;box-shadow:0 0 0 3px rgb(77 139 103 / 9%)}.draft-mode-switch[aria-checked="true"]::before{transform:translateX(100%);background:#fff;box-shadow:0 3px 9px rgb(36 85 63 / 18%)}.draft-mode-label{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 5px;white-space:nowrap;transition:color .2s ease}.draft-mode-label:first-child{color:#24553f}.draft-mode-switch[aria-checked="true"] .draft-mode-label:first-child{color:#718078}.draft-mode-switch[aria-checked="true"] .draft-mode-label:last-child{color:#24553f}.draft-mode-switch:hover{border-color:#b9cfc0}.draft-mode-switch:focus-visible{outline:2px solid #3c765a;outline-offset:3px}@media(prefers-reduced-motion:reduce){.draft-mode-switch,.draft-mode-switch::before,.draft-mode-label{transition:none}}@media(max-width:760px){.section-heading{width:100%;flex:none}.section-heading-copy .eyebrow{font-size:9px;letter-spacing:.1em}}
.research-results{display:grid;gap:10px;min-width:0}.research-results-toolbar{display:flex;justify-content:flex-end}.research-content-scroll{display:grid;gap:16px;max-height:min(56vh,520px);overflow-y:auto;overscroll-behavior:contain;padding:1px 6px 4px 1px;scrollbar-gutter:stable}.research-content-scroll:focus-visible{outline:2px solid #8bb59a;outline-offset:2px;border-radius:10px}.research-claims,.research-sources,.research-history{display:grid;gap:10px;min-width:0}.research-section-title{display:flex;align-items:center;gap:11px;padding:12px 14px;border:1px solid #dbe7df;border-left:4px solid #4e8064;border-radius:10px;background:linear-gradient(110deg,#f0f6f2,#fafcfb)}.research-section-title>div{display:grid;gap:4px;min-width:0}.research-section-title h3{margin:0!important;color:#244b37;font-size:16px!important;font-weight:750!important;line-height:1.3}.research-section-title .review-note{margin:0;max-width:760px;line-height:1.45}.research-section-index{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:8px;background:#dcebe1;color:#356653;font-size:11px;font-weight:800;letter-spacing:.04em}.research-claims .claim-card{margin-top:0}.research-sources,.research-history{border-top:1px solid #e5ebe7;padding-top:14px}.research-results-fullscreen{display:grid;gap:20px}.research-results-fullscreen .claim-card{margin-top:0}.research-sources-fullscreen{gap:0}.research-sources-fullscreen li:first-child{padding-top:0}@media(max-width:600px){.research-content-scroll{max-height:54vh}.research-section-title{align-items:flex-start;padding:10px}.research-section-title .review-note{font-size:12px}}
.draft-list li{display:grid;gap:7px}.draft-list li>button:first-child{width:100%}.draft-list li> :deep(button:not(:first-child)){justify-self:start}
.shared-draft-url{display:block;max-width:100%;overflow-wrap:anywhere;color:#28664f;font-size:13px}
.draft-feedback{display:grid;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid #e5ebe7}.draft-feedback h4{margin:0;color:#33463c;font-size:14px}.draft-feedback ul{display:grid;gap:8px;list-style:none;margin:0;padding:0}.draft-feedback li{border:1px solid #e2e9e4;border-radius:9px;padding:11px;background:#fff}.draft-feedback li p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.draft-feedback li time{display:block;margin-top:8px;color:#748078;font-size:12px}
</style>
