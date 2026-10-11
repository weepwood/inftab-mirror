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

  it('shows a recoverable error for an invalid forecast date instead of rendering a broken weekday', async () => {
    const invalidForecast = forecast(20)
    invalidForecast.daily.time = ['not-a-date']
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ results: [locations[0]] }))
      .mockResolvedValueOnce(response(invalidForecast)))
    const wrapper = mount(WeatherPanel, { props: { city: '新加坡' } })
    await flushPromises()

    expect(wrapper.find('.weather-error').text()).toContain('数据格式无法识别')
    expect(wrapper.find('.weather-days').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not request a forecast for out-of-range coordinates returned by geocoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      results: [{ ...locations[0], latitude: 95 }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(WeatherPanel, { props: { city: '新加坡' } })
    await flushPromises()

    expect(wrapper.find('.weather-error').text()).toContain('没有找到这个城市')
    expect(fetchMock).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('refreshes when the saved city changes externally without repeating its own selection', async () => {
    const tokyo = { id: 3, name: '东京', admin1: '东京', country: '日本', latitude: 35.7, longitude: 139.7 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: locations }))
      .mockResolvedValueOnce(response(forecast(8)))
      .mockResolvedValueOnce(response({ results: [tokyo] }))
      .mockResolvedValueOnce(response(forecast(17)))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(WeatherPanel, { props: { city: '新加坡' } })
    await flushPromises()

    await wrapper.get('.weather-locations button').trigger('click')
    await flushPromises()
    await wrapper.setProps({ city: '新加坡东' })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await wrapper.setProps({ city: '东京' })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(wrapper.find('.weather-place h3').text()).toBe('东京')
    expect(wrapper.find('.weather-current strong').text()).toBe('17°')
    wrapper.unmount()
  })
})
