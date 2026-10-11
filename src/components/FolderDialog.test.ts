// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import FolderDialog from './FolderDialog.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('FolderDialog accessibility', () => {
  it('moves focus into the dialog, traps Tab, and restores focus on close', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open folder'
    document.body.append(opener)
    opener.focus()
    wrapper = mount(FolderDialog, {
      attachTo: document.body,
      props: {
        folder: { id: 'work', title: 'Work', shortcutIds: [], color: '#369', mark: 'W' },
        shortcuts: [],
      },
    })
    await wrapper.vm.$nextTick()

    const closeButton = wrapper.get('[aria-label="关闭文件夹"]').element
    expect(document.activeElement).toBe(closeButton)
    const lastButton = wrapper.get('.folder-dialog footer .button-primary').element as HTMLButtonElement
    lastButton.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    lastButton.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(closeButton)

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.get('.folder-dialog').element.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    wrapper = undefined
    expect(document.activeElement).toBe(opener)
  })

  it('focuses the folder name field when editing', async () => {
    wrapper = mount(FolderDialog, {
      attachTo: document.body,
      props: {
        shortcuts: [],
      },
    })
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(wrapper.get('input[placeholder="例如：工作"]').element)
  })
})
