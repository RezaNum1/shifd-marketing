import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProspectsView from './ProspectsView.vue'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), preview: vi.fn(), confirm: vi.fn() }))
vi.mock('../api/prospects', () => ({
  listProspects: api.list,
  createProspect: api.create,
  previewProspectImport: api.preview,
  confirmProspectImport: api.confirm,
}))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: vi.fn() }) }))

const BaseInput = {
  props: ['label', 'modelValue', 'type', 'required'], emits: ['update:modelValue'],
  template: '<label>{{label}}<input :type="type || \'text\'" :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></label>',
}
const BaseSelect = {
  props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'],
  template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{option.label}}</option></select></label>',
}
const BaseTextarea = {
  props: ['label', 'modelValue'], emits: ['update:modelValue'],
  template: '<label>{{label}}<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></label>',
}
const BaseButton = { props: ['type', 'disabled', 'loading'], template: '<button :type="type || \'button\'" :disabled="disabled || loading"><slot /></button>' }
const BaseModal = {
  props: ['modelValue', 'title'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" role="dialog"><h2>{{title}}</h2><slot /><slot name="footer" /></section>',
}
function mountPage() {
  return mount(ProspectsView, { global: { stubs: { BaseInput, BaseSelect, BaseTextarea, BaseButton, BaseModal, RouterLink: true } } })
}
const validImport = { rowNumber: 2, data: { name: 'Imported Example' }, errors: [], duplicateOf: [], status: 'valid' as const }

describe('Prospects view', () => {
  beforeEach(() => { api.list.mockResolvedValue({ data: [] }); api.create.mockResolvedValue({ data: {} }); api.preview.mockResolvedValue({ data: { previewToken: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000).toISOString(), headers: [{ column: 1, label: 'Company' }], mapping: { name: 1 }, rows: [validImport], summary: { total: 1, valid: 1, invalid: 0, duplicates: 0, ambiguous: 0 } } }); api.confirm.mockResolvedValue({ data: { imported: 1, duplicates: 0, skipped: [], prospects: [] } }) })
  afterEach(() => { vi.clearAllMocks() })

  it('shows the empty state and sends list search and filters', async () => {
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.text()).toContain('No prospects match these filters')
    await wrapper.get('[aria-label="Search prospects"]').setValue('Acme')
    await wrapper.get('[aria-label="Status"]').setValue('qualified')
    await new Promise((resolve) => setTimeout(resolve, 220)); await flushPromises()
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ toString: expect.any(Function) }))
    const params = api.list.mock.calls.at(-1)?.[0] as URLSearchParams
    expect(params.get('search')).toBe('Acme'); expect(params.get('status')).toBe('qualified')
    wrapper.unmount()
  })

  it('creates a prospect from the manual form', async () => {
    const wrapper = mountPage(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Add Prospect')?.trigger('click')
    await wrapper.get('[aria-label="Company name"]').setValue('Manual Example')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Manual Example', status: 'lead' }))
    expect(wrapper.text()).toContain('Prospect added.')
  })

  it('previews an Excel file and requires a separate confirmation action', async () => {
    const wrapper = mountPage(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Import Excel')?.trigger('click')
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['synthetic'], 'targets.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] })
    await input.trigger('change')
    await wrapper.findAll('button').find((button) => button.text() === 'Preview workbook')?.trigger('click')
    await flushPromises()
    expect(api.preview).toHaveBeenCalledOnce(); expect(wrapper.text()).toContain('Imported Example')
    expect(api.confirm).not.toHaveBeenCalled()
    await wrapper.findAll('button').find((button) => button.text().includes('Confirm 1 selected row'))?.trigger('click')
    await flushPromises()
    expect(api.confirm).toHaveBeenCalledOnce(); expect(wrapper.text()).toContain('1 prospect imported')
  })

  it('shows API errors without hiding the page', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Prospects could not be loaded')
  })
})
