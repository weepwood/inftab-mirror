// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BookmarksSummaryWidget from './BookmarksSummaryWidget.vue'

function event() {
  const listeners = new Set<(...args: unknown[]) => void>()
  return {
    addListener(listener: (...args: unknown[]) => void) { listeners.add(listener) },
    removeListener(listener: (...args: unknown[]) => void) { listeners.delete(listener) },
    fire(...args: unknown[]) { listeners.forEach((listener) => listener(...args)) },
    listeners,
  }
}

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('BookmarksSummaryWidget', () => {
  it('keeps the extension-only boundary on regular websites', () => {
    vi.stubGlobal('chrome', undefined)
    wrapper = mount(BookmarksSummaryWidget)
    expect(wrapper.text()).toContain('此功能需要浏览器扩展')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('does not request permission and explains how to enable the widget', async () => {
    const request = vi.fn()
    const getTree = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(false), request },
      bookmarks: { getTree },
    })
    wrapper = mount(BookmarksSummaryWidget)
    await flushPromises()

    expect(wrapper.text()).toContain('打开书签面板并启用权限')
    expect(request).not.toHaveBeenCalled()
    expect(getTree).not.toHaveBeenCalled()
  })

  it('shows safe bookmarks, refreshes on changes, and clears them when permission is revoked', async () => {
    const permissionRemoved = event()
    const bookmarkCreated = event()
    const contains = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const getTree = vi.fn().mockResolvedValue([{
      id: 'root', title: '', children: [{ id: 'bar', title: 'Bookmarks Bar', children: [
        { id: 'vue', title: 'Vue Docs', url: 'https://vuejs.org/' },
        { id: 'unsafe', title: 'Unsafe', url: 'javascript:alert(1)' },
        { id: 'github', title: 'GitHub', url: 'https://github.com/' },
      ] }],
    }])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains, request: vi.fn(), onRemoved: permissionRemoved },
      bookmarks: { getTree, onCreated: bookmarkCreated },
    })
    wrapper = mount(BookmarksSummaryWidget)
    await flushPromises()

    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['Vue Docs', 'GitHub'])
    expect(wrapper.html()).not.toContain('javascript:')
    vi.useFakeTimers()
    bookmarkCreated.fire()
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(getTree).toHaveBeenCalledTimes(2)

    permissionRemoved.fire({ permissions: ['bookmarks'] })
    await flushPromises()
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).toContain('打开书签面板并启用权限')
    expect(bookmarkCreated.listeners.size).toBe(0)
  })
})
