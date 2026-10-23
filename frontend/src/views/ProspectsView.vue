<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeaderHelp from '../components/app/PageHeaderHelp.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import TablePagination from '../components/ui/TablePagination.vue'
import { errorMessage } from '../api/client'
import { archiveProspect, confirmProspectImport, createProspect, listProspects, previewProspectImport } from '../api/prospects'
import type { Prospect, ProspectImportField, ProspectImportPreview, ProspectInput, ProspectStatus } from '../types/prospect'

const router = useRouter()
const pageHelp = {
  purpose: 'Keep target organizations and their contact details organized for future outreach.',
  steps: ['Search or filter the list to find an organization.', 'Add one prospect manually or import a spreadsheet.', 'Open a row to review details, research the company, or manage outreach.'],
}
const prospects = ref<Prospect[]>([])
const search = ref('')
const industry = ref('')
const status = ref('')
const loading = ref(false)
const page = ref(1)
const pageSize = ref(25)
const totalProspects = ref(0)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const importOpen = ref(false)
const saving = ref(false)
const importBusy = ref(false)
const file = ref<File | null>(null)
const preview = ref<ProspectImportPreview | null>(null)
const previewPage = ref(1)
const previewPageSize = ref(10)
const visiblePreviewRows = computed(() => (preview.value?.rows ?? []).slice((previewPage.value - 1) * previewPageSize.value, previewPage.value * previewPageSize.value))
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
const statusDescriptions = [
  { label: 'Lead', description: 'Newly added and not yet evaluated.' },
  { label: 'Qualified', description: 'Reviewed and appears to fit your target customer profile.' },
  { label: 'Customer', description: 'Has purchased or is already a customer.' },
  { label: 'Disqualified', description: 'Not a fit or no longer being pursued.' },
]
const form = ref<ProspectForm>(blank())
function blank(): ProspectForm { return { name: '', industry: '', website: '', address: '', employeeCount: '', employeeSize: '', contactName: '', contactEmail: '', contactPhone: '', notes: '', status: 'lead' } }
function emptyMapping(): Record<ProspectImportField, string> { return Object.fromEntries(importFields.map((field) => [field.key, ''])) as Record<ProspectImportField, string> }

async function load() {
  loading.value = true; error.value = ''
  try { const query = new URLSearchParams({ limit: String(pageSize.value), page: String(page.value) }); if (search.value) query.set('search', search.value); if (industry.value) query.set('industry', industry.value); if (status.value) query.set('status', status.value); const result = await listProspects(query); prospects.value = result.data; totalProspects.value = result.page?.total ?? result.data.length }
  catch (reason) { error.value = errorMessage(reason, 'Prospects could not be loaded.') }
  finally { loading.value = false }
}
let timer: ReturnType<typeof setTimeout>
watch([search, industry, status], () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; void load() }, 180) })
watch(page, () => { void load() })
watch(pageSize, () => { page.value = 1; void load() })
onMounted(() => { void load() })

async function save() {
  saving.value = true; error.value = ''; notice.value = ''
  try { const { employeeCount, status: formStatus, ...fields } = form.value; await createProspect({ ...fields, status: formStatus as ProspectStatus, employeeCount: employeeCount === '' ? null : Number(employeeCount) } as ProspectInput); editorOpen.value = false; form.value = blank(); notice.value = 'Prospect added.'; page.value = 1; await load() }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be saved.') }
  finally { saving.value = false }
}
function selectFile(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; preview.value = null; previewToken.value = ''; headers.value = []; selectedRows.value = new Set(); importDone.value = false; columnMapping.value = emptyMapping(); importResult.value = '' }
async function makePreview(useCustomMapping = false) {
  if (!file.value) return
  importBusy.value = true; error.value = ''
  try {
    const custom = useCustomMapping ? Object.fromEntries(importFields.map(({ key }) => [key, columnMapping.value[key] ? Number(columnMapping.value[key]) : ''])) as Partial<Record<ProspectImportField, number | ''>> : undefined
    const result = await previewProspectImport(file.value, custom)
    preview.value = result.data; previewPage.value = 1; previewToken.value = result.data.previewToken; headers.value = result.data.headers
    columnMapping.value = Object.fromEntries(importFields.map(({ key }) => [key, String(result.data.mapping[key] ?? '')])) as Record<ProspectImportField, string>
    selectedRows.value = new Set(result.data.rows.filter((row) => row.status === 'valid').map((row) => row.rowNumber)); importDone.value = false; importResult.value = ''
  }
  catch (reason) { error.value = errorMessage(reason, 'The spreadsheet could not be previewed.') }
  finally { importBusy.value = false }
}
function selectImportRow(rowNumber: number, selected: boolean) { const updated = new Set(selectedRows.value); if (selected) updated.add(rowNumber); else updated.delete(rowNumber); selectedRows.value = updated }
async function confirmImport() {
  importBusy.value = true; error.value = ''
  try { const result = await confirmProspectImport(previewToken.value, [...selectedRows.value]); importDone.value = true; importResult.value = `${result.data.imported} prospect${result.data.imported === 1 ? '' : 's'} imported; ${result.data.duplicates} duplicate row${result.data.duplicates === 1 ? '' : 's'} skipped.`; notice.value = importResult.value; page.value = 1; await load() }
  catch (reason) { error.value = errorMessage(reason, 'The import could not be completed.') }
  finally { importBusy.value = false }
}
function statusLabel(value: ProspectStatus) { return value[0].toUpperCase() + value.slice(1) }
async function archive(item: Prospect, event: Event) {
  event.stopPropagation()
  if (!confirm(`Archive ${item.name}? Its record will be preserved.`)) return
  error.value = ''; notice.value = ''
  try { await archiveProspect(item.id, item.version); notice.value = 'Prospect archived.'; page.value = 1; await load() }
  catch (reason) { error.value = errorMessage(reason, 'Prospect could not be archived.') }
}
</script>

