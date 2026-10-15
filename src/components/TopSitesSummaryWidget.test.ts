// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TopSitesSummaryWidget from './TopSitesSummaryWidget.vue'

let wrapper: VueWrapper | undefined

function permissionEvent() {
  const listeners = new Set<(details: unknown) => void>()
  return {
    addListener: (listener: (details: unknown) => void) => listeners.add(listener),
    removeListener: (listener: (details: unknown) => void) => listeners.delete(listener),
    fire: (details: unknown) => listeners.forEach((listener) => listener(details)),
  }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('top-sites homepage widget', () => {
  it('waits for an explicit permission click and displays only safe browser sites', async () => {
    let permissionGranted = false
    const get = vi.fn().mockResolvedValue([
      { title: 'Frequently visited docs', url: 'https://docs.example/guide' },
      { title: 'Unsafe result', url: 'javascript:alert(1)' },
      { title: '', url: 'http://fallback.example:80/' },
    ])
    const chromeApi: {
      runtime: { id: string }
      permissions: { request: () => Promise<boolean>; contains: () => Promise<boolean> }
      topSites?: { get: typeof get }
    } = {
      runtime: { id: 'extension-id' },
      permissions: {
        request: async () => false,
        contains: async () => permissionGranted,
      },
    }
    const request = vi.fn(async () => {
      permissionGranted = true
      chromeApi.topSites = { get }
      return true
    })
    chromeApi.permissions.request = request
    vi.stubGlobal('chrome', chromeApi)
    wrapper = mount(TopSitesSummaryWidget)
    await flushPromises()

    expect(request).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.get('button').text()).toBe('启用常用网站')
    expect(wrapper.text()).toContain('不会上传')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({ permissions: ['topSites'] })
    expect(get).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.top-sites-summary-list a')).toHaveLength(2)
    expect(wrapper.get('.top-sites-summary-list').text()).toContain('Frequently visited docs')
    expect(wrapper.get('.top-sites-summary-list').text()).toContain('fallback.example')
    expect(wrapper.html()).not.toContain('javascript:')
  })

  it('clears displayed sites when the optional permission is revoked', async () => {
    let permissionGranted = true
    const onAdded = permissionEvent()
    const onRemoved = permissionEvent()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: {
        contains: vi.fn(async () => permissionGranted),
        request: vi.fn(async () => false),
        onAdded,
        onRemoved,
      },
      topSites: { get: vi.fn().mockResolvedValue([{ title: 'Private favorite', url: 'https://private.example/' }]) },
    })
    wrapper = mount(TopSitesSummaryWidget)
    await flushPromises()
    expect(wrapper.text()).toContain('Private favorite')

    permissionGranted = false
    onRemoved.fire({ permissions: ['topSites'] })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Private favorite')
    expect(wrapper.get('button').text()).toBe('启用常用网站')
  })
})
