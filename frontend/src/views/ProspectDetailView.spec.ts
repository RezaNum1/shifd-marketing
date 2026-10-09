import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProspectDetailView from './ProspectDetailView.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), archive: vi.fn() }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../api/prospects', () => ({ getProspect: api.get, updateProspect: api.update, archiveProspect: api.archive }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => router, useRoute: () => ({ params: { id: 'prospect-1' } }) }))

const BaseInput = { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></label>' }
const BaseSelect = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{o.label}}</option></select></label>' }
const BaseTextarea = { props: ['label', 'modelValue'], emits: ['update:modelValue'], template: '<label>{{label}}<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></label>' }
const BaseButton = { props: ['type', 'loading'], template: '<button :type="type || \'button\'" :disabled="loading"><slot /></button>' }
const prospect = { id: 'prospect-1', name: 'Original Name', industry: null, website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1 }
function mountDetail() { return mount(ProspectDetailView, { global: { stubs: { BaseInput, BaseSelect, BaseTextarea, BaseButton, RouterLink: true } } }) }

describe('Prospect detail view', () => {
  beforeEach(() => { api.get.mockResolvedValue({ data: { ...prospect } }); api.update.mockResolvedValue({ data: { ...prospect, name: 'Edited Name', version: 2 } }); api.archive.mockResolvedValue({ data: { ...prospect, archivedAt: '2026-01-02T00:00:00.000Z' } }); vi.stubGlobal('confirm', vi.fn(() => true)) })
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })
  it('loads, edits, and saves the prospect with its current version', async () => {
    const wrapper = mountDetail(); await flushPromises()
    await wrapper.get('[aria-label="Company name"]').setValue('Edited Name')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(api.update).toHaveBeenCalledWith('prospect-1', expect.objectContaining({ name: 'Edited Name' }), 1)
    expect(wrapper.text()).toContain('Prospect changes saved.')
  })
  it('archives with confirmation and returns to the prospect list', async () => {
    const wrapper = mountDetail(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Archive')?.trigger('click'); await flushPromises()
    expect(api.archive).toHaveBeenCalledWith('prospect-1', 1)
    expect(router.push).toHaveBeenCalledWith('/prospects')
  })
})
