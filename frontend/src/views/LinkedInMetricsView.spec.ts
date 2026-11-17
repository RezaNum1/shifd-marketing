import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LinkedInMetricsView from './LinkedInMetricsView.vue'

const mocks = vi.hoisted(() => ({
  loadSupportingData: vi.fn(),
  saveLinkedInPublicationMetrics: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn(),
}))

vi.mock('../stores/performance', () => ({ usePerformanceStore: () => ({
  weeklyMetrics: [],
  publications: [{
    publication: { id: 'post-1', platform: 'linkedin', publishedAt: '2026-11-17T00:00:00.000Z' },
    content: { id: 'content-1', title: 'LinkedIn post' },
    postMetrics: {
      source: 'linkedin_manual', impressions: 100, impressionsInNetwork: 62.5, impressionsOutOfNetwork: 37.5,
      memberReached: 80, views: 65, followersGained: 2, profileViewers: 5, reactions: 9, comments: 1,
    },
  }],
  supportingLoaded: true,
  supportingLoading: false,
  error: '',
  loadSupportingData: mocks.loadSupportingData,
  saveLinkedInPublicationMetrics: mocks.saveLinkedInPublicationMetrics,
}) }))
vi.mock('vue-router', async (load) => ({ ...(await load<typeof import('vue-router')>()), useRouter: () => ({ push: mocks.push }) }))

const stubs = {
  PageHeader: { template: '<header><slot name="actions" /></header>' },
  BaseCard: { template: '<section><slot name="actions" /><slot /></section>' },
  BaseTable: { props: ['rows'], template: '<div><div v-for="row in rows" :key="row.id"><slot name="cell-actions" :row="row" /></div></div>' },
  BaseModal: { props: ['modelValue', 'title'], template: '<div v-if="modelValue"><h2>{{ title }}</h2><slot /></div>' },
  EmptyState: { props: ['title', 'description'], template: '<div>{{ title }}<p>{{ description }}</p></div>' },
  InlineAlert: true,
  StatusBadge: true,
  AppIcon: true,
}

describe('LinkedIn post metrics editor', () => {
  it('shows a weekly post summary from the selected date range without weekly entry', async () => {
    const wrapper = mount(LinkedInMetricsView, { global: { stubs } })
    const startField = wrapper.findAll('.ui-field').find((item) => item.find('label').text() === 'Start Date')!
    const endField = wrapper.findAll('.ui-field').find((item) => item.find('label').text() === 'End Date')!
    expect((startField.find('input').element as HTMLInputElement).value).toBe('2026-10-26')
    expect((endField.find('input').element as HTMLInputElement).value).toBe('2026-11-22')
    expect(wrapper.text()).not.toContain('Add Weekly Metrics')
    await startField.find('input').setValue('2026-11-18')
    expect(wrapper.text()).toContain('No LinkedIn posts in this date range.')
  })

  it('loads and saves the nine LinkedIn Analytics values', async () => {
    const wrapper = mount(LinkedInMetricsView, { global: { stubs } })
    await wrapper.findAll('button').find((button) => button.text() === 'Edit Metrics')!.trigger('click')
    expect(wrapper.text()).toContain('Edit LinkedIn Post Metrics')
    const labels = ['Impression', 'Impression In Network (%)', 'Impression Out of Network (%)', 'Member Reached', 'Views', 'Followers gained', 'Profile viewers', 'Reactions', 'Comments']
    const inputFor = (label: string) => {
      const field = wrapper.findAll('.ui-field').find((item) => item.find('label').text() === label)
      expect(field, `${label} field`).toBeDefined()
      return field!.find('input')
    }
    for (const label of labels) expect(inputFor(label).exists()).toBe(true)
    expect((inputFor('Impression').element as HTMLInputElement).value).toBe('100')
    expect((inputFor('Impression In Network (%)').element as HTMLInputElement).value).toBe('62.5')
    expect(inputFor('Impression In Network (%)').attributes('max')).toBe('100')
    expect(inputFor('Impression In Network (%)').attributes('step')).toBe('0.01')
    expect(wrapper.findAll('[role="tooltip"]')).toHaveLength(9)
    expect(wrapper.text()).toContain('Persentase impresi yang berasal dari pengikut atau koneksi Anda.')
    await inputFor('Reactions').setValue('12')
    await wrapper.findAll('form').find((form) => form.text().includes('Save Post Metrics'))!.trigger('submit')
    await flushPromises()
    expect(mocks.saveLinkedInPublicationMetrics).toHaveBeenCalledWith('post-1', {
      impressions: 100, impressionsInNetwork: 62.5, impressionsOutOfNetwork: 37.5, memberReached: 80,
      views: 65, followersGained: 2, profileViewers: 5, reactions: 12, comments: 1,
    })
  })
})
