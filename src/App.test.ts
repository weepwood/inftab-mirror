// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('creates a folder, opens it, and launches a contained shortcut', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('.shortcut-open[aria-label="打开settings"]').trigger('click')
    const columns = wrapper.findAll('.settings-content .range-label').find((label) => label.text().includes('每行图标'))
    await columns!.get('input').setValue('12')
    await wrapper.get('.folder-add-button').trigger('click')
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')

    const folders = JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')
    expect(folders).toHaveLength(1)
    expect(folders[0].shortcutIds).toContain('jd')
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).toContain(folders[0].id)
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).not.toContain('jd')

    await wrapper.get('.panel-close').trigger('click')
    await wrapper.get('.shortcut-open[aria-label="打开工作"]').trigger('click')
    expect(wrapper.get('.folder-dialog').text()).toContain('京东商城')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await wrapper.get('.folder-link').trigger('click')
    expect(open).toHaveBeenCalledWith('https://www.jd.com/', '_blank', 'noopener,noreferrer')
    const folderId = folders[0].id
    await wrapper.get('.folder-dialog .danger-action').trigger('click')
    expect(JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').some((item: { id: string }) => item.id === 'jd')).toBe(true)
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).not.toContain(folderId)
  })

  it('discards folder edits when cancelling', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('.shortcut-open[aria-label="打开settings"]').trigger('click')
    await wrapper.get('.folder-add-button').trigger('click')
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')
    await wrapper.get('.panel-close').trigger('click')
    await wrapper.get('.shortcut-open[aria-label="打开工作"]').trigger('click')
    await wrapper.get('.folder-dialog button.button-secondary:not(.danger-action)').trigger('click')

    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('未保存的名称')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(false)
    await wrapper.get('.folder-dialog footer .button-secondary:not(.danger-action)').trigger('click')

    expect(wrapper.get('#folder-view-title').text()).toBe('工作')
    expect(wrapper.get('.folder-link').text()).toContain('京东商城')
    expect(JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')[0].title).toBe('工作')
  })

  it('prevents adding a shortcut to multiple folders', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('.shortcut-open[aria-label="打开settings"]').trigger('click')
    await wrapper.get('.folder-add-button').trigger('click')
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')
    await wrapper.get('.folder-add-button').trigger('click')
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('生活')

    const assignedShortcut = wrapper.findAll('.folder-choice').find((choice) => choice.text().includes('京东商城'))
    expect(assignedShortcut?.get('input[type="checkbox"]').element).toHaveProperty('disabled', true)
    expect(assignedShortcut?.text()).toContain('已在其他文件夹')
  })
})
