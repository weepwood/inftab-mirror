<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, RefreshCw, Snowflake, Sun } from '@lucide/vue'
import { fetchWeatherSummary, weatherDescription, type WeatherSummary } from '../data/weatherSummary'

const props = defineProps<{ city: string }>()
const summary = ref<WeatherSummary>()
const loading = ref(false)
const error = ref('')
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
  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  const version = ++requestVersion
  loading.value = true
  error.value = ''
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
    if (version === requestVersion) loading.value = false
  }
}

function refreshIfStale() {
  if (document.visibilityState === 'visible' && Date.now() - lastUpdatedAt >= refreshInterval) void refreshWeather()
}

watch(() => props.city, () => { void refreshWeather() })
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
    <p v-if="!summary && loading" class="weather-summary-status" role="status">正在获取天气…</p>
    <div v-else-if="!summary" class="weather-summary-empty">
      <span class="weather-summary-status" role="status">{{ error || '天气暂不可用' }}</span>
      <button class="weather-summary-refresh" type="button" aria-label="重试获取天气" :disabled="loading" @click="refreshWeather"><RefreshCw :size="14" /></button>
    </div>
    <div v-else class="weather-summary-current">
      <component :is="weatherIcon" :size="31" :stroke-width="1.7" aria-hidden="true" />
      <div class="weather-summary-copy">
        <strong :title="summary.area">{{ summary.city }} {{ Math.round(summary.temperature) }}°</strong>
        <span>{{ weatherDescription(summary.weatherCode) }}</span>
        <a class="weather-summary-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">天气数据由 Open-Meteo 提供</a>
        <small v-if="error" role="status">天气更新失败，显示上次结果</small>
      </div>
      <button class="weather-summary-refresh" type="button" aria-label="刷新天气" :disabled="loading" @click="refreshWeather"><RefreshCw :size="14" /></button>
    </div>
  </div>
</template>
