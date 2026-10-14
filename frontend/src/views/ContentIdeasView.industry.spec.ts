import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ContentIdeasView from './ContentIdeasView.vue'

const api = vi.hoisted(() => ({ generate: vi.fn(), prospects: vi.fn(), discover: vi.fn(), save: vi.fn(), load: vi.fn(), push: vi.fn(), notify: vi.fn(), startFromIdea: vi.fn() }))
vi.mock('../api/industryIdeation', () => ({ generateIndustryIdeas: api.generate }))
vi.mock('../api/prospects', () => ({ listProspects: api.prospects }))
vi.mock('../api/topicDiscovery', () => ({ latestDiscovery: vi.fn(), discoverTopics: api.discover, useTopicCandidate: vi.fn() }))
vi.mock('../stores/contentIdeas', () => ({ useContentIdeasStore: () => ({ ideas: [], loading: false, loaded: true, error: '', load: api.load, save: api.save, duplicate: vi.fn(), archive: vi.fn(), restore: vi.fn(), remove: vi.fn() }) }))
vi.mock('../stores/contentWorkflow', () => ({ useContentWorkflowStore: () => ({ startFromIdea: api.startFromIdea, startNewWorkflow: vi.fn() }) }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ notify: api.notify }) }))
vi.mock('../stores/products', () => ({ useProductsStore: () => ({ productOptions: [{ value: 'product-1', label: 'Shifd Approval' }], load: vi.fn(), nameFor: () => '' }) }))
vi.mock('../stores/companyContext', () => ({ useCompanyContextStore: () => ({ companyProfile: { name: 'Shifd Labs' }, load: vi.fn(), loadTaxonomy: vi.fn() }) }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: api.push }) }))

