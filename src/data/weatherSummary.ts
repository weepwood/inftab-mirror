export interface WeatherLocation {
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
}

export interface WeatherSummary {
  city: string
  area: string
  temperature: number
  weatherCode: number
}

const validWeatherCodes = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99])

export function isValidWeatherCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && validWeatherCodes.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocation(value: unknown): value is WeatherLocation {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && (value.admin1 === undefined || typeof value.admin1 === 'string')
    && (value.country === undefined || typeof value.country === 'string')
}

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('天气服务暂时不可用，请稍后重试。')
  return response.json()
}

export async function fetchWeatherSummary(city: string, signal: AbortSignal): Promise<WeatherSummary> {
  const name = city.trim()
  if (!name) throw new Error('请先在天气面板中设置城市。')

  const locationParams = new URLSearchParams({ name, count: '1', language: 'zh', format: 'json' })
  const locationData = await readJson(`https://geocoding-api.open-meteo.com/v1/search?${locationParams}`, signal)
  const location = isRecord(locationData) && Array.isArray(locationData.results)
    ? locationData.results.find(isLocation)
    : undefined
  if (!location) throw new Error('没有找到这个城市，请在天气面板中检查城市名称。')

  const weatherParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code',
    forecast_days: '1',
    timezone: 'auto',
  })
  const weatherData = await readJson(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, signal)
  if (!isRecord(weatherData) || !isRecord(weatherData.current)
    || typeof weatherData.current.temperature_2m !== 'number' || !Number.isFinite(weatherData.current.temperature_2m)
    || !isValidWeatherCode(weatherData.current.weather_code)) {
    throw new Error('天气服务返回的数据格式无法识别。')
  }

  return {
    city: location.name,
    area: [location.admin1, location.country].filter(Boolean).join(' · '),
    temperature: weatherData.current.temperature_2m,
    weatherCode: weatherData.current.weather_code,
  }
}

export function weatherDescription(code: number) {
  if (code === 0) return '晴朗'
  if (code === 1) return '大致晴朗'
  if (code === 2) return '局部多云'
  if (code === 3) return '阴天'
  if (code === 45 || code === 48) return '有雾'
  if (code >= 51 && code <= 55) return '毛毛雨'
  if (code >= 56 && code <= 57) return '冻毛毛雨'
  if (code >= 61 && code <= 65) return '下雨'
  if (code >= 66 && code <= 67) return '冻雨'
  if (code >= 71 && code <= 77) return '下雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code >= 95) return '雷雨'
  return '天气状况'
}
