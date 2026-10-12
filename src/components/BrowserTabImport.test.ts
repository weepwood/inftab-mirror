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
    await wrapper.get('.browser-tab-import > button').trigger('click')

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

  it('loads most-visited websites only after requesting the optional topSites permission', async () => {
    const request = vi.fn().mockResolvedValue(true)
    const get = vi.fn().mockResolvedValue([
      { title: 'Frequently visited docs', url: 'https://docs.example/guide' },
      { title: 'Unsafe result', url: 'javascript:alert(1)' },
    ])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { request },
      topSites: { get },
    })
    wrapper = mount(BrowserTabImport)

    await wrapper.get('button:nth-child(2)').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({ permissions: ['topSites'] })
    expect(get).toHaveBeenCalledOnce()
    expect(wrapper.get('select').text()).toContain('Frequently visited docs — docs.example')
    await wrapper.get('.browser-tab-import > button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[
      { id: 'top-site-0', title: 'Frequently visited docs', url: 'https://docs.example/guide', hostname: 'docs.example' },
    ]])
  })

  it('keeps manual shortcut entry available when topSites permission is denied', async () => {
    const request = vi.fn().mockResolvedValue(false)
    const get = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { request },
      topSites: { get },
    })
    wrapper = mount(BrowserTabImport)

    await wrapper.get('button:nth-child(2)').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({ permissions: ['topSites'] })
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.get('[role="status"]').text()).toContain('仍可手动填写网址')
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