const prospect = { id: 'prospect-1', name: 'Example Logistics', industry: 'Logistics', website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '', updatedAt: '', version: 1 }
const generated = { title: 'Clear approvals across dispatch teams', angle: 'Explain a practical coordination pattern.', hook: 'Who needs to review an operational request?', targetAudience: 'Logistics operations leaders', talkingPoints: ['Map the request owner', 'Make review steps visible'], industryRelevance: 'A useful general workflow topic for logistics businesses.', capability: 'Shifd Approval', format: 'Carousel', platform: 'LinkedIn', softCta: 'See how a clearer approval flow works.', evidence: [] }
const topic = { id: 'topic-1', position: 1, title: 'Digital approval trends', summary: 'Teams are modernizing approvals.', whyCurrent: 'Recent developments.', relevanceToCompany: 'Relevant to Shifd workflows.', contentAngle: 'Make approvals visible.', suggestedObjective: 'Education', suggestedPlatforms: ['linkedin'], sources: [{ title: 'Industry report', url: 'https://example.com/report', publisher: 'Example', publishedAt: null, observedAt: '' }], selectedAt: null, createdIdeaId: null, createdAt: '' }
const candidateRun = { id: 'run-1', companyId: 'company-1', productId: null, market: 'ID', timeframe: 'last_7_days', focus: 'digital approval', status: 'completed', searchedAt: '2026-10-14T00:00:00.000Z', createdAt: '', candidates: [topic] }
const Modal = { props: ['modelValue', 'title', 'size'], template: '<section v-if="modelValue" role="dialog" :data-size="size"><h2>{{title}}</h2><slot/><slot name="footer"/></section>' }
const Button = { props: ['type', 'loading', 'disabled', 'ariaPressed'], template: '<button :type="type || \'button\'" :disabled="disabled || loading" :aria-pressed="ariaPressed"><slot/></button>' }
const Select = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{option.label}}</option></select></label>' }
const Input = { props: ['label', 'modelValue', 'required'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :value="modelValue" :required="required" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' }
const Textarea = { props: ['label', 'modelValue'], emits: ['update:modelValue'], template: '<label>{{label}}<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' }
const Header = { template: '<header><slot name="actions"/></header>' }

function mountPage() { return mount(ContentIdeasView, { global: { stubs: { BaseButton: Button, ContentIdeaEditor: true, BaseModal: Modal, BaseTable: true, PageHeader: Header, BaseCard: true, EmptyState: { props: ['title', 'description'], template: '<div><strong>{{title}}</strong><p>{{description}}</p></div>' }, StatusBadge: true, InlineAlert: { props: ['title'], template: '<div role="status">{{title}}<slot/></div>' }, AppIcon: true, BaseInput: Input, BaseSelect: Select, BaseTextarea: Textarea } } }) }
function button(wrapper: ReturnType<typeof mountPage>, label: string) { return wrapper.findAll('button').find((item) => item.text().includes(label))! }

describe('unified Content Ideas ideation', () => {
  beforeEach(() => {
    api.prospects.mockResolvedValue({ data: [prospect] })
    api.generate.mockResolvedValue({ data: { ideas: [generated], context: {}, usage: {} } })
    api.discover.mockResolvedValue({ data: candidateRun })
    api.save.mockResolvedValue({ ...generated, id: 'idea-1', contextType: 'company', pillar: 'industry', objective: 'education', status: 'Ready', createdAt: '', updatedAt: '' })
    api.load.mockResolvedValue(undefined)
  })
  afterEach(() => vi.clearAllMocks())

  it('offers one entry point and switches mode-specific fields', async () => {
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.text()).toContain('Create Ideas')
    expect(wrapper.text()).not.toContain('Discover Current Topics')
    expect(wrapper.text()).not.toContain('Generate Ideas')
    await button(wrapper, 'Create Ideas').trigger('click')
    expect(wrapper.find('[data-size="large"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Exploration theme"]').exists()).toBe(true)
    await button(wrapper, 'Industry-Based').trigger('click')
    expect(wrapper.find('[aria-label="Target industry"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Exploration theme"]').exists()).toBe(false)
    await wrapper.get('[aria-label="Target industry"]').setValue('__custom__')
    expect(wrapper.find('[aria-label="Custom industry"]').exists()).toBe(true)
    await button(wrapper, 'Product-Based').trigger('click')
    expect(wrapper.find('[aria-label="Shifd product"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Target industry"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Custom industry"]').exists()).toBe(false)
  })

  it('discovers topics inline then generates and persists ideas with source references', async () => {
    const wrapper = mountPage(); await flushPromises()
    await button(wrapper, 'Create Ideas').trigger('click')
    await wrapper.get('[aria-label="Exploration theme"]').setValue('digital approval')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(button(wrapper, 'Find Topics').exists()).toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.discover).toHaveBeenCalledWith(expect.objectContaining({ focus: 'digital approval', timeframe: 'last_7_days' }))
    expect(wrapper.text()).toContain(topic.title)
    expect(wrapper.text()).toContain('Generate Ideas')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({ industry: null, productId: null, guidance: expect.stringContaining(topic.title) }))
    expect(wrapper.text()).toContain(generated.title)
    await button(wrapper, 'Save Idea').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ evidenceReferences: [expect.objectContaining({ claim: expect.stringContaining(topic.title), sources: [{ title: 'Industry report', url: 'https://example.com/report' }] })] }), undefined)
  })

  it('generates industry ideas without a prospect and continues through the existing workflow', async () => {
    const wrapper = mountPage(); await flushPromises()
    await button(wrapper, 'Create Ideas').trigger('click')
    await button(wrapper, 'Industry-Based').trigger('click')
    await wrapper.get('[aria-label="Target industry"]').setValue('Logistics')
    expect(wrapper.text()).toContain('Target prospect (optional)')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({ industry: 'Logistics', prospectId: null }))
    await button(wrapper, 'Continue to Content').trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: generated.title, targetIndustry: 'Logistics', targetProspectId: undefined }), undefined)
    expect(api.startFromIdea).toHaveBeenCalledWith(expect.objectContaining({ id: 'idea-1' }))
    expect(api.push).toHaveBeenCalledWith('/content/create')
  })

  it('generates product ideas with product context and lets current-topic grounding be turned off', async () => {
    const wrapper = mountPage(); await flushPromises()
    await button(wrapper, 'Create Ideas').trigger('click')
    await button(wrapper, 'Product-Based').trigger('click')
    await wrapper.get('[aria-label="Shifd product"]').setValue('product-1')
    await wrapper.get('[aria-label="Supporting keyword or focus (optional)"]').setValue('approval visibility')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('input[type="checkbox"]').setValue(false)
    expect(wrapper.find('[aria-label="Search timeframe"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({ industry: null, productId: 'product-1', guidance: expect.stringContaining('approval visibility') }))
  })

  it('shows empty and error states and permits topic discovery retry', async () => {
    api.discover.mockResolvedValueOnce({ data: { ...candidateRun, candidates: [] } }).mockRejectedValueOnce(new Error('search failed'))
    const wrapper = mountPage(); await flushPromises()
    await button(wrapper, 'Create Ideas').trigger('click')
    await wrapper.get('[aria-label="Exploration theme"]').setValue('FMCG')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No strong current topics were found.')
    expect(button(wrapper, 'Find Topics').exists()).toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Current topic discovery could not be completed.')
    expect(button(wrapper, 'Find Topics').exists()).toBe(true)
  })

  it('shows generation failures without leaving the unified drawer', async () => {
    api.generate.mockRejectedValueOnce(new Error('generation failed'))
    const wrapper = mountPage(); await flushPromises()
    await button(wrapper, 'Create Ideas').trigger('click')
    await wrapper.get('[aria-label="Exploration theme"]').setValue('paperless workflow')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Content ideation could not be completed.')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
})
