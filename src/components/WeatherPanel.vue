<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, RefreshCw, Search, Snowflake, Sun, Wind } from '@lucide/vue'
import { isValidCalendarDate } from '../data/countdown'

interface LocationResult {
  id: number
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
}

interface WeatherResponse {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weather_code: number
    wind_speed_10m: number
    time: string
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

const props = defineProps<{ city: string }>()
const emit = defineEmits<{ 'update:city': [city: string] }>()
const query = ref(props.city || '上海')
const locations = ref<LocationResult[]>([])
const selectedLocation = ref<LocationResult>()
const forecast = ref<WeatherResponse>()
const loading = ref(false)
const error = ref('')
let requestVersion = 0
let activeRequest: AbortController | undefined

const today = computed(() => forecast.value?.daily.time[0])

function weatherLabel(code: number) {
  if (code === 0) return '晴朗'
  if (code === 1) return '大致晴朗'
  if (code === 2) return '局部多云'
  if (code === 3) return '阴天'
  if (code === 45 || code === 48) return '有雾'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code >= 61 && code <= 67) return '下雨'
  if (code >= 71 && code <= 77) return '下雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code >= 95) return '雷雨'
  return '天气状况'
}

function WeatherIcon({ code }: { code: number }) {
  if (code === 0) return Sun
  if (code === 1 || code === 2) return CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudRain
  if (code >= 71 && code <= 86) return Snowflake
  if (code >= 95) return CloudLightning
  return CloudSun
}

async function loadForecast(location: LocationResult) {
  const version = beginRequest()
  loading.value = true
  selectedLocation.value = location
  try {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      forecast_days: '3',
      timezone: 'auto',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: activeRequest?.signal })
    if (!response.ok) throw new Error('天气服务暂时不可用，请稍后重试。')
    const data: unknown = await response.json()
    if (!isWeatherResponse(data)) throw new Error('天气服务返回的数据格式无法识别。')
    if (version !== requestVersion) return
    forecast.value = data
    locations.value = []
    emit('update:city', location.name)
  } catch (cause) {
    if (version === requestVersion && !isAbortError(cause)) {
      forecast.value = undefined
      error.value = cause instanceof Error ? cause.message : '天气数据加载失败，请检查网络后重试。'
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function searchCity() {
  const name = query.value.trim()
  if (!name) return
  const version = beginRequest()
  loading.value = true
  forecast.value = undefined
  locations.value = []
  selectedLocation.value = undefined
  try {
    const params = new URLSearchParams({ name, count: '6', language: 'zh', format: 'json' })
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal: activeRequest?.signal })
    if (!response.ok) throw new Error('城市搜索暂时不可用，请稍后重试。')
    const data: unknown = await response.json()
    if (!isRecord(data) || (data.results !== undefined && !Array.isArray(data.results))) throw new Error('城市搜索返回的数据格式无法识别。')
    if (version !== requestVersion) return
    locations.value = (data.results ?? []).filter(isLocationResult)
    if (!locations.value.length) error.value = '没有找到这个城市，请换个名称试试。'
    else if (locations.value.length === 1) await loadForecast(locations.value[0]!)
  } catch (cause) {
    if (version === requestVersion && !isAbortError(cause)) error.value = cause instanceof Error ? cause.message : '城市搜索失败，请检查网络后重试。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function beginRequest() {
  activeRequest?.abort()
  activeRequest = new AbortController()
  requestVersion += 1
  error.value = ''
  return requestVersion
}

function isAbortError(cause: unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocationResult(value: unknown): value is LocationResult {
  return isRecord(value)
    && typeof value.id === 'number'
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

function isWeatherResponse(value: unknown): value is WeatherResponse {
  if (!isRecord(value)) return false
  const current = value.current
  const daily = value.daily
  if (!isRecord(current) || !isRecord(daily)) return false
  const times = daily.time
  const weatherCodes = daily.weather_code
  const temperatureMax = daily.temperature_2m_max
  const temperatureMin = daily.temperature_2m_min
  const currentKeys = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m']
  if (!currentKeys.every((key) => typeof current[key] === 'number' && Number.isFinite(current[key]))) return false
  return Array.isArray(times)
    && Array.isArray(weatherCodes)
    && Array.isArray(temperatureMax)
    && Array.isArray(temperatureMin)
    && times.length > 0
    && times.length <= 7
    && times.every(isValidCalendarDate)
    && [weatherCodes, temperatureMax, temperatureMin].every((series) =>
      series.length === times.length
      && series.every((item) => typeof item === 'number' && Number.isFinite(item)))
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
}

onMounted(searchCity)
onBeforeUnmount(() => {
  requestVersion += 1
  activeRequest?.abort()
})
</script>

<template>
  <div class="weather-content">
    <form class="weather-search" @submit.prevent="searchCity">
      <input v-model="query" aria-label="搜索城市天气" placeholder="输入城市名称" />
      <button type="submit" aria-label="搜索城市" :disabled="loading"><Search :size="17" /></button>
    </form>

    <p v-if="loading && !forecast" class="weather-status" role="status">正在获取天气…</p>
    <p v-else-if="error" class="weather-status weather-error" role="alert">{{ error }}</p>

    <div v-if="locations.length > 1 && !forecast" class="weather-locations" aria-label="选择城市">
      <button v-for="location in locations" :key="location.id" type="button" @click="loadForecast(location)">
        <span>{{ location.name }}</span><small>{{ [location.admin1, location.country].filter(Boolean).join(' · ') }}</small>
      </button>
    </div>

    <template v-if="forecast && selectedLocation">
      <header class="weather-place">
        <div><p>{{ [selectedLocation.admin1, selectedLocation.country].filter(Boolean).join(' · ') }}</p><h3>{{ selectedLocation.name }}</h3></div>
        <button type="button" aria-label="刷新天气" :disabled="loading" @click="loadForecast(selectedLocation)"><RefreshCw :size="16" /></button>
      </header>
      <div class="weather-current">
        <component :is="WeatherIcon({ code: forecast.current.weather_code })" :size="54" :stroke-width="1.6" />
        <div><strong>{{ Math.round(forecast.current.temperature_2m) }}°</strong><span>{{ weatherLabel(forecast.current.weather_code) }}</span></div>
        <p>体感 {{ Math.round(forecast.current.apparent_temperature) }}°</p>
      </div>
      <div class="weather-details">
        <span><Droplets :size="15" /> 湿度 {{ forecast.current.relative_humidity_2m }}%</span>
        <span><Wind :size="15" /> 风速 {{ Math.round(forecast.current.wind_speed_10m) }} km/h</span>
      </div>
      <section class="weather-days" aria-label="未来天气">
        <div v-for="(date, index) in forecast.daily.time" :key="date" class="weather-day">
          <span>{{ date === today ? '今天' : formatWeekday(date) }}</span>
          <component :is="WeatherIcon({ code: forecast.daily.weather_code[index] ?? 0 })" :size="19" />
          <span>{{ weatherLabel(forecast.daily.weather_code[index] ?? 0) }}</span>
          <strong>{{ Math.round(forecast.daily.temperature_2m_max[index] ?? 0) }}° / {{ Math.round(forecast.daily.temperature_2m_min[index] ?? 0) }}°</strong>
        </div>
      </section>
    </template>
    <p class="weather-attribution">天气数据来自 Open-Meteo · 无需账号或设备定位</p>
  </div>
</template>
