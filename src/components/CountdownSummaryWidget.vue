<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { daysUntilCountdown } from '../data/countdown'
import type { CountdownItem } from '../types'

const props = defineProps<{ items: CountdownItem[] }>()
const now = ref(new Date())
let refreshTimer: number | undefined
const nextItem = computed(() => props.items
  .map((item) => ({ item, days: daysUntilCountdown(item, now.value) }))
  .filter(({ item, days }) => item.recurrence === 'yearly' || days >= 0)
  .sort((left, right) => left.days - right.days)[0])

function refresh() {
  now.value = new Date()
}

onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(refresh, 60_000)
  document.addEventListener('visibilitychange', refresh)
})
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refresh)
})
</script>

<template>
  <div class="home-widget-summary" aria-label="最近倒计时">
    <template v-if="nextItem">
      <p class="home-widget-metric">{{ nextItem.days === 0 ? '就在今天' : `还有 ${nextItem.days} 天` }}</p>
      <p class="home-widget-highlight">{{ nextItem.item.title }}</p>
    </template>
    <p v-else class="home-widget-empty">添加一个重要日期，记住值得期待的日子。</p>
  </div>
</template>