<template>
  <section class="prospects-page">
    <header class="page-heading">
      <div><p class="eyebrow">Prospect Management</p><div class="prospect-title-row"><h1>Target organizations</h1><PageHeaderHelp :help="pageHelp" /></div><p>Keep company and contact details ready for future outbound work.</p></div>
      <div class="prospect-actions"><BaseButton variant="secondary" @click="importOpen = true">Import Excel</BaseButton><BaseButton @click="form = blank(); editorOpen = true">Add Prospect</BaseButton></div>
    </header>
    <p v-if="notice" class="prospect-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="prospect-error" role="alert">{{ error }}</p>
    <div class="prospect-filters"><BaseInput v-model="search" label="Search prospects" type="search" placeholder="Company, industry, contact, website"/><BaseInput v-model="industry" label="Industry" placeholder="Filter by any industry"/><BaseSelect v-model="status" label="Status" :options="statuses"/></div>
    <p class="prospect-total" aria-live="polite">{{ totalProspects.toLocaleString() }} total organizations</p>
    <div class="prospect-table-wrap">
      <table class="prospect-table"><thead><tr><th>Organization</th><th>Industry</th><th>Contact</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody><tr v-for="item in prospects" :key="item.id" tabindex="0" @click="router.push(`/prospects/${item.id}`)" @keydown.enter="router.push(`/prospects/${item.id}`)"><td><strong>{{ item.name }}</strong><small>{{ item.website || item.address || 'No website or address' }}</small></td><td>{{ item.industry || '—' }}</td><td>{{ item.contactName || '—' }}<small>{{ item.contactEmail || item.contactPhone || '' }}</small></td><td><span class="prospect-status">{{ statusLabel(item.status) }}</span></td><td>{{ item.source === 'excel_import' ? 'Excel import' : 'Manual' }}</td><td class="row-actions"><button type="button" class="row-action-view" @click.stop="router.push(`/prospects/${item.id}`)">View / Edit</button><button type="button" class="row-action-archive" @click="archive(item, $event)">Archive</button></td></tr>
        <tr v-if="!loading && !error && prospects.length === 0"><td colspan="6" class="prospect-empty">No prospects match these filters. Add one manually or import an Excel workbook.</td></tr>
        <tr v-if="loading"><td colspan="6" class="prospect-empty">Loading prospects…</td></tr></tbody>
      </table>
    </div>
    <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="totalProspects" :page-size-options="[10, 25, 50, 100]" />
    <BaseModal v-model="editorOpen" title="Add prospect" description="Enter the organization details you have. Unknown information can stay blank." size="wide">
      <form class="prospect-form" @submit.prevent="save">
        <BaseInput v-model="form.name" label="Company name" required maxlength="240"/><BaseInput v-model="form.industry" label="Industry / sector"/><BaseInput v-model="form.website" label="Website" type="url"/><BaseInput v-model="form.address" label="Address"/><BaseInput :model-value="form.employeeCount" label="Approximate employee count" type="number" min="0" @update:model-value="form.employeeCount = String($event)"/><BaseInput v-model="form.contactName" label="Contact name"/><BaseInput v-model="form.contactEmail" label="Contact email" type="email"/><BaseInput v-model="form.contactPhone" label="Contact phone"/><BaseSelect v-model="form.status" label="Prospect status" :options="statuses.slice(1)"/>
        <dl class="prospect-status-help prospect-form__wide" aria-label="Prospect status descriptions"><div v-for="item in statusDescriptions" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.description }}</dd></div></dl>
        <div class="prospect-form__wide"><BaseTextarea v-model="form.notes" label="Notes" :rows="3"/></div>
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
            <tr v-for="row in visiblePreviewRows" :key="row.rowNumber"><td><input v-if="row.status === 'valid' || row.status === 'ambiguous'" type="checkbox" :aria-label="row.status === 'ambiguous' ? `Import row ${row.rowNumber} as a separate organization` : `Select row ${row.rowNumber}`" :checked="selectedRows.has(row.rowNumber)" @change="selectImportRow(row.rowNumber, ($event.target as HTMLInputElement).checked)"><span v-else>—</span></td><td>{{ row.rowNumber }}</td><td>{{ row.data?.name || '—' }}</td><td>
              <span v-if="row.status === 'invalid'" class="prospect-error">{{ row.errors.join(' ') }}</span>
              <span v-else-if="row.status === 'duplicate'" class="duplicate-warning">Duplicate: {{ row.duplicateOf.map((item) => item.name).join(', ') }}. This row cannot be imported.</span>
              <span v-else-if="row.status === 'ambiguous'" class="duplicate-warning">Ambiguous match: {{ row.duplicateOf.map((item) => item.name + (item.rowNumber ? ` (row ${item.rowNumber})` : '')).join(', ') }}. Confirm only if this is a separate organization.</span>
              <span v-else>Ready to import</span>
            </td></tr>
          </tbody></table><TablePagination v-model:page="previewPage" v-model:page-size="previewPageSize" :total="preview.rows.length" :page-size-options="[5, 10, 25, 50]" /></div>
          <p v-if="importResult" role="status">{{ importResult }}</p>
          <div class="prospect-modal-footer"><BaseButton variant="secondary" @click="importOpen = false">Close</BaseButton><BaseButton v-if="selectedRows.size && !importDone" :loading="importBusy" @click="confirmImport">Confirm {{ selectedRows.size }} selected row{{ selectedRows.size === 1 ? '' : 's' }}</BaseButton></div>
        </template>
        <div v-else class="prospect-modal-footer"><BaseButton variant="secondary" @click="importOpen = false">Cancel</BaseButton></div>
      </div>
    </BaseModal>
  </section>
