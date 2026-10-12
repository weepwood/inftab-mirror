// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BrowserTabImport from './BrowserTabImport.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('browser tab import control', () => {
  it('requests permission on click and emits the selected safe web tab', async () => {
    const request = vi.fn().mockResolvedValue(true)
    const query = vi.fn().mockResolvedValue([
      { id: 4, title: 'Current page', url: 'https://current.example/path' },
      { id: 5, title: 'Extension page', url: 'chrome-extension://extension-id/index.html' },
    ])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { request },
      tabs: { query },
    })
    wrapper = mount(BrowserTabImport)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({ permissions: ['tabs'] })
    expect(query).toHaveBeenCalledWith({ currentWindow: true })
    await wrapper.get('select').setValue('4')
    await wrapper.get('button:last-of-type').trigger('click')

    expect(wrapper.emitted('select')).toEqual([[
      { id: '4', title: 'Current page', url: 'https://current.example/path', hostname: 'current.example' },
    ]])
  })

  it('keeps manual URL entry available when permission is denied', async () => {
    const request = vi.fn().mockResolvedValue(false)
    const query = vi.fn()
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { request }, tabs: { query } })
    wrapper = mount(BrowserTabImport)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('仍可手动填写网址')
    expect(query).not.toHaveBeenCalled()
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
