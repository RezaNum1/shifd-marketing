<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, getProspect, updateProspect } from '../api/prospects'
import type { Prospect, ProspectInput } from '../types/prospect'

const route = useRoute(); const router = useRouter()
const prospect = ref<Prospect | null>(null)
type ProspectForm = { name: string; industry: string; website: string; address: string; employeeCount: string | number; employeeSize: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; status: string }
const editForm = ref<ProspectForm | null>(null)
const loading = ref(true); const saving = ref(false); const error = ref(''); const notice = ref('')
const statuses = [{ value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'customer', label: 'Customer' }, { value: 'disqualified', label: 'Disqualified' }]
async function load() {
  loading.value = true; error.value = ''
  try { const result = await getProspect(String(route.params.id)); prospect.value = result.data; const p = result.data; editForm.value = { name: p.name, industry: p.industry ?? '', website: p.website ?? '', address: p.address ?? '', employeeCount: p.employeeCount === null ? '' : String(p.employeeCount), employeeSize: p.employeeSize ?? '', contactName: p.contactName ?? '', contactEmail: p.contactEmail ?? '', contactPhone: p.contactPhone ?? '', notes: p.notes ?? '', status: p.status } }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be loaded.') }
  finally { loading.value = false }
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
    </template>
  </section>
</template>

<style scoped>
.prospect-detail{display:grid;gap:24px}.prospect-detail>a{color:#356653;text-decoration:none}.prospect-detail header{display:flex;justify-content:space-between;align-items:center;gap:20px}.prospect-detail h1{font-size:32px;margin:5px 0}.prospect-detail header p{color:#687581;margin:0}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em}.prospect-form{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:900px}.form-wide{grid-column:1/-1}.actions{display:flex;justify-content:flex-end}.detail-notice{color:#186149}.detail-error{color:#a13c36}.detail-message{padding:32px;color:#687581}@media(max-width:700px){.prospect-detail header{align-items:flex-start;flex-direction:column}.prospect-form{grid-template-columns:1fr}.form-wide{grid-column:auto}}
</style>
