<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, RefreshCw, Snowflake, Sun } from '@lucide/vue'
import { fetchWeatherSummary, weatherDescription, type WeatherSummary } from '../data/weatherSummary'
import { hasWeatherPermission, requestWeatherPermission } from '../data/weatherPermissions'

const props = defineProps<{ city: string }>()
const summary = ref<WeatherSummary>()
const loading = ref(false)
const error = ref('')
const permissionRequired = ref(false)
const requestingPermission = ref(false)
const weatherIcon = computed(() => {
  const code = summary.value?.weatherCode ?? 0
  if (code === 0) return Sun
  if (code === 1 || code === 2) return CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudRain
  if (code >= 71 && code <= 86) return Snowflake
  if (code >= 95) return CloudLightning
  return CloudSun
})
let requestVersion = 0
let activeRequest: AbortController | undefined
let lastUpdatedAt = 0
const refreshInterval = 15 * 60 * 1000

async function refreshWeather() {
  const version = ++requestVersion
  activeRequest?.abort()
  loading.value = true
  error.value = ''
  try {
    if (!(await hasWeatherPermission())) {
      if (version === requestVersion) permissionRequired.value = true
      return
    }
    if (version !== requestVersion) return
    permissionRequired.value = false
    const controller = new AbortController()
    activeRequest = controller
    let timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 15_000)
    try {
      const result = await fetchWeatherSummary(props.city, controller.signal)
      if (version !== requestVersion) return
      summary.value = result
      lastUpdatedAt = Date.now()
    } catch (cause) {
      if (version !== requestVersion || (controller.signal.aborted && !timedOut)) return
      error.value = timedOut ? '天气请求超时，请检查网络后重试。' : cause instanceof Error ? cause.message : '天气数据加载失败，请稍后重试。'
    } finally {
      window.clearTimeout(timeout)
    }
  } catch (cause) {
    if (version === requestVersion) {
      error.value = cause instanceof Error ? cause.message : '无法检查天气访问权限，请稍后重试。'
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function authorizeWeather() {
  requestingPermission.value = true
  error.value = ''
  try {
    if (await requestWeatherPermission()) {
      await refreshWeather()
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

function refreshIfStale() {
  if (!loading.value && document.visibilityState === 'visible' && Date.now() - lastUpdatedAt >= refreshInterval) void refreshWeather()
}

watch(() => props.city, () => {
  // A reading for the previous city is not a useful fallback for the newly selected city.
  summary.value = undefined
  lastUpdatedAt = 0
  void refreshWeather()
})
onMounted(() => {
  window.addEventListener('focus', refreshIfStale)
  document.addEventListener('visibilitychange', refreshIfStale)
  void refreshWeather()
})
onBeforeUnmount(() => {
  requestVersion += 1
  activeRequest?.abort()
  window.removeEventListener('focus', refreshIfStale)
  document.removeEventListener('visibilitychange', refreshIfStale)
})
</script>

<template>
  <div class="weather-summary-widget" :aria-busy="loading">
    <div v-if="!summary" class="weather-summary-empty">
      <div class="weather-summary-copy">
        <p v-if="loading" class="weather-summary-status" role="status">正在获取天气…</p>
        <p v-else-if="permissionRequired" class="weather-summary-status" role="status">天气联网功能尚未授权。</p>
        <p v-else class="weather-summary-status" role="status">{{ error || '天气暂不可用' }}</p>
        <a class="weather-summary-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">天气数据由 Open-Meteo 提供</a>
      </div>
      <button v-if="permissionRequired" class="weather-summary-refresh weather-summary-authorize" type="button" :disabled="requestingPermission" @click="authorizeWeather">{{ requestingPermission ? '等待授权…' : '授权并获取天气' }}</button>
      <button v-else-if="!loading" class="weather-summary-refresh" type="button" aria-label="重试获取天气" @click="refreshWeather"><RefreshCw :size="14" /></button>
    </div>
    <div v-else class="weather-summary-current">
      <component :is="weatherIcon" :size="31" :stroke-width="1.7" aria-hidden="true" />
      <div class="weather-summary-copy">
        <strong :title="summary.area">{{ summary.city }} {{ Math.round(summary.temperature) }}°</strong>
        <span>{{ weatherDescription(summary.weatherCode) }}</span>
        <a class="weather-summary-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">天气数据由 Open-Meteo 提供</a>
        <small v-if="permissionRequired" role="status">天气联网访问未授权，当前显示的是已有结果。</small>
        <small v-if="error" role="status">天气更新失败，显示上次结果</small>
      </div>
      <button v-if="permissionRequired" class="weather-summary-refresh weather-summary-authorize" type="button" :disabled="requestingPermission" @click="authorizeWeather">{{ requestingPermission ? '等待授权…' : '授权天气访问' }}</button>
      <button v-else class="weather-summary-refresh" type="button" aria-label="刷新天气" :disabled="loading" @click="refreshWeather"><RefreshCw :size="14" /></button>
    </div>
  </div>
</template>
