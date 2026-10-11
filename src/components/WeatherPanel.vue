<script setup lang="ts">
import { ref } from 'vue'
import { CloudSun, ExternalLink } from '@lucide/vue'

const city = ref(localStorage.getItem('inftab.weather-city') || '上海')
function openForecast() {
  localStorage.setItem('inftab.weather-city', city.value)
  const query = encodeURIComponent(`${city.value.trim() || '上海'} 天气`)
  window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="weather-content">
    <div class="weather-icon"><CloudSun :size="54" :stroke-width="1.6" /></div>
    <p class="weather-title">查看本地天气</p>
    <p class="weather-copy">输入城市后，在新标签页中打开天气预报。</p>
    <form class="inline-add" @submit.prevent="openForecast">
      <input v-model="city" aria-label="城市名称" placeholder="输入城市" />
      <button type="submit" aria-label="打开天气预报"><ExternalLink :size="17" /></button>
    </form>
    <small>天气数据由搜索引擎提供，本页面不会请求位置权限。</small>
  </div>
</template>
