// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('describes the pending action and focuses the safe choice on open', async () => {
    wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { title: '删除笔记？', description: '笔记将从本机移除。' },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[role="alertdialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.get('#confirm-dialog-description').text()).toBe('笔记将从本机移除。')
    expect(document.activeElement).toBe(wrapper.get('.button-secondary').element)
  })

  it('keeps keyboard focus inside the dialog when Tab reaches either end', () => {
    wrapper = mount(ConfirmDialog, { attachTo: document.body, props: { title: '确认', description: '说明' } })
    const first = wrapper.get('button[aria-label="取消操作"]').element as HTMLButtonElement
    const confirm = wrapper.get('.confirm-danger').element as HTMLButtonElement

    confirm.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    confirm.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    first.focus()
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    first.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(confirm)
  })

  it('cancels on Escape and backdrop clicks without confirming', async () => {
    wrapper = mount(ConfirmDialog, { attachTo: document.body, props: { title: '确认', description: '说明' } })
    await wrapper.get('section').trigger('keydown', { key: 'Escape' })
    await wrapper.get('.modal-backdrop').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(2)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
