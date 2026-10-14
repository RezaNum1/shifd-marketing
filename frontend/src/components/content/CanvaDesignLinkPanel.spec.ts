import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CanvaDesignLinkPanel from './CanvaDesignLinkPanel.vue'

const api = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }))
vi.mock('../../api/content', () => ({ saveCanvaDesignLink: api.save, removeCanvaDesignLink: api.remove }))

const user = { id: 'user-1', name: 'Content Author' }
const savedLink = { contentId: 'content-1', companyId: 'company-1', url: 'https://www.canva.com/design/DAGfirst/view', createdAt: '2026-10-14T10:00:00.000Z', updatedAt: '2026-10-14T10:00:00.000Z', createdBy: user, updatedBy: user }
const Card = { props: ['title'], template: '<section><h2>{{title}}</h2><slot/></section>' }
const Modal = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{title}}</h2><slot/><slot name="footer"/></section>' }
const Button = { props: ['type', 'disabled', 'loading'], template: '<button :type="type || \'button\'" :disabled="disabled || loading"><slot/></button>' }
const Input = { props: ['label', 'modelValue', 'type'], emits: ['update:modelValue'], template: '<label>{{label}}<input :aria-label="label" :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>' }
const Alert = { props: ['title'], template: '<p role="alert">{{title}}<slot/></p>' }

function mountPanel(props: { contentId?: string; link?: typeof savedLink | null; editable?: boolean } = {}) {
  return mount(CanvaDesignLinkPanel, {
    props: { contentId: 'content-1', link: null, editable: true, ...props },
    global: { stubs: { BaseCard: Card, BaseModal: Modal, BaseButton: Button, BaseInput: Input, InlineAlert: Alert } },
  })
}

describe('Canva design link panel', () => {
  beforeEach(() => {
    api.save.mockResolvedValue({ data: savedLink })
    api.remove.mockResolvedValue({ data: { ...savedLink, url: null, updatedAt: '2026-10-14T10:05:00.000Z' } })
  })
  afterEach(() => vi.clearAllMocks())

  it('saves and displays a Canva URL that opens safely in a new tab', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[aria-label="Canva Design Link (optional)"]').setValue(savedLink.url)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('content-1', savedLink.url)
    expect(wrapper.get('a').attributes()).toMatchObject({ href: savedLink.url, target: '_blank', rel: 'noopener noreferrer' })
    expect(wrapper.text()).toContain('Updated')
    expect(wrapper.emitted('updated')?.[0]).toEqual([savedLink])
  })

  it('edits the saved URL and removes it only after confirmation', async () => {
    const wrapper = mountPanel({ link: savedLink })
    await wrapper.findAll('button').find((button) => button.text() === 'Edit')!.trigger('click')
    const nextUrl = 'https://www.canva.com/design/DAGsecond/edit'
    api.save.mockResolvedValueOnce({ data: { ...savedLink, url: nextUrl, updatedAt: '2026-10-14T10:03:00.000Z' } })
    await wrapper.get('[aria-label="Canva Design Link (optional)"]').setValue(nextUrl)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith('content-1', nextUrl)
    expect(wrapper.get('a').attributes('href')).toBe(nextUrl)

    await wrapper.findAll('button').find((button) => button.text() === 'Remove')!.trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Remove the Canva design link')
    await wrapper.findAll('button').find((button) => button.text() === 'Remove link')!.trigger('click')
    await flushPromises()
    expect(api.remove).toHaveBeenCalledWith('content-1')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('keeps the saved link view-only in the Content Detail workspace', () => {
    const wrapper = mountPanel({ link: savedLink, editable: false })
    expect(wrapper.get('a').attributes('href')).toBe(savedLink.url)
    expect(wrapper.findAll('button').some((button) => ['Edit', 'Remove'].includes(button.text()))).toBe(false)
  })
})