</template>

<style scoped>
.prospects-page{display:grid;gap:24px}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.page-heading h1{margin:4px 0 8px;font-size:32px}.prospect-title-row{display:flex;align-items:center;gap:10px}.page-heading p{margin:0;color:#687581}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#60716e}.prospect-actions,.prospect-modal-footer{display:flex;gap:10px;justify-content:flex-end}.prospect-filters{display:grid;grid-template-columns:minmax(240px,2fr) 1fr 1fr;gap:16px}.prospect-table-wrap,.import-preview{overflow:auto;border:1px solid #e1e7e5;border-radius:14px;background:white}.prospect-table{width:100%;border-collapse:collapse;text-align:left;min-width:720px}.prospect-table th,.prospect-table td{padding:14px 16px;border-bottom:1px solid #edf0ef;font-size:14px}.prospect-table th{color:#687581;font-weight:600;background:#fafcfb}.prospect-table tbody tr[tabindex]{cursor:pointer}.prospect-table tbody tr[tabindex]:hover{background:#f7faf8}.prospect-table small{display:block;color:#77827f;margin-top:4px}.prospect-status{padding:4px 9px;border-radius:99px;background:#edf4f0;font-size:12px}.prospect-empty{text-align:center;color:#697672;padding:36px!important}.prospect-notice{color:#186149}.prospect-error{color:#a13c36}.prospect-total{margin:0 0 -16px;color:#687581;font-size:13px}.prospect-form{display:grid;grid-template-columns:1fr 1fr;gap:16px}.prospect-form__wide{grid-column:1/-1}.prospect-status-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin:0;padding:14px 16px;border:1px solid #e1e7e5;border-radius:12px;background:#fafcfb}.prospect-status-help div{display:grid;gap:3px}.prospect-status-help dt{font-size:13px;font-weight:600;color:#34423d}.prospect-status-help dd{margin:0;color:#687581;font-size:12px;line-height:1.45}.prospect-import{display:grid;gap:16px}.file-field{display:grid;gap:8px;font-size:13px;font-weight:600}.duplicate-warning{color:#8b5a11}.import-summary{margin:0;color:#3e5a4e}@media(max-width:760px){.page-heading{align-items:flex-start;flex-direction:column}.prospect-filters,.prospect-form{grid-template-columns:1fr}.prospect-form__wide{grid-column:auto}.prospect-status-help{grid-template-columns:1fr}.prospect-actions{width:100%}}
.row-actions{display:flex;align-items:center;gap:8px;white-space:nowrap}.row-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 11px;border:1px solid #d8e4dc;border-radius:8px;background:#f2f7f4;color:#2f614b;font:inherit;font-size:13px;font-weight:600;line-height:1.2;text-decoration:none;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,transform .15s ease}.row-action-view:hover{border-color:#b8cebf;background:#e8f1eb}.row-actions .row-action-archive{border-color:#ead8d6;background:#fff;color:#93453f}.row-actions .row-action-archive:hover{border-color:#d9b9b5;background:#fff4f2}.row-actions button:active{transform:translateY(1px)}.row-actions button:focus-visible{outline:2px solid #3c765a;outline-offset:2px}
</style>
