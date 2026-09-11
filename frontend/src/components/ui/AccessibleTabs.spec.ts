import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AccessibleTabs from './AccessibleTabs.vue'

describe('AccessibleTabs', () => {
  it('moves selection with arrow and roving tabindex semantics', async () => {
    const wrapper = mount(AccessibleTabs, {
      props: {
        items: [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }],
        modelValue: 'overview',
        label: 'Content sections',
        idPrefix: 'content-tab',
        panelPrefix: 'content-panel',
      },
    })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['history'])
    expect(tabs[0].attributes('aria-controls')).toBe('content-panel-overview')
  })
})
