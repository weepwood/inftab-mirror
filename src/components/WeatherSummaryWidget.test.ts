// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WeatherSummaryWidget from './WeatherSummaryWidget.vue'

let wrapper: VueWrapper | undefined

function weatherResponse(city: string, temperature: number) {
  return [
    { ok: true, json: async () => ({ results: [{ name: city, admin1: city, country: '中国', latitude: 31.2, longitude: 121.5 }] }) },
    { ok: true, json: async () => ({ current: { temperature_2m: temperature, weather_code: 2 } }) },
  ]
}

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
  vi.restoreAllMocks()
})

describe('WeatherSummaryWidget', () => {
  it('loads the selected city and refreshes when the tab returns after data becomes stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T12:00:00'))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(weatherResponse('上海', 21.6)[0])
      .mockResolvedValueOnce(weatherResponse('上海', 21.6)[1])
      .mockResolvedValueOnce(weatherResponse('上海', 19)[0])
      .mockResolvedValueOnce(weatherResponse('上海', 19)[1])
    vi.stubGlobal('fetch', fetchMock)

    wrapper = mount(WeatherSummaryWidget, { attachTo: document.body, props: { city: '上海' } })
    await flushPromises()
    expect(wrapper.text()).toContain('上海 22°')
    expect(wrapper.text()).toContain('局部多云')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.setSystemTime(new Date('2026-10-12T12:14:00'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.setSystemTime(new Date('2026-10-12T12:16:00'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(wrapper.text()).toContain('上海 19°')
  })

  it('retains the last good reading and offers a retry when refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(weatherResponse('上海', 21)[0])
      .mockResolvedValueOnce(weatherResponse('上海', 21)[1])
      .mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(WeatherSummaryWidget, { attachTo: document.body, props: { city: '上海' } })
    await flushPromises()
    await wrapper.get('[aria-label="刷新天气"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('上海 21°')
    expect(wrapper.text()).toContain('天气更新失败，显示上次结果')
  })

  it('keeps the data source visible and retryable when the initial request fails', async () => {
    const initialRequest = deferred<{ ok: boolean; json: () => Promise<unknown> }>()
    const fetchMock = vi.fn().mockReturnValue(initialRequest.promise)
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(WeatherSummaryWidget, { attachTo: document.body, props: { city: '上海' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('正在获取天气')
    expect(wrapper.find('.weather-summary-attribution').exists()).toBe(true)

    initialRequest.resolve({ ok: false, json: async () => ({}) })
    await flushPromises()

    const attribution = wrapper.get('.weather-summary-attribution')
    expect(attribution.text()).toBe('天气数据由 Open-Meteo 提供')
    expect(attribution.attributes('href')).toBe('https://open-meteo.com/')
    expect(wrapper.get('[role="status"]').text()).toContain('天气服务暂时不可用')
    expect(wrapper.get('[aria-label="重试获取天气"]')).toBeTruthy()

    await wrapper.get('[aria-label="重试获取天气"]').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.weather-summary-attribution').exists()).toBe(true)
  })

  it('does not restart an in-flight stale refresh when focus and visibility events arrive together', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T12:00:00'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const nextLocation = deferred<{ ok: boolean; json: () => Promise<unknown> }>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(weatherResponse('上海', 21)[0])
      .mockResolvedValueOnce(weatherResponse('上海', 21)[1])
      .mockReturnValueOnce(nextLocation.promise)
      .mockResolvedValueOnce(weatherResponse('上海', 19)[1])
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(WeatherSummaryWidget, { attachTo: document.body, props: { city: '上海' } })
    await flushPromises()

    vi.setSystemTime(new Date('2026-10-12T12:16:00'))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).signal?.aborted).toBe(false)

    nextLocation.resolve(weatherResponse('上海', 19)[0])
    await flushPromises()
    expect(wrapper.text()).toContain('上海 19°')
  })

  it('does not show the previous city as current when the new city lookup fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(weatherResponse('上海', 21)[0])
      .mockResolvedValueOnce(weatherResponse('上海', 21)[1])
      .mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(WeatherSummaryWidget, { attachTo: document.body, props: { city: '上海' } })
    await flushPromises()
    expect(wrapper.text()).toContain('上海 21°')

    await wrapper.setProps({ city: '北京' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('上海 21°')
    expect(wrapper.text()).toContain('offline')
    expect(wrapper.get('[aria-label="重试获取天气"]').attributes('aria-label')).toBe('重试获取天气')
  })
})
