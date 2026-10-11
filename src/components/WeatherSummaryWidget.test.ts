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

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
})
