// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HistoryPanel from './HistoryPanel.vue'

const historyApi = vi.hoisted(() => ({
  canAccessBrowserHistory: vi.fn(() => true),
  hasBrowserHistoryPermission: vi.fn<() => Promise<boolean>>(),
  requestBrowserHistoryPermission: vi.fn<() => Promise<boolean>>(),
  searchBrowserHistory: vi.fn(),
  subscribeToBrowserHistory: vi.fn(() => vi.fn()),
  subscribeToBrowserHistoryPermissionChanges: vi.fn(() => vi.fn()),
}))

vi.mock('../data/browserHistory', () => historyApi)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  historyApi.canAccessBrowserHistory.mockReturnValue(true)
  historyApi.hasBrowserHistoryPermission.mockReset()
  historyApi.requestBrowserHistoryPermission.mockReset()
  historyApi.searchBrowserHistory.mockReset()
  historyApi.subscribeToBrowserHistory.mockClear()
  historyApi.subscribeToBrowserHistoryPermissionChanges.mockClear()
})

describe('browser history panel', () => {
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
})
