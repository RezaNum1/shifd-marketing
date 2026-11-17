import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceView from './PerformanceView.vue'

const mocks = vi.hoisted(() => ({
  load: vi.fn().mockResolvedValue(undefined),
  loadReport: vi.fn().mockResolvedValue(undefined),
  loadSupportingData: vi.fn().mockResolvedValue(undefined),
  integrationsLoad: vi.fn().mockResolvedValue(undefined),
  contentLoad: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
}))

vi.mock('../stores/performance', () => ({ usePerformanceStore: () => ({
  report: null, weeklyMetrics: [], publications: [], loading: false, loaded: false, error: '',
  evaluation: null, load: mocks.load, loadReport: mocks.loadReport, loadSupportingData: mocks.loadSupportingData,
}) }))
vi.mock('../stores/integrations', () => ({ useIntegrationsStore: () => ({ instagram: { status: 'disconnected' }, load: mocks.integrationsLoad }) }))
vi.mock('../stores/contentLibrary', () => ({ useContentLibraryStore: () => ({ records: [], load: mocks.contentLoad }) }))
vi.mock('../stores/ui', () => ({ useUiStore: () => ({ notify: vi.fn() }) }))
vi.mock('../api/prospects', () => ({ listProspects: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('vue-router', async (load) => ({
  ...(await load<typeof import('vue-router')>()),
  useRoute: () => ({ path: '/performance', name: 'performance' }),
  useRouter: () => ({ push: mocks.push }),
}))

const stubs = {
  PageHeader: { template: '<header><slot name="actions" /></header>' },
  BaseSelect: { props: ['label', 'modelValue', 'options'], emits: ['update:modelValue'], template: '<label>{{ label }}<select :aria-label="label" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>' },
  BaseInput: { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{ label }}<input :aria-label="label" :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' },
  BaseButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
  AppIcon: true,
  InlineAlert: true,
}

describe('Performance custom reporting period', () => {
  it('shows date fields and requests the chosen range', async () => {
    const wrapper = mount(PerformanceView, { global: { stubs } })
    await flushPromises()
    await wrapper.get('select[aria-label="Reporting period"]').setValue('custom')
    expect(wrapper.find('[aria-label="Custom reporting period"]').exists()).toBe(true)
    await wrapper.get('input[aria-label="Start date"]').setValue('2026-11-01')
    await wrapper.get('input[aria-label="End date"]').setValue('2026-11-17')
    await wrapper.findAll('button').find((button) => button.text() === 'Apply date range')!.trigger('click')
    expect(mocks.loadReport).toHaveBeenLastCalledWith(8, 'combined', { startDate: '2026-11-01', endDate: '2026-11-17' })
  })
})
