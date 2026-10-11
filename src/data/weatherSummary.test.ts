import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWeatherSummary, isValidWeatherCode, weatherDescription } from './weatherSummary'

afterEach(() => vi.unstubAllGlobals())

describe('weather summary data', () => {
  it('resolves a city and validates its current weather response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: '上海', admin1: '上海', country: '中国', latitude: 31.2, longitude: 121.5 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current: { temperature_2m: 21.6, weather_code: 2 } }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWeatherSummary(' 上海 ', new AbortController().signal)).resolves.toEqual({
      city: '上海', area: '上海 · 中国', temperature: 21.6, weatherCode: 2,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('name=%E4%B8%8A%E6%B5%B7')
  })

  it('rejects malformed or missing city and weather data', async () => {
    const signal = new AbortController().signal
    await expect(fetchWeatherSummary(' ', signal)).rejects.toThrow('请先在天气面板中设置城市')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ name: '无效', latitude: 200, longitude: 0 }] }) }))
    await expect(fetchWeatherSummary('无效', signal)).rejects.toThrow('没有找到这个城市')

    const malformedWeather = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: '上海', latitude: 31.2, longitude: 121.5 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current: { temperature_2m: '21', weather_code: 2 } }) })
    vi.stubGlobal('fetch', malformedWeather)
    await expect(fetchWeatherSummary('上海', signal)).rejects.toThrow('数据格式无法识别')
  })

  it('maps Open-Meteo weather codes into readable labels', () => {
    expect(weatherDescription(0)).toBe('晴朗')
    expect(weatherDescription(61)).toBe('下雨')
    expect(weatherDescription(95)).toBe('雷雨')
    expect(weatherDescription(56)).toBe('冻毛毛雨')
    expect(weatherDescription(90)).toBe('天气状况')
    expect(isValidWeatherCode(97)).toBe(true)
    expect(isValidWeatherCode(90)).toBe(false)
  })
})
