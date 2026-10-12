import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PerformanceView from './PerformanceView.vue'

const mocks = vi.hoisted(() => ({
  load: vi.fn(), loadEvaluation: vi.fn(), configureEvaluation: vi.fn(), recordSnapshot: vi.fn(), addBusinessInquiry: vi.fn(), addProductionTime: vi.fn(),
  contentLoad: vi.fn(), prospects: vi.fn(), notify: vi.fn(), push: vi.fn(),
  evaluation: null as any,
}))
vi.mock('../stores/performance', () => ({ usePerformanceStore: () => ({
  report: null, weeklyMetrics: [], inboundInquiries: [], publications: [], loading: false, supportingLoading: false, loaded: false, error: '',
  evaluation: mocks.evaluation, evaluationLoading: false, evaluationError: '', load: mocks.load, loadEvaluation: mocks.loadEvaluation,
  configureEvaluation: mocks.configureEvaluation, recordSnapshot: mocks.recordSnapshot, addBusinessInquiry: mocks.addBusinessInquiry, addProductionTime: mocks.addProductionTime,
}) }))
vi.mock('../stores/contentLibrary', () => ({ useContentLibraryStore: () => ({ records: [{ id: 'content-1', title: 'Approval workflow', status: 'Ready', platforms: [] }], load: mocks.contentLoad }) }))
vi.mock('../api/prospects', () => ({ listProspects: mocks.prospects }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ notify: mocks.notify }) }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: mocks.push }) }))

const Header = { template: '<header><slot name="actions"/></header>' }
const Button = { props: ['disabled', 'type'], template: '<button :disabled="disabled" :type="type || \'button\'"><slot/></button>' }
const Input = { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' }
const Select = { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{label}}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{option.label}}</option></select></label>' }
function mountPage() { return mount(PerformanceView, { global: { stubs: { PageHeader: Header, BaseButton: Button, BaseInput: Input, BaseSelect: Select, BaseModal: true, BaseCard: { props: ['title', 'description'], template: '<section><h2>{{title}}</h2><p>{{description}}</p><slot name="actions"/><slot/></section>' }, EmptyState: true, InlineAlert: true, AppIcon: true, StatusBadge: true, TrendChart: true } } }) }

function period() {
  return {
    period: { start: '2026-08-17T00:00:00.000Z', endExclusive: '2026-09-14T00:00:00.000Z', days: 28, status: 'complete' },
    publications: { total: 0, byPlatform: { instagram: 0, linkedin: 0 }, campaigns: 0, targeting: { industryTargeted: 0, prospectLinked: 0, industryOnly: 0, general: 0, byIndustry: {} }, records: [], source: 'publication_records', sourceRecordIds: [] }, schedules: { planned: 0, cancelled: 0 },
    cadence: { instagram: { platform: 'instagram', weeklyCounts: [0, 0, 0, 0], total: 0, targetPerWeek: 2, weeksMeetingTarget: 0, cadenceComplianceRate: 0, meanWeeklyPosts: 0, coefficientOfVariation: null, status: 'complete', source: 'publication_records' }, linkedin: { platform: 'linkedin', weeklyCounts: [0, 0, 0, 0], total: 0, targetPerWeek: 2, weeksMeetingTarget: 0, cadenceComplianceRate: 0, meanWeeklyPosts: 0, coefficientOfVariation: null, status: 'complete', source: 'publication_records' } },
    social: { instagram: { weeklyAccountObservations: [], postObservations: [] }, linkedin: { weeklyAccountObservations: [], postObservations: [] } },
    inquiries: { relevant: 0, unreviewed: 0, totalRecorded: 0, byChannel: {}, weekly: [], source: 'business_inquiries', sourceRecordIds: [], records: [] },
    outbound: { emailsSent: 0, followUpsCompleted: 0, repliesReceived: 0, interestedResponses: 0, meetings: 0, demonstrations: 0, approachedCompanies: 0, provenance: { historical: 0, artifactAssisted: 0, nonArtifactAssisted: 0 }, source: 'outbound_activities', sourceRecordIds: [], sourceObservations: [] },
    productionTime: { count: 0, median: null, minimum: null, maximum: null, observations: [], status: 'missing', sourceRecordIds: [], sourceObservations: [] },
  }
}

