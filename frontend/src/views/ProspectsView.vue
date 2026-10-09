<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, confirmProspectImport, createProspect, listProspects, previewProspectImport } from '../api/prospects'
import type { Prospect, ProspectImportField, ProspectImportPreview, ProspectInput, ProspectStatus } from '../types/prospect'

const router = useRouter()
const prospects = ref<Prospect[]>([])
const search = ref('')
const industry = ref('')
const status = ref('')
const loading = ref(false)
const page = ref(1)
const hasMore = ref(true)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const importOpen = ref(false)
const saving = ref(false)
const importBusy = ref(false)
const file = ref<File | null>(null)
const preview = ref<ProspectImportPreview | null>(null)
const previewToken = ref('')
const headers = ref<{ column: number; label: string }[]>([])
const selectedRows = ref(new Set<number>())
const importDone = ref(false)
const importFields: { key: ProspectImportField; label: string }[] = [
  { key: 'name', label: 'Company name' }, { key: 'industry', label: 'Industry / sector' }, { key: 'website', label: 'Website' }, { key: 'address', label: 'Address' },
  { key: 'employeeCount', label: 'Employee count' }, { key: 'employeeSize', label: 'Employee size' }, { key: 'contactName', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' }, { key: 'contactPhone', label: 'Contact phone' }, { key: 'notes', label: 'Notes' },
]
const columnMapping = ref<Record<ProspectImportField, string>>(emptyMapping())
const importResult = ref('')
type ProspectForm = { name: string; industry: string; website: string; address: string; employeeCount: string | number; employeeSize: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; status: string }
const statuses = [{ value: '', label: 'All statuses' }, { value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'customer', label: 'Customer' }, { value: 'disqualified', label: 'Disqualified' }]
const form = ref<ProspectForm>(blank())
function blank(): ProspectForm { return { name: '', industry: '', website: '', address: '', employeeCount: '', employeeSize: '', contactName: '', contactEmail: '', contactPhone: '', notes: '', status: 'lead' } }
function emptyMapping(): Record<ProspectImportField, string> { return Object.fromEntries(importFields.map((field) => [field.key, ''])) as Record<ProspectImportField, string> }

async function load(reset = true) {
  loading.value = true; error.value = ''
  try { const query = new URLSearchParams({ limit: '25', page: String(page.value) }); if (search.value) query.set('search', search.value); if (industry.value) query.set('industry', industry.value); if (status.value) query.set('status', status.value); const rows = (await listProspects(query)).data; prospects.value = reset ? rows : [...prospects.value, ...rows]; hasMore.value = rows.length === 25 }
  catch (reason) { error.value = errorMessage(reason, 'Prospects could not be loaded.') }
  finally { loading.value = false }
}
let timer: ReturnType<typeof setTimeout>
watch([search, industry, status], () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; void load(true) }, 180) })
onMounted(load)

async function save() {
  saving.value = true; error.value = ''; notice.value = ''
  try { const { employeeCount, status: formStatus, ...fields } = form.value; await createProspect({ ...fields, status: formStatus as ProspectStatus, employeeCount: employeeCount === '' ? null : Number(employeeCount) } as ProspectInput); editorOpen.value = false; form.value = blank(); notice.value = 'Prospect added.'; page.value = 1; await load(true) }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be saved.') }
  finally { saving.value = false }
}
async function loadMore() { if (!loading.value && hasMore.value) { page.value += 1; await load(false); if (error.value) page.value -= 1 } }
function selectFile(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; preview.value = null; previewToken.value = ''; headers.value = []; selectedRows.value = new Set(); importDone.value = false; columnMapping.value = emptyMapping(); importResult.value = '' }
async function makePreview(useCustomMapping = false) {
  if (!file.value) return
  importBusy.value = true; error.value = ''
  try {
    const custom = useCustomMapping ? Object.fromEntries(importFields.map(({ key }) => [key, columnMapping.value[key] ? Number(columnMapping.value[key]) : ''])) as Partial<Record<ProspectImportField, number | ''>> : undefined
    const result = await previewProspectImport(file.value, custom)
    preview.value = result.data; previewToken.value = result.data.previewToken; headers.value = result.data.headers
    columnMapping.value = Object.fromEntries(importFields.map(({ key }) => [key, String(result.data.mapping[key] ?? '')])) as Record<ProspectImportField, string>
    selectedRows.value = new Set(result.data.rows.filter((row) => row.status === 'valid').map((row) => row.rowNumber)); importDone.value = false; importResult.value = ''
  }
  catch (reason) { error.value = errorMessage(reason, 'The spreadsheet could not be previewed.') }
  finally { importBusy.value = false }
}
function selectImportRow(rowNumber: number, selected: boolean) { const updated = new Set(selectedRows.value); if (selected) updated.add(rowNumber); else updated.delete(rowNumber); selectedRows.value = updated }
async function confirmImport() {
  importBusy.value = true; error.value = ''
  try { const result = await confirmProspectImport(previewToken.value, [...selectedRows.value]); importDone.value = true; importResult.value = `${result.data.imported} prospect${result.data.imported === 1 ? '' : 's'} imported; ${result.data.duplicates} duplicate row${result.data.duplicates === 1 ? '' : 's'} skipped.`; notice.value = importResult.value; page.value = 1; await load(true) }
  catch (reason) { error.value = errorMessage(reason, 'The import could not be completed.') }
  finally { importBusy.value = false }
}
function statusLabel(value: ProspectStatus) { return value[0].toUpperCase() + value.slice(1) }
async function archive(item: Prospect, event: Event) {
  event.stopPropagation()
  if (!confirm(`Archive ${item.name}? Its record will be preserved.`)) return
  error.value = ''; notice.value = ''
  try { await archiveProspect(item.id, item.version); notice.value = 'Prospect archived.'; page.value = 1; await load(true) }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be archived.') }
}
</script>

