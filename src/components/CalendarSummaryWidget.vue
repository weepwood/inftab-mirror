<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getCalendarDays, toLocalDateKey } from '../data/calendar'

const now = ref(new Date())
const monthLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(now.value))
const todayKey = computed(() => toLocalDateKey(now.value))
const days = computed(() => getCalendarDays(now.value.getFullYear(), now.value.getMonth()))
const dayFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
let refreshTimer: number | undefined

function refresh() {
  now.value = new Date()
}

onMounted(() => {
  refreshTimer = window.setInterval(refresh, 60_000)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
})
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
  window.removeEventListener('focus', refresh)
  document.removeEventListener('visibilitychange', refresh)
})
</script>

<template>
  <div class="home-widget-calendar" role="group" :aria-label="`${monthLabel}日历`">
    <span v-for="weekday in weekdays" :key="weekday" class="home-widget-calendar-weekday" aria-hidden="true">{{ weekday }}</span>
    <time
      v-for="day in days"
      :key="day.dateKey"
      class="home-widget-calendar-day"
      :class="{ 'outside-month': !day.inCurrentMonth, today: day.dateKey === todayKey }"
      :datetime="day.dateKey"
      :aria-label="dayFormatter.format(day.date)"
      :aria-current="day.dateKey === todayKey ? 'date' : undefined"
    >{{ day.day }}</time>
  </div>
</template>
