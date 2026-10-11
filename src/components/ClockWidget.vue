<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const now = ref(new Date())
let timer: number | undefined
const time = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(now.value))
const date = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(now.value))

function refresh() {
  now.value = new Date()
}

onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 30_000)
  document.addEventListener('visibilitychange', refresh)
})
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer)
  document.removeEventListener('visibilitychange', refresh)
})
</script>

<template>
  <time class="home-clock" :datetime="now.toISOString()" aria-label="当前时间和日期">
    <span class="clock-time">{{ time }}</span>
    <span class="clock-date">{{ date }}</span>
  </time>
</template>