describe('PerformanceView evaluation dashboard', () => {
  beforeEach(() => {
    mocks.evaluation = { evaluation: null, periods: null, progress: { elapsedDays: 0, elapsedPercent: 0, complete: false }, completeness: { status: 'not_configured', sources: [] }, baseline: null, intervention: null, comparison: [], inquiries: [], historicalOutbound: { emailsSent: 0, followUpsCompleted: 0, repliesReceived: 0, interestedResponses: 0, meetings: 0, demonstrations: 0, approachedCompanies: 0, provenance: { historical: 0, artifactAssisted: 0, nonArtifactAssisted: 0 }, sourceRecordIds: [] } }
    mocks.load.mockResolvedValue(undefined); mocks.loadEvaluation.mockResolvedValue(mocks.evaluation); mocks.contentLoad.mockResolvedValue(undefined)
    mocks.prospects.mockResolvedValue({ data: [{ id: 'prospect-1', name: 'PT Example', industry: 'Manufacturing' }] })
    mocks.configureEvaluation.mockResolvedValue(mocks.evaluation); mocks.recordSnapshot.mockResolvedValue(mocks.evaluation); mocks.addBusinessInquiry.mockResolvedValue(mocks.evaluation); mocks.addProductionTime.mockResolvedValue(mocks.evaluation)
  })
  afterEach(() => vi.clearAllMocks())

  it('shows an unconfigured empty state and saves a four-week evaluation revision', async () => {
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.text()).toContain('Four-Week Research Evaluation')
    expect(wrapper.text()).toContain('Set a start date to configure the 28-day baseline and intervention.')
    await wrapper.findAll('button').find((button) => button.text().includes('Configure Evaluation'))?.trigger('click')
    expect(mocks.configureEvaluation).toHaveBeenCalledWith({ startDate: expect.any(String), definitions: { customNotes: '' } })
  })

  it('shows separate platform empty states and offers optional prospect inquiry association', async () => {
    const emptyPeriod = period()
    mocks.evaluation = { evaluation: { id: 'eval-1', revision: 1, startDate: '2026-09-14', timezone: 'Asia/Jakarta', definitions: {}, createdAt: '', snapshots: [] }, periods: { baseline: { start: '2026-08-16T17:00:00.000Z', endExclusive: '2026-09-13T17:00:00.000Z' }, intervention: { start: '2026-09-13T17:00:00.000Z', endExclusive: '2026-10-11T17:00:00.000Z' } }, progress: { elapsedDays: 2, elapsedPercent: 7, complete: false }, completeness: { status: 'partial', sources: [] }, baseline: emptyPeriod, intervention: { ...emptyPeriod, period: { ...emptyPeriod.period, status: 'partial', days: 2 } }, comparison: [], inquiries: [], historicalOutbound: { emailsSent: 0, followUpsCompleted: 0, repliesReceived: 0, interestedResponses: 0, meetings: 0, demonstrations: 0, approachedCompanies: 0, provenance: { historical: 0, artifactAssisted: 0, nonArtifactAssisted: 0 }, sourceRecordIds: [] } }
    const wrapper = mountPage(); await flushPromises()
    expect(wrapper.text()).toContain('Instagram Performance*')
    expect(wrapper.text()).toContain('LinkedIn Performance*')
    expect(wrapper.text()).toContain('No post-level Instagram API observations.')
    expect(wrapper.find('[aria-label="Existing prospect (optional)"]').text()).toContain('PT Example · Manufacturing')
    expect(wrapper.text()).toContain('No inquiry events recorded.')
  })
})
