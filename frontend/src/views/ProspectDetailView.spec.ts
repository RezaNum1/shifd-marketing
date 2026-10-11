import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProspectDetailView from './ProspectDetailView.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), archive: vi.fn(), startResearch: vi.fn(), listResearch: vi.fn(), getResearch: vi.fn(), reviewClaim: vi.fn() }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../api/prospects', () => ({ getProspect: api.get, updateProspect: api.update, archiveProspect: api.archive, startProspectResearch: api.startResearch, listProspectResearch: api.listResearch, getProspectResearch: api.getResearch, reviewProspectResearchClaim: api.reviewClaim }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => router, useRoute: () => ({ params: { id: 'prospect-1' } }) }))

const BaseInput = { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></label>' }
const BaseSelect = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{o.label}}</option></select></label>' }
const BaseTextarea = { props: ['label', 'modelValue'], emits: ['update:modelValue'], template: '<label>{{label}}<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></label>' }
const BaseButton = { props: ['type', 'loading'], template: '<button :type="type || \'button\'" :disabled="loading"><slot /></button>' }
const prospect = { id: 'prospect-1', name: 'Original Name', industry: null, website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1 }
const research = { id: 'run-1', prospectId: 'prospect-1', status: 'completed', identityStatus: 'matched', identityExplanation: 'Website matches.', summary: 'Public company overview.', limitations: [], researchedAt: '2026-01-02T00:00:00.000Z', createdAt: '2026-01-02T00:00:00.000Z', provider: 'openai', model: 'test-model', usage: { inputTokens: '1', outputTokens: '2', estimatedCostUsd: null }, sources: [{ id: 'source-1', title: 'Official overview', publisher: null, domain: 'example.test', url: 'https://example.test/about', retrievedAt: '2026-01-02T00:00:00.000Z', sourceType: 'official', availability: 'retrieved' }], claims: [{ id: 'claim-1', text: 'Synthetic company serves logistics teams.', category: 'overview', claimType: 'sourced_fact', reviewStatus: 'pending', reviewNote: null, reviewedAt: null, reviewedBy: null, sources: [{ id: 'source-1', title: 'Official overview', domain: 'example.test', url: 'https://example.test/about' }] }, { id: 'claim-2', text: 'A centralized workflow may help a distributed operator.', category: 'opportunity', claimType: 'hypothesis', reviewStatus: 'pending', reviewNote: null, reviewedAt: null, reviewedBy: null, sources: [] }] }
function mountDetail() { return mount(ProspectDetailView, { global: { stubs: { BaseInput, BaseSelect, BaseTextarea, BaseButton, RouterLink: true } } }) }

describe('Prospect detail view', () => {
  beforeEach(() => { api.get.mockResolvedValue({ data: { ...prospect } }); api.update.mockResolvedValue({ data: { ...prospect, name: 'Edited Name', version: 2 } }); api.archive.mockResolvedValue({ data: { ...prospect, archivedAt: '2026-01-02T00:00:00.000Z' } }); api.listResearch.mockResolvedValue({ data: [] }); api.getResearch.mockResolvedValue({ data: null }); api.startResearch.mockResolvedValue({ data: null }); api.reviewClaim.mockResolvedValue({ data: {} }); vi.stubGlobal('confirm', vi.fn(() => true)) })
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
  it('renders the research empty state and starts an explicit research run', async () => {
    const wrapper = mountDetail(); await flushPromises()
    expect(wrapper.text()).toContain('Company Research')
    expect(wrapper.text()).toContain('No company research yet')
    await wrapper.findAll('button').find((button) => button.text() === 'Research Company')?.trigger('click'); await flushPromises()
    expect(api.startResearch).toHaveBeenCalledWith('prospect-1')
  })
  it('renders source evidence, identity state, and saves an individual fact review', async () => {
    api.listResearch.mockResolvedValue({ data: [{ id: 'run-1', status: 'completed', identityStatus: 'matched', summary: research.summary, researchedAt: research.researchedAt, createdAt: research.createdAt }] })
    api.getResearch.mockResolvedValue({ data: research })
    const wrapper = mountDetail(); await flushPromises()
    expect(wrapper.text()).toContain('Research Sources')
    expect(wrapper.text()).toContain('Potential Opportunity — Not a Confirmed Company Problem')
    const link = wrapper.find('a[href="https://example.test/about"]')
    expect(link.attributes('target')).toBe('_blank'); expect(link.attributes('rel')).toBe('noopener noreferrer')
    await wrapper.get('.note-field textarea').setValue('I checked the company website.')
    await wrapper.findAll('button').find((button) => button.text() === 'Approve')?.trigger('click'); await flushPromises()
    expect(api.reviewClaim).toHaveBeenCalledWith('prospect-1', 'claim-1', 'approved', 'I checked the company website.')
  })
  it('shows the research loading and error states', async () => {
    let resolveResearch!: (value: { data: null }) => void
    api.startResearch.mockReturnValue(new Promise((resolve) => { resolveResearch = resolve }))
    const wrapper = mountDetail(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Research Company')?.trigger('click')
    expect(wrapper.text()).toContain('Researching public sources')
    resolveResearch({ data: null }); await flushPromises()
    api.startResearch.mockRejectedValueOnce(new Error('provider offline'))
    await wrapper.findAll('button').find((button) => button.text() === 'Research Company')?.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Company research could not be completed.')
  })
})
