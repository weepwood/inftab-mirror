// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('new-tab keyboard search', () => {
  it('focuses search with slash or Ctrl/Command+K', () => {
    wrapper = mount(App, { attachTo: document.body })
    const input = wrapper.get('input[type="search"]').element

    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    window.dispatchEvent(slash)
    expect(slash.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)

    document.body.focus()
    const commandK = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(commandK)
    expect(commandK.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it('does not intercept typing shortcuts while a text field is active', () => {
    wrapper = mount(App, { attachTo: document.body })
    const input = wrapper.get('input[type="search"]').element as HTMLInputElement
    input.focus()

    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    input.dispatchEvent(slash)
    expect(slash.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  it('rejects unsafe shortcut URLs and restores a valid shortcut after remount', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('.shortcut-open[aria-label="打开settings"]').trigger('click')
    await wrapper.get('.settings-add-shortcut').trigger('click')
    await wrapper.get('input[placeholder="例如：GitHub"]').setValue('Example')
    await wrapper.get('input[placeholder="https://example.com"]').setValue('javascript:alert(1)')
    await wrapper.get('.shortcut-dialog').trigger('submit')

    expect(wrapper.get('.shortcut-dialog [role="alert"]').text()).toContain('HTTP 或 HTTPS')
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').some((item: { title: string }) => item.title === 'Example')).toBe(false)

    await wrapper.get('input[placeholder="https://example.com"]').setValue('example.com')
    await wrapper.get('.shortcut-dialog').trigger('submit')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')).toContainEqual(expect.objectContaining({
      title: 'Example',
      url: 'https://example.com/',
    }))

    wrapper.unmount()
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).toContain(
      JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').find((item: { title: string }) => item.title === 'Example')?.id,
    )
  })
})
