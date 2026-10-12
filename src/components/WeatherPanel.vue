<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, RefreshCw, Search, Snowflake, Sun, Wind } from '@lucide/vue'
import { isValidCalendarDate } from '../data/countdown'
import { isValidWeatherCode, weatherDescription as weatherLabel } from '../data/weatherSummary'
import { hasWeatherPermission, requestWeatherPermission } from '../data/weatherPermissions'

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
const permissionRequired = ref(false)
const requestingPermission = ref(false)
let requestVersion = 0
let activeRequest: AbortController | undefined
let internallySelectedCity = ''
const requestTimeoutMs = 15_000

const today = computed(() => forecast.value?.daily.time[0])

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
  query.value = location.name
  selectedLocation.value = location
  try {
    if (!(await hasWeatherPermission())) {
      if (version === requestVersion) permissionRequired.value = true
      return
    }
    if (version !== requestVersion) return
    permissionRequired.value = false
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      forecast_days: '3',
      timezone: 'auto',
    })
    const data = await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`, '天气服务暂时不可用，请稍后重试。')
    if (!isWeatherResponse(data)) throw new Error('天气服务返回的数据格式无法识别。')
    if (version !== requestVersion) return
    forecast.value = data
    locations.value = []
    if (props.city !== location.name) {
      internallySelectedCity = location.name
      emit('update:city', location.name)
    }
  } catch (cause) {
    if (version === requestVersion && !isAbortError(cause)) {
      forecast.value = undefined
      error.value = cause instanceof Error ? cause.message : '天气数据加载失败，请检查网络后重试。'
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

watch(() => props.city, (city) => {
  if (city === internallySelectedCity) {
    internallySelectedCity = ''
    return
  }
  internallySelectedCity = ''
  query.value = city || '上海'
  void searchCity()
})

async function searchCity() {
  const name = query.value.trim()
  if (!name) {
    beginRequest()
    loading.value = false
    forecast.value = undefined
    locations.value = []
    selectedLocation.value = undefined
    error.value = '请输入城市名称。'
    return
  }
  const version = beginRequest()
  loading.value = true
  forecast.value = undefined
  locations.value = []
  selectedLocation.value = undefined
  try {
    if (!(await hasWeatherPermission())) {
      if (version === requestVersion) permissionRequired.value = true
      return
    }
    if (version !== requestVersion) return
    permissionRequired.value = false
    const params = new URLSearchParams({ name, count: '6', language: 'zh', format: 'json' })
    const data = await requestJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, '城市搜索暂时不可用，请稍后重试。')
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

async function authorizeWeather() {
  requestingPermission.value = true
  error.value = ''
  try {
    if (await requestWeatherPermission()) {
      permissionRequired.value = false
      await searchCity()
    } else {
      permissionRequired.value = true
      error.value = '尚未获得天气访问权限。'
    }
  } catch (cause) {
    permissionRequired.value = true
    error.value = cause instanceof Error ? cause.message : '天气访问授权失败，请重试。'
  } finally {
    requestingPermission.value = false
  }
}

function beginRequest() {
  activeRequest?.abort()
  activeRequest = new AbortController()
  requestVersion += 1
  error.value = ''
  return requestVersion
}

async function requestJson(url: string, unavailableMessage: string): Promise<unknown> {
  const controller = activeRequest
  if (!controller) throw new Error(unavailableMessage)
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, requestTimeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(unavailableMessage)
    return await response.json()
  } catch (cause) {
    if (timedOut) throw new Error('请求超时，请检查网络后重试。')
    throw cause
  } finally {
    clearTimeout(timeout)
  }
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
  if (!isValidWeatherCode(current.weather_code)) return false
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
    && weatherCodes.every(isValidWeatherCode)
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
      <button type="submit" aria-label="搜索城市"><Search :size="17" /></button>
    </form>

    <p v-if="permissionRequired" class="weather-status" role="status">天气联网功能需要你授权 Open-Meteo 访问权限后才会请求数据。</p>
    <p v-else-if="loading && !forecast" class="weather-status" role="status">正在获取天气…</p>
    <p v-else-if="error" class="weather-status weather-error" role="alert">{{ error }}</p>
    <button v-if="permissionRequired" class="button-secondary weather-authorize" type="button" :disabled="requestingPermission" @click="authorizeWeather">{{ requestingPermission ? '等待授权…' : '授权并加载天气' }}</button>

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
