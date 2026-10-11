// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WeatherPanel from './WeatherPanel.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function response(body: unknown) {
  return { ok: true, json: async () => body } as Response
}

const locations = [
  { id: 1, name: '新加坡东', admin1: '新加坡', country: '新加坡', latitude: 1.3, longitude: 103.9 },
  { id: 2, name: '新加坡西', admin1: '新加坡', country: '新加坡', latitude: 1.35, longitude: 103.7 },
]

function forecast(temperature: number) {
  return {
    current: {
      temperature_2m: temperature,
      apparent_temperature: temperature,
      relative_humidity_2m: 50,
      weather_code: 1,
      wind_speed_10m: 5,
      time: '2026-10-12T12:00',
    },
    daily: {
      time: ['2026-10-12'],
      weather_code: [1],
      temperature_2m_max: [temperature + 2],
      temperature_2m_min: [temperature - 2],
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('WeatherPanel request ordering', () => {
  it('ignores a slow city search after a newer search has completed', async () => {
    const oldSearch = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce(response({ results: locations }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(WeatherPanel, { props: { city: '旧城市' } })
    await flushPromises()

    await wrapper.get('input').setValue('新加坡')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    oldSearch.resolve(response({ results: [{ ...locations[0], id: 9, name: '旧城市结果' }] }))
    await flushPromises()

    expect(wrapper.find('.weather-locations').text()).toContain('新加坡东')
    expect(wrapper.find('.weather-locations').text()).not.toContain('旧城市结果')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('keeps the latest selected city when an earlier forecast arrives late', async () => {
    const oldForecast = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: locations }))
      .mockReturnValueOnce(oldForecast.promise)
      .mockResolvedValueOnce(response(forecast(27)))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(WeatherPanel, { props: { city: '新加坡' } })
    await flushPromises()

    const choices = wrapper.findAll('.weather-locations button')
    await choices[0]!.trigger('click')
    await choices[1]!.trigger('click')
    await flushPromises()
    oldForecast.resolve(response(forecast(8)))
    await flushPromises()

    expect(wrapper.find('.weather-place h3').text()).toBe('新加坡西')
    expect(wrapper.find('.weather-current strong').text()).toBe('27°')
    wrapper.unmount()
  })
})