<template>
  <section class="prospects-page">
    <header class="page-heading">
      <div><p class="eyebrow">Prospect Management</p><h1>Target organizations</h1><p>Keep company and contact details ready for future outbound work.</p></div>
      <div class="prospect-actions"><BaseButton variant="secondary" @click="importOpen = true">Import Excel</BaseButton><BaseButton @click="form = blank(); editorOpen = true">Add Prospect</BaseButton></div>
    </header>
    <p v-if="notice" class="prospect-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="prospect-error" role="alert">{{ error }}</p>
    <div class="prospect-filters"><BaseInput v-model="search" label="Search prospects" type="search" placeholder="Company, industry, contact, website"/><BaseInput v-model="industry" label="Industry" placeholder="Filter by any industry"/><BaseSelect v-model="status" label="Status" :options="statuses"/></div>
    <div class="prospect-table-wrap">
      <table class="prospect-table"><thead><tr><th>Organization</th><th>Industry</th><th>Contact</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody><tr v-for="item in prospects" :key="item.id" tabindex="0" @click="router.push(`/prospects/${item.id}`)" @keydown.enter="router.push(`/prospects/${item.id}`)"><td><strong>{{ item.name }}</strong><small>{{ item.website || item.address || 'No website or address' }}</small></td><td>{{ item.industry || '—' }}</td><td>{{ item.contactName || '—' }}<small>{{ item.contactEmail || item.contactPhone || '' }}</small></td><td><span class="prospect-status">{{ statusLabel(item.status) }}</span></td><td>{{ item.source === 'excel_import' ? 'Excel import' : 'Manual' }}</td><td class="row-actions"><button type="button" @click.stop="router.push(`/prospects/${item.id}`)">View / Edit</button><button type="button" @click="archive(item, $event)">Archive</button></td></tr>
        <tr v-if="!loading && !error && prospects.length === 0"><td colspan="6" class="prospect-empty">No prospects match these filters. Add one manually or import an Excel workbook.</td></tr>
        <tr v-if="loading"><td colspan="6" class="prospect-empty">Loading prospects…</td></tr></tbody>
      </table>
    </div>
    <div v-if="hasMore && prospects.length" class="prospect-more"><BaseButton variant="secondary" :loading="loading" @click="loadMore">Load more prospects</BaseButton></div>
    <BaseModal v-model="editorOpen" title="Add prospect" description="Enter the organization details you have. Unknown information can stay blank." size="wide">
      <form class="prospect-form" @submit.prevent="save">
        <BaseInput v-model="form.name" label="Company name" required maxlength="240"/><BaseInput v-model="form.industry" label="Industry / sector"/><BaseInput v-model="form.website" label="Website" type="url"/><BaseInput v-model="form.address" label="Address"/><BaseInput :model-value="form.employeeCount" label="Approximate employee count" type="number" min="0" @update:model-value="form.employeeCount = String($event)"/><BaseInput v-model="form.employeeSize" label="Employee size" placeholder="e.g. 50–200"/><BaseInput v-model="form.contactName" label="Contact name"/><BaseInput v-model="form.contactEmail" label="Contact email" type="email"/><BaseInput v-model="form.contactPhone" label="Contact phone"/><BaseSelect v-model="form.status" label="Prospect status" :options="statuses.slice(1)"/><div class="prospect-form__wide"><BaseTextarea v-model="form.notes" label="Notes" :rows="3"/></div>
        <div class="prospect-form__wide prospect-modal-footer"><BaseButton variant="secondary" @click="editorOpen = false">Cancel</BaseButton><BaseButton type="submit" :loading="saving">Save prospect</BaseButton></div>
      </form>
    </BaseModal>
    <BaseModal v-model="importOpen" title="Import prospects from Excel" description="Upload an .xlsx workbook, review its column mapping and rows, then confirm the selected entries." size="wide">
      <div class="prospect-import">
        <label class="file-field">Excel workbook (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="selectFile"></label>
        <BaseButton variant="secondary" :disabled="!file" :loading="importBusy" @click="makePreview()">Preview workbook</BaseButton>
        <template v-if="preview">
          <p class="import-summary">{{ preview.summary.valid }} valid · {{ preview.summary.duplicates }} duplicates · {{ preview.summary.ambiguous }} ambiguous · {{ preview.summary.invalid }} invalid · {{ preview.summary.total }} rows</p>
          <p class="import-expiry">Preview expires {{ new Date(preview.expiresAt).toLocaleTimeString() }}. Select valid rows and explicitly approve any ambiguous row you want to add separately.</p>
          <fieldset class="mapping-panel"><legend>Review column mapping</legend><label v-for="field in importFields" :key="field.key">{{ field.label }}
            <select v-model="columnMapping[field.key]" :aria-label="`Map ${field.label}`"><option value="">Not mapped</option><option v-for="header in headers" :key="header.column" :value="String(header.column)">{{ header.label }} (column {{ header.column }})</option></select>
          </label><BaseButton variant="secondary" :disabled="!file || !columnMapping.name" :loading="importBusy" @click="makePreview(true)">Re-preview with this mapping</BaseButton></fieldset>
          <div v-if="preview.rows.length" class="import-preview"><table class="prospect-table"><thead><tr><th>Select</th><th>Row</th><th>Company</th><th>Review</th></tr></thead><tbody>
            <tr v-for="row in preview.rows" :key="row.rowNumber"><td><input v-if="row.status === 'valid' || row.status === 'ambiguous'" type="checkbox" :aria-label="row.status === 'ambiguous' ? `Import row ${row.rowNumber} as a separate organization` : `Select row ${row.rowNumber}`" :checked="selectedRows.has(row.rowNumber)" @change="selectImportRow(row.rowNumber, ($event.target as HTMLInputElement).checked)"><span v-else>—</span></td><td>{{ row.rowNumber }}</td><td>{{ row.data?.name || '—' }}</td><td>
              <span v-if="row.status === 'invalid'" class="prospect-error">{{ row.errors.join(' ') }}</span>
              <span v-else-if="row.status === 'duplicate'" class="duplicate-warning">Duplicate: {{ row.duplicateOf.map((item) => item.name).join(', ') }}. This row cannot be imported.</span>
              <span v-else-if="row.status === 'ambiguous'" class="duplicate-warning">Ambiguous match: {{ row.duplicateOf.map((item) => item.name + (item.rowNumber ? ` (row ${item.rowNumber})` : '')).join(', ') }}. Confirm only if this is a separate organization.</span>
              <span v-else>Ready to import</span>
            </td></tr>
          </tbody></table></div>
          <p v-if="importResult" role="status">{{ importResult }}</p>
          <div class="prospect-modal-footer"><BaseButton variant="secondary" @click="importOpen = false">Close</BaseButton><BaseButton v-if="selectedRows.size && !importDone" :loading="importBusy" @click="confirmImport">Confirm {{ selectedRows.size }} selected row{{ selectedRows.size === 1 ? '' : 's' }}</BaseButton></div>
        </template>
        <div v-else class="prospect-modal-footer"><BaseButton variant="secondary" @click="importOpen = false">Cancel</BaseButton></div>
      </div>
    </BaseModal>
  </section>
</template>

<style scoped>
.prospects-page{display:grid;gap:24px}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.page-heading h1{margin:4px 0 8px;font-size:32px}.page-heading p{margin:0;color:#687581}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#60716e}.prospect-actions,.prospect-modal-footer{display:flex;gap:10px;justify-content:flex-end}.prospect-filters{display:grid;grid-template-columns:minmax(240px,2fr) 1fr 1fr;gap:16px}.prospect-table-wrap,.import-preview{overflow:auto;border:1px solid #e1e7e5;border-radius:14px;background:white}.prospect-table{width:100%;border-collapse:collapse;text-align:left;min-width:720px}.prospect-table th,.prospect-table td{padding:14px 16px;border-bottom:1px solid #edf0ef;font-size:14px}.prospect-table th{color:#687581;font-weight:600;background:#fafcfb}.prospect-table tbody tr[tabindex]{cursor:pointer}.prospect-table tbody tr[tabindex]:hover{background:#f7faf8}.prospect-table small{display:block;color:#77827f;margin-top:4px}.prospect-status{padding:4px 9px;border-radius:99px;background:#edf4f0;font-size:12px}.prospect-empty{text-align:center;color:#697672;padding:36px!important}.prospect-notice{color:#186149}.prospect-error{color:#a13c36}.prospect-form{display:grid;grid-template-columns:1fr 1fr;gap:16px}.prospect-form__wide{grid-column:1/-1}.prospect-import{display:grid;gap:16px}.file-field{display:grid;gap:8px;font-size:13px;font-weight:600}.duplicate-warning{color:#8b5a11}.import-summary{margin:0;color:#3e5a4e}@media(max-width:760px){.page-heading{align-items:flex-start;flex-direction:column}.prospect-filters,.prospect-form{grid-template-columns:1fr}.prospect-form__wide{grid-column:auto}.prospect-actions{width:100%}}
.prospect-more{display:flex;justify-content:center}
.row-actions{white-space:nowrap}.row-actions button{border:0;background:transparent;color:#356653;text-decoration:underline;cursor:pointer;padding:5px}.row-actions button:last-child{color:#8b423d}
</style>
