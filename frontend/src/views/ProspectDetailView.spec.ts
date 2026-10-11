import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProspectDetailView from './ProspectDetailView.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), archive: vi.fn(), startResearch: vi.fn(), listResearch: vi.fn(), getResearch: vi.fn(), reviewClaim: vi.fn(), listDrafts: vi.fn(), getDraft: vi.fn(), createDraft: vi.fn(), updateDraft: vi.fn(), archiveDraft: vi.fn(), facts: vi.fn(), generateDraft: vi.fn() }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../api/prospects', () => ({ getProspect: api.get, updateProspect: api.update, archiveProspect: api.archive, startProspectResearch: api.startResearch, listProspectResearch: api.listResearch, getProspectResearch: api.getResearch, reviewProspectResearchClaim: api.reviewClaim, listProspectEmailDrafts: api.listDrafts, getProspectEmailDraft: api.getDraft, createProspectEmailDraft: api.createDraft, updateProspectEmailDraft: api.updateDraft, archiveProspectEmailDraft: api.archiveDraft, getProspectOutreachFacts: api.facts, generateProspectEmailDraft: api.generateDraft }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => router, useRoute: () => ({ params: { id: 'prospect-1' } }) }))

const BaseInput = { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></label>' }
const BaseSelect = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{o.label}}</option></select></label>' }
const BaseTextarea = { props: ['label', 'modelValue'], emits: ['update:modelValue'], template: '<label>{{label}}<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></label>' }
const BaseButton = { props: ['type', 'loading'], template: '<button :type="type || \'button\'" :disabled="loading"><slot /></button>' }
const prospect = { id: 'prospect-1', name: 'Original Name', industry: null, website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1 }
const research = { id: 'run-1', prospectId: 'prospect-1', status: 'completed', identityStatus: 'matched', identityExplanation: 'Website matches.', summary: 'Public company overview.', limitations: [], researchedAt: '2026-01-02T00:00:00.000Z', createdAt: '2026-01-02T00:00:00.000Z', provider: 'openai', model: 'test-model', usage: { inputTokens: '1', outputTokens: '2', estimatedCostUsd: null }, sources: [{ id: 'source-1', title: 'Official overview', publisher: null, domain: 'example.test', url: 'https://example.test/about', retrievedAt: '2026-01-02T00:00:00.000Z', sourceType: 'official', availability: 'retrieved' }], claims: [{ id: 'claim-1', text: 'Synthetic company serves logistics teams.', category: 'overview', claimType: 'sourced_fact', reviewStatus: 'pending', reviewNote: null, reviewedAt: null, reviewedBy: null, sources: [{ id: 'source-1', title: 'Official overview', domain: 'example.test', url: 'https://example.test/about' }] }, { id: 'claim-2', text: 'A centralized workflow may help a distributed operator.', category: 'opportunity', claimType: 'hypothesis', reviewStatus: 'pending', reviewNote: null, reviewedAt: null, reviewedBy: null, sources: [] }] }
const savedDraft = { id: 'draft-1', prospectId: 'prospect-1', recipientName: null, recipientEmail: null, subject: 'Introduction', body: 'Hello, may we share more?', language: 'English', tone: 'professional', objective: 'introduce_shifd_labs', offering: 'custom_web_application', origin: 'manual', status: 'draft', createdBy: 'user-1', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z', version: 1, generation: null, researchClaims: [] }
const eligibleFact = { id: 'fact-1', text: 'Synthetic company offers logistics services.', category: 'products_services', claimType: 'sourced_fact', reviewStatus: 'approved', reviewedAt: '2026-01-02T00:00:00.000Z', runId: 'run-1', researchedAt: '2026-01-02T00:00:00.000Z', sources: [{ id: 'source-1', title: 'Official overview', domain: 'example.test', url: 'https://example.test/about' }] }
function mountDetail() { return mount(ProspectDetailView, { global: { stubs: { BaseInput, BaseSelect, BaseTextarea, BaseButton, RouterLink: true } } }) }

describe('Prospect detail view', () => {
  beforeEach(() => { api.get.mockResolvedValue({ data: { ...prospect } }); api.update.mockResolvedValue({ data: { ...prospect, name: 'Edited Name', version: 2 } }); api.archive.mockResolvedValue({ data: { ...prospect, archivedAt: '2026-01-02T00:00:00.000Z' } }); api.listResearch.mockResolvedValue({ data: [] }); api.getResearch.mockResolvedValue({ data: null }); api.startResearch.mockResolvedValue({ data: null }); api.reviewClaim.mockResolvedValue({ data: {} }); api.listDrafts.mockResolvedValue({ data: [] }); api.facts.mockResolvedValue({ data: [eligibleFact] }); api.createDraft.mockResolvedValue({ data: savedDraft }); api.updateDraft.mockResolvedValue({ data: { ...savedDraft, subject: 'Edited' } }); api.getDraft.mockResolvedValue({ data: savedDraft }); api.archiveDraft.mockResolvedValue({ data: { id: 'draft-1', status: 'archived' } }); api.generateDraft.mockResolvedValue({ data: { subject: 'AI introduction', body: 'Hello, synthetic prospect.', generationId: 'generation-1', claims: [eligibleFact], usage: { inputTokens: 10, outputTokens: 20 } } }); vi.stubGlobal('confirm', vi.fn(() => true)) })
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
  it('creates a manual draft and reloads it from saved drafts', async () => {
    const wrapper = mountDetail(); await flushPromises()
    expect(wrapper.text()).toContain('No saved drafts for this prospect.')
    await wrapper.findAll('button').find((button) => button.text() === 'Manual Draft')?.trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Email subject"]').setValue('Introduction')
    await wrapper.get('[aria-label="Email body"]').setValue('Hello, may we share more?')
    await wrapper.findAll('button').find((button) => button.text() === 'Save draft')?.trigger('click'); await flushPromises()
    expect(api.createDraft).toHaveBeenCalledWith('prospect-1', expect.objectContaining({ subject: 'Introduction', body: 'Hello, may we share more?', origin: 'manual' }))
    expect(wrapper.text()).toContain('Draft saved.')
  })
  it('keeps saved drafts and manual drafting available when approved facts cannot load', async () => {
    api.listDrafts.mockResolvedValue({ data: [{ id: 'draft-1', subject: savedDraft.subject, origin: 'manual', status: 'draft', language: 'English', createdAt: savedDraft.createdAt, updatedAt: savedDraft.updatedAt }] })
    api.facts.mockRejectedValue(new Error('research service unavailable'))
    const wrapper = mountDetail(); await flushPromises()
    expect(wrapper.text()).toContain('Introduction')
    await wrapper.findAll('button').find((button) => button.text() === 'Manual Draft')?.trigger('click')
    await wrapper.get('[aria-label="Email subject"]').setValue('Manual without research')
    await wrapper.get('[aria-label="Email body"]').setValue('Hello.')
    await wrapper.findAll('button').find((button) => button.text() === 'Save draft')?.trigger('click'); await flushPromises()
    expect(api.createDraft).toHaveBeenCalledWith('prospect-1', expect.objectContaining({ origin: 'manual', subject: 'Manual without research' }))
  })
  it('generates an AI draft with an approved fact and saves an editable result', async () => {
    const wrapper = mountDetail(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Generate with AI')?.trigger('click')
    await flushPromises()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.find('.generation-form').trigger('submit'); await flushPromises()
    expect(api.generateDraft).toHaveBeenCalledWith('prospect-1', expect.objectContaining({ claimIds: ['fact-1'], language: 'English' }))
    expect(wrapper.text()).toContain('Review and edit the generated content before saving.')
    const evidenceLink = wrapper.find('a[href="https://example.test/about"]')
    expect(evidenceLink.exists()).toBe(true)
    expect(evidenceLink.attributes('rel')).toBe('noopener noreferrer')
    await wrapper.get('[aria-label="Email subject"]').setValue('Reviewed subject')
    await wrapper.findAll('button').find((button) => button.text() === 'Save draft')?.trigger('click'); await flushPromises()
    expect(api.createDraft).toHaveBeenCalledWith('prospect-1', expect.objectContaining({ origin: 'ai', generationId: 'generation-1', claimIds: ['fact-1'], subject: 'Reviewed subject' }))
  })
  it('reopens saved drafts and copies the subject and body', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    api.listDrafts.mockResolvedValue({ data: [{ id: 'draft-1', subject: savedDraft.subject, origin: 'manual', status: 'draft', language: 'English', createdAt: savedDraft.createdAt, updatedAt: savedDraft.updatedAt }] })
    const wrapper = mountDetail(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Introduction'))?.trigger('click'); await flushPromises()
    expect(api.getDraft).toHaveBeenCalledWith('prospect-1', 'draft-1')
    await wrapper.findAll('button').find((button) => button.text() === 'Copy subject')?.trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledWith('Introduction')
    await wrapper.findAll('button').find((button) => button.text() === 'Copy body')?.trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledWith('Hello, may we share more?')
  })
})
