// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HistoryPanel from './HistoryPanel.vue'

const historyApi = vi.hoisted(() => ({
  canAccessBrowserHistory: vi.fn(() => true),
  hasBrowserHistoryPermission: vi.fn<() => Promise<boolean>>(),
  requestBrowserHistoryPermission: vi.fn<() => Promise<boolean>>(),
  searchBrowserHistory: vi.fn(),
  subscribeToBrowserHistory: vi.fn<(listener: () => void) => () => void>(() => vi.fn()),
  subscribeToBrowserHistoryPermissionChanges: vi.fn<(listener: () => void) => () => void>(() => vi.fn()),
}))

vi.mock('../data/browserHistory', () => historyApi)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  historyApi.canAccessBrowserHistory.mockReturnValue(true)
  historyApi.hasBrowserHistoryPermission.mockReset()
  historyApi.requestBrowserHistoryPermission.mockReset()
  historyApi.searchBrowserHistory.mockReset()
  historyApi.subscribeToBrowserHistory.mockReset().mockReturnValue(vi.fn())
  historyApi.subscribeToBrowserHistoryPermissionChanges.mockReset().mockReturnValue(vi.fn())
})

describe('browser history panel', () => {
  it('coalesces browser history change bursts and cancels queued refresh on unmount', async () => {
    vi.useFakeTimers()
    let onHistoryChange: (() => void) | undefined
    const stopListening = vi.fn()
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(true)
    historyApi.subscribeToBrowserHistory.mockImplementation((listener) => {
      onHistoryChange = listener
      return stopListening
    })
    historyApi.searchBrowserHistory.mockResolvedValue([])
    const mounted = mount(HistoryPanel)
    await flushPromises()
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledOnce()

    onHistoryChange?.()
    onHistoryChange?.()
    onHistoryChange?.()
    await vi.advanceTimersByTimeAsync(99)
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledTimes(2)

    onHistoryChange?.()
    mounted.unmount()
    await vi.advanceTimersByTimeAsync(100)
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledTimes(2)
    expect(stopListening).toHaveBeenCalledOnce()
  })

  it('requests permission only after user action and then searches local browser history', async () => {
    vi.useFakeTimers()
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(false)
    historyApi.requestBrowserHistoryPermission.mockResolvedValue(true)
    historyApi.searchBrowserHistory.mockResolvedValue([
      { id: 'example', title: 'Example docs', url: 'https://example.com/docs', lastVisitTime: 1_700_000_000_000, visitCount: 2 },
    ])
    const wrapper = mount(HistoryPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('只搜索和打开记录，不会删除或上传')
    expect(historyApi.searchBrowserHistory).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(historyApi.requestBrowserHistoryPermission).toHaveBeenCalledOnce()
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledWith('')
    expect(wrapper.text()).toContain('Example docs')
    expect(wrapper.get('a').attributes('href')).toBe('https://example.com/docs')
    expect(wrapper.get('a').attributes('rel')).toBe('noopener noreferrer')

    await wrapper.get('input[aria-label="搜索浏览历史"]').setValue('  docs  ')
    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()
    expect(historyApi.searchBrowserHistory).toHaveBeenLastCalledWith('  docs  ')
    wrapper.unmount()
  })

  it('explains that browser history is unavailable on the website version', async () => {
    historyApi.canAccessBrowserHistory.mockReturnValue(false)
    const wrapper = mount(HistoryPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('此功能需要浏览器扩展')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(historyApi.hasBrowserHistoryPermission).not.toHaveBeenCalled()
  })

  it('does not read history when the user declines the permission prompt', async () => {
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(false)
    historyApi.requestBrowserHistoryPermission.mockResolvedValue(false)
    const wrapper = mount(HistoryPanel)
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('未授予浏览历史权限')
    expect(historyApi.searchBrowserHistory).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('clears protected history and listeners when a permission recheck fails', async () => {
    let onPermissionChange: (() => void) | undefined
    const stopHistoryListener = vi.fn()
    historyApi.hasBrowserHistoryPermission
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('permission API failed'))
    historyApi.subscribeToBrowserHistory.mockReturnValue(stopHistoryListener)
    historyApi.subscribeToBrowserHistoryPermissionChanges.mockImplementation((listener: () => void) => {
      onPermissionChange = listener
      return vi.fn()
    })
    historyApi.searchBrowserHistory.mockResolvedValue([
      { id: 'private', title: 'Private page', url: 'https://private.example/', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
    ])
    const mounted = mount(HistoryPanel)
    await flushPromises()
    expect(mounted.text()).toContain('Private page')

    onPermissionChange?.()
    await flushPromises()

    expect(mounted.text()).toContain('连接当前浏览器的历史记录')
    expect(mounted.text()).toContain('无法检查浏览历史权限')
    expect(mounted.find('a').exists()).toBe(false)
    expect(stopHistoryListener).toHaveBeenCalledOnce()
    expect(historyApi.searchBrowserHistory).toHaveBeenCalledOnce()
    mounted.unmount()
  })

  it('retries a failed history read without reopening the panel', async () => {
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(true)
    historyApi.searchBrowserHistory
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([
        { id: 'retried', title: 'Recovered page', url: 'https://example.com/recovered', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
      ])
    const wrapper = mount(HistoryPanel)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('请检查权限后重试')

    await wrapper.get('.history-retry').trigger('click')
    await flushPromises()

    expect(historyApi.searchBrowserHistory).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Recovered page')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores an older history result as soon as the query changes', async () => {
    vi.useFakeTimers()
    const previousSearch = deferred<Awaited<ReturnType<typeof historyApi.searchBrowserHistory>>>()
    const nextSearch = deferred<Awaited<ReturnType<typeof historyApi.searchBrowserHistory>>>()
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(true)
    historyApi.searchBrowserHistory.mockReturnValueOnce(previousSearch.promise).mockReturnValueOnce(nextSearch.promise)
    const mounted = mount(HistoryPanel)
    await flushPromises()

    await mounted.get('input[aria-label="搜索浏览历史"]').setValue('new query')
    previousSearch.resolve([
      { id: 'old', title: 'Old query result', url: 'https://old.example/', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
    ])
    await flushPromises()
    expect(mounted.text()).not.toContain('Old query result')
    expect(mounted.find('[role="status"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()
    expect(historyApi.searchBrowserHistory).toHaveBeenLastCalledWith('new query')
    nextSearch.resolve([
      { id: 'new', title: 'New query result', url: 'https://new.example/', lastVisitTime: 1_700_000_000_001, visitCount: 1 },
    ])
    await flushPromises()

    expect(mounted.text()).toContain('New query result')
    expect(mounted.text()).not.toContain('Old query result')
    expect(mounted.find('[role="status"]').exists()).toBe(false)
  })

  it('hides history immediately when permission changes and ignores an in-flight result', async () => {
    const permissionRecheck = deferred<boolean>()
    const pendingSearch = deferred<Awaited<ReturnType<typeof historyApi.searchBrowserHistory>>>()
    let onPermissionChange: (() => void) | undefined
    historyApi.hasBrowserHistoryPermission
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(permissionRecheck.promise)
    historyApi.searchBrowserHistory.mockReturnValueOnce(pendingSearch.promise)
    historyApi.subscribeToBrowserHistoryPermissionChanges.mockImplementation((listener: () => void) => {
      onPermissionChange = listener
      return vi.fn()
    })
    const mounted = mount(HistoryPanel)
    await flushPromises()

    onPermissionChange?.()
    await flushPromises()
    expect(mounted.text()).toContain('连接当前浏览器的历史记录')
    expect(mounted.find('a').exists()).toBe(false)

    permissionRecheck.resolve(false)
    await flushPromises()
    pendingSearch.resolve([
      { id: 'private', title: 'Private late result', url: 'https://private.example/', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
    ])
    await flushPromises()

    expect(mounted.find('a').exists()).toBe(false)
    expect(mounted.text()).not.toContain('Private late result')
    mounted.unmount()
  })

  it('clears the previous query results while the next search is debounced', async () => {
    vi.useFakeTimers()
    const nextSearch = deferred<Awaited<ReturnType<typeof historyApi.searchBrowserHistory>>>()
    historyApi.hasBrowserHistoryPermission.mockResolvedValue(true)
    historyApi.searchBrowserHistory
      .mockResolvedValueOnce([
        { id: 'previous', title: 'Previous result', url: 'https://previous.example/', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
      ])
      .mockReturnValueOnce(nextSearch.promise)
    const mounted = mount(HistoryPanel)
    await flushPromises()
    expect(mounted.text()).toContain('Previous result')

    await mounted.get('input[aria-label="搜索浏览历史"]').setValue('new query')
    expect(mounted.text()).not.toContain('Previous result')
    expect(mounted.find('[aria-busy="true"]').exists()).toBe(true)
    expect(mounted.get('[role="status"]').text()).toContain('正在读取浏览历史')

    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()
    nextSearch.resolve([
      { id: 'current', title: 'Current result', url: 'https://current.example/', lastVisitTime: 1_700_000_000_001, visitCount: 1 },
    ])
    await flushPromises()

    expect(mounted.text()).toContain('Current result')
    expect(mounted.text()).not.toContain('Previous result')
  })
})
