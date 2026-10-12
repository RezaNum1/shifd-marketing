import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CalendarView from './CalendarView.vue'

const api = vi.hoisted(() => ({ load: vi.fn(), loadLibrary: vi.fn(), getById: vi.fn(), etagFor: vi.fn(), replace: vi.fn(), notify: vi.fn(), prospects: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), publish: vi.fn(), markPublished: vi.fn(), push: vi.fn(), entries: [] as any[] }))
vi.mock('../api/prospects', () => ({ listProspects: api.prospects }))
vi.mock('../api/scheduling', () => ({ createSchedules: api.create, updateSchedule: api.update, deleteSchedule: api.remove, publishSchedule: api.publish, getCalendar: vi.fn() }))
vi.mock('../stores/calendar', () => ({ useCalendarStore: () => ({ entries: api.entries, loaded: true, loading: false, error: '', load: api.load }) }))
vi.mock('../stores/contentLibrary', () => ({ useContentLibraryStore: () => ({ records: [{ id: 'content-1', title: 'Approval workflows', status: 'Approved', platforms: ['instagram'], targetIndustry: null, targetProspectId: null, planningNotes: null, details: { creative: { instagram: [], linkedin: [], linkedinReusesInstagram: false }, publications: {} } }], load: api.loadLibrary, getById: api.getById, etagFor: api.etagFor, replaceCanonical: api.replace, markPublished: api.markPublished }) }))
vi.mock('../stores/products', () => ({ useProductsStore: () => ({ products: [], load: vi.fn() }) }))
vi.mock('../stores/companyContext', () => ({ useCompanyContextStore: () => ({ companyProfile: { name: 'Shifd Labs' }, load: vi.fn() }) }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ notify: api.notify }) }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: api.push }) }))

const prospect = { id: 'prospect-1', name: 'PT Example', industry: 'Manufacturing', website: null, address: null, employeeCount: null, employeeSize: null, contactName: null, contactEmail: null, contactPhone: null, notes: null, status: 'lead', source: 'manual', archivedAt: null, createdAt: '', updatedAt: '', version: 1 }
const Button = { props: ['disabled', 'variant', 'type'], template: '<button :disabled="disabled" :type="type || \'button\'"><slot/></button>' }
const Input = { props: ['label', 'modelValue', 'type', 'list', 'placeholder'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' }
const Select = { props: ['label', 'modelValue', 'options', 'disabled'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{option.label}}</option></select></label>' }
const Modal = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{title}}</h2><slot/><slot name="footer"/></section>' }
const Header = { template: '<header><slot name="actions"/></header>' }

function mountPage() {
  return mount(CalendarView, { global: { stubs: {
    PageHeader: Header, BaseButton: Button, BaseInput: Input, BaseSelect: Select, BaseModal: Modal,
    BaseCard: { template: '<section><slot name="actions"/><slot/></section>' }, EmptyState: { props: ['title', 'description'], template: '<div><h2>{{title}}</h2><p>{{description}}</p><slot/></div>' },
    InlineAlert: true, AppIcon: true, StatusBadge: true, ContentAssetThumbnail: true,
  } } })
}

describe('CalendarView planning workflow', () => {
  beforeEach(() => {
    api.entries = []
    api.load.mockResolvedValue([]); api.loadLibrary.mockResolvedValue(undefined); api.prospects.mockResolvedValue({ data: [prospect] })
    api.getById.mockResolvedValue({ id: 'content-1', version: 1 }); api.etagFor.mockReturnValue('"1"')
    api.create.mockResolvedValue({ data: { id: 'content-1', version: 2 } }); api.update.mockResolvedValue({ data: { id: 'content-1', version: 2 } })
  })
  afterEach(() => vi.clearAllMocks())

  it('creates a prospect-linked industry plan from approved content', async () => {
    const wrapper = mountPage(); await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Plan Content')
    await wrapper.get('[aria-label="Target industry (optional)"]').setValue('Manufacturing')
    await wrapper.get('[aria-label="Linked prospect (optional)"]').setValue('prospect-1')
    await wrapper.findAll('button').find((button) => button.text() === 'Plan Content' && !button.element.closest('header'))?.trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith('content-1', [expect.objectContaining({ platform: 'instagram', timezone: expect.any(String), scheduledAt: expect.stringMatching(/[+-]\d\d:\d\d$/) })], '"1"', undefined, { targetIndustry: 'Manufacturing', targetProspectId: 'prospect-1', planningNotes: null })
    expect(api.notify).toHaveBeenCalledWith('Content planned.', 'success')
  })

  it('offers an explicit idea handoff when the calendar has no schedules', async () => {
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.text()).toContain('No content scheduled yet.')
    await wrapper.findAll('button').find((button) => button.text().includes('Continue an Idea'))?.trigger('click')
    expect(api.push).toHaveBeenCalledWith('/content/ideas')
  })

  it('edits a planned schedule and records publication only after user confirmation', async () => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    api.entries = [{ id: 'schedule-1', contentId: 'content-1', title: 'Approval workflows', platform: 'instagram', contextName: 'Shifd Labs', pillar: 'Educational', targetIndustry: 'Manufacturing', prospect, planningNotes: 'Internal', plannedBy: { id: 'user-1', name: 'Founder' }, scheduleCreatedAt: now.toISOString(), scheduleUpdatedAt: now.toISOString(), scheduledDate: date, scheduledTime: '09:00', scheduledAt: now, status: 'Scheduled' }]
    api.markPublished.mockResolvedValue(true)
    const wrapper = mountPage(); await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Approval workflows'))?.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Edit / Reschedule')?.trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Planned time"]').setValue('10:30')
    await wrapper.findAll('button').find((button) => button.text() === 'Save Changes')?.trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('schedule-1', expect.objectContaining({ targetIndustry: 'Manufacturing', targetProspectId: 'prospect-1', planningNotes: 'Internal', scheduledAt: expect.stringContaining('T10:30:00') }), '"1"')
    await wrapper.findAll('button').find((button) => button.text() === 'Mark as Published')?.trigger('click')
    await flushPromises()
    expect(api.markPublished).not.toHaveBeenCalled()
    await wrapper.findAll('button').find((button) => button.text() === 'Confirm Publication')?.trigger('click')
    await flushPromises()
    expect(api.markPublished).toHaveBeenCalledWith('content-1', 'instagram', expect.objectContaining({ publishedAt: expect.stringMatching(/[+-]\d\d:\d\d$/), postUrl: '' }))
  })
})
