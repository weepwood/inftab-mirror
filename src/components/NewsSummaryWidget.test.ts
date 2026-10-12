// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewsSummaryWidget from './NewsSummaryWidget.vue'
import { hackerNewsHostPermission } from '../data/hackerNews'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function response(value: unknown, ok = true): Response {
  return { ok, json: async () => value } as Response
}

function mockFeed() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/topstories.json')) return response([101])
    return response({ id: 101, type: 'story', title: 'Browser performance research', url: 'https://example.org/research', score: 28, descendants: 7 })
  })
}

describe('NewsSummaryWidget', () => {
  it('loads the attributed feed on the website and keeps source links safe', async () => {
    const fetcher = mockFeed()
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('fetch', fetcher)
    wrapper = mount(NewsSummaryWidget)
    await vi.waitFor(() => expect(wrapper!.text()).toContain('Browser performance research'))

    expect(wrapper.get('.news-summary-attribution a').attributes('href')).toBe('https://news.ycombinator.com/')
    expect(wrapper.get('.news-summary-list a').attributes()).toMatchObject({
      href: 'https://example.org/research',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(wrapper.text()).toContain('example.org · 28 分 · 7 条讨论')
  })

  it('waits for explicit extension permission before fetching', async () => {
    const fetcher = mockFeed()
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'b'.repeat(32) }, permissions: { contains, request } })
    vi.stubGlobal('fetch', fetcher)
    wrapper = mount(NewsSummaryWidget)
    await flushPromises()

    expect(fetcher).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper!.text()).toContain('Browser performance research'))

    expect(request).toHaveBeenCalledWith({ origins: [hackerNewsHostPermission] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('preserves the last successful feed after an offline refresh and can recover', async () => {
    let feedRequestCount = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/topstories.json')) {
        feedRequestCount += 1
        return feedRequestCount === 2 ? response(null, false) : response([101])
      }
      return feedRequestCount === 1
        ? response({ id: 101, type: 'story', title: 'Browser performance research', url: 'https://example.org/research', score: 28, descendants: 7 })
        : response({ id: 101, type: 'story', title: 'Recovered story', url: 'https://recovered.example/' })
    })
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('fetch', fetcher)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T00:00:00Z'))
    wrapper = mount(NewsSummaryWidget)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Browser performance research')

    await vi.advanceTimersByTimeAsync(16 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(wrapper.text()).toContain('Browser performance research')
    expect(wrapper.text()).toContain('资讯服务暂时不可用')

    await wrapper.get('.news-summary-refresh').trigger('click')
    await vi.waitFor(() => expect(wrapper!.text()).toContain('Recovered story'))
    expect(wrapper.text()).not.toContain('资讯服务暂时不可用')
  })
})
