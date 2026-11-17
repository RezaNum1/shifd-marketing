import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import InfoTooltip from './InfoTooltip.vue'

describe('InfoTooltip placement', () => {
  it('keeps a tooltip inside the modal scroll area when its icon is near the right edge', async () => {
    const scrollArea = document.createElement('div')
    scrollArea.className = 'ui-overlay__body'
    document.body.append(scrollArea)
    const wrapper = mount(InfoTooltip, { attachTo: scrollArea, props: { text: 'Penjelasan metrik' } })
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 500 } as DOMRect)
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({ left: 420, right: 442, width: 22 } as DOMRect)

    await wrapper.trigger('mouseenter')
    const bubble = wrapper.get('[role="tooltip"]').element as HTMLElement
    expect(bubble.style.width).toBe('280px')
    expect(bubble.style.left).toBe('-208px')
    expect(bubble.style.getPropertyValue('--tooltip-arrow-left')).toBe('214px')

    wrapper.unmount()
    scrollArea.remove()
  })
})
