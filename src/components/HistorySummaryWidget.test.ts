// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HistorySummaryWidget from './HistorySummaryWidget.vue'

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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HistorySummaryWidget', () => {
  it('keeps the extension-only boundary on regular websites', () => {
    vi.stubGlobal('chrome', undefined)
    wrapper = mount(HistorySummaryWidget)
    expect(wrapper.text()).toContain('此功能需要浏览器扩展')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('does not query history or request permission until the extension permission is granted', async () => {
    const request = vi.fn()
    const search = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(false), request },
      history: { search },
    })
    wrapper = mount(HistorySummaryWidget)
    await flushPromises()

    expect(wrapper.text()).toContain('打开浏览历史面板并启用权限')
    expect(search).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('shows recent safe visits, refreshes on history changes, and clears on permission revocation', async () => {
    const permissionRemoved = event()
    const historyVisited = event()
    const contains = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const recent = {
      id: '1', url: 'https://example.com/', title: 'Example', lastVisitTime: Date.now(), visitCount: 3,
    }
    const search = vi.fn().mockResolvedValue([
      recent,
      { id: 'unsafe', url: 'javascript:alert(1)', title: 'Unsafe', lastVisitTime: Date.now(), visitCount: 1 },
    ])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains, request: vi.fn(), onRemoved: permissionRemoved },
      history: { search, onVisited: historyVisited },
    })
    wrapper = mount(HistorySummaryWidget)
    await flushPromises()

    expect(wrapper.findAll('a').map((link) => link.text())).toHaveLength(1)
    expect(wrapper.text()).toContain('Example')
    expect(wrapper.html()).not.toContain('javascript:')
    expect(search).toHaveBeenCalledWith({ text: '', startTime: 0, maxResults: 5 })

    vi.useFakeTimers()
    historyVisited.fire()
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(search).toHaveBeenCalledTimes(2)

    permissionRemoved.fire({ permissions: ['history'] })
    await flushPromises()
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).toContain('打开浏览历史面板并启用权限')
    expect(historyVisited.listeners.size).toBe(0)
  })

  it('does not reveal a pending history response after permission is revoked', async () => {
    const permissionRemoved = event()
    const pendingSearch = deferred<{ id: string; url: string; title: string; lastVisitTime: number; visitCount: number }[]>()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false), request: vi.fn(), onRemoved: permissionRemoved },
      history: { search: vi.fn().mockReturnValue(pendingSearch.promise), onVisited: event() },
    })
    wrapper = mount(HistorySummaryWidget)
    await flushPromises()

    permissionRemoved.fire({ permissions: ['history'] })
    await flushPromises()
    pendingSearch.resolve([{ id: 'secret', url: 'https://private.example/', title: 'Private page', lastVisitTime: Date.now(), visitCount: 1 }])
    await flushPromises()

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Private page')
  })
})
