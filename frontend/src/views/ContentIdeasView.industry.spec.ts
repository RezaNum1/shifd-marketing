import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ContentIdeasView from './ContentIdeasView.vue'

const api = vi.hoisted(() => ({ generate: vi.fn(), prospects: vi.fn(), latest: vi.fn(), discover: vi.fn(), useCandidate: vi.fn(), save: vi.fn(), load: vi.fn(), push: vi.fn(), notify: vi.fn(), startFromIdea: vi.fn() }))
vi.mock('../api/industryIdeation', () => ({ generateIndustryIdeas: api.generate }))
vi.mock('../api/prospects', () => ({ listProspects: api.prospects }))
vi.mock('../api/topicDiscovery', () => ({ latestDiscovery: api.latest, discoverTopics: api.discover, useTopicCandidate: api.useCandidate }))
vi.mock('../stores/contentIdeas', () => ({ useContentIdeasStore: () => ({ ideas: [], loading: false, loaded: true, error: '', load: api.load, save: api.save, duplicate: vi.fn(), archive: vi.fn(), restore: vi.fn(), remove: vi.fn() }) }))
vi.mock('../stores/contentWorkflow', () => ({ useContentWorkflowStore: () => ({ startFromIdea: api.startFromIdea, startNewWorkflow: vi.fn() }) }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ notify: api.notify }) }))
vi.mock('../stores/products', () => ({ useProductsStore: () => ({ productOptions: [], load: vi.fn(), nameFor: () => '' }) }))
vi.mock('../stores/companyContext', () => ({ useCompanyContextStore: () => ({ companyProfile: { name: 'Shifd Labs' }, load: vi.fn(), loadTaxonomy: vi.fn() }) }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: api.push }) }))

const prospect = { id: 'prospect-1', name: 'Example Logistics', industry: 'Logistics', website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '', updatedAt: '', version: 1 }
const generated = { title: 'Clear approvals across dispatch teams', angle: 'Explain a practical coordination pattern.', hook: 'Who needs to review an operational request?', targetAudience: 'Logistics operations leaders', talkingPoints: ['Map the request owner', 'Make review steps visible'], industryRelevance: 'A useful general workflow topic for logistics businesses.', capability: 'Shifd Approval', format: 'Carousel', platform: 'LinkedIn', softCta: 'See how a clearer approval flow works.', evidence: [] }
const Drawer = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{title}}</h2><slot/><slot name="footer"/></section>' }
const Button = { props: ['type', 'loading', 'disabled'], template: '<button :type="type || \'button\'" :disabled="disabled || loading"><slot/></button>' }
const Select = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{option.label}}</option></select></label>' }
const Header = { template: '<header><slot name="actions"/></header>' }

function mountPage() { return mount(ContentIdeasView, { global: { stubs: { BaseDrawer: Drawer, BaseButton: Button, ContentIdeaEditor: true, BaseModal: true, BaseTable: true, PageHeader: Header, BaseCard: true, EmptyState: true, StatusBadge: true, InlineAlert: true, AppIcon: true, BaseInput: true, BaseSelect: Select, BaseTextarea: true } } }) }

describe('industry ideation in Content Ideas', () => {
  beforeEach(() => {
    api.prospects.mockResolvedValue({ data: [prospect] }); api.latest.mockResolvedValue({ data: null })
    api.generate.mockResolvedValue({ data: { ideas: [generated], context: {}, usage: {} } })
    api.save.mockResolvedValue({ ...generated, id: 'idea-1', contextType: 'company', pillar: 'industry', objective: 'education', status: 'Ready', createdAt: '', updatedAt: '' })
    api.load.mockResolvedValue(undefined)
  })
  afterEach(() => vi.clearAllMocks())

  it('generates without a prospect, renders the idea, and continues through the existing workflow', async () => {
    const wrapper = mountPage(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Generate Ideas'))?.trigger('click')
    expect(wrapper.text()).toContain('Target prospect (optional)')
    await wrapper.get('[aria-label="Target industry"]').setValue('Logistics')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({ industry: 'Logistics', prospectId: null }))
    expect(wrapper.text()).toContain(generated.title)
    await wrapper.findAll('button').find((button) => button.text().includes('Continue to Content'))?.trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: generated.title, targetIndustry: 'Logistics', targetProspectId: undefined }), undefined)
    expect(api.startFromIdea).toHaveBeenCalledWith(expect.objectContaining({ id: 'idea-1' }))
    expect(api.push).toHaveBeenCalledWith('/content/create')
  })
})
