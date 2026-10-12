<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getLocalDateKey, isHabitCompleteOn } from '../data/habits'
import type { Habit } from '../types'

const props = defineProps<{ items: Habit[] }>()
const today = ref(getLocalDateKey())
const completedCount = computed(() => props.items.filter((habit) => isHabitCompleteOn(habit, today.value)).length)
const nextHabits = computed(() => props.items.filter((habit) => !isHabitCompleteOn(habit, today.value)).slice(0, 3))
let refreshTimer: number | undefined

function refreshToday() {
  today.value = getLocalDateKey()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') refreshToday()
}

onMounted(() => {
  refreshTimer = window.setInterval(refreshToday, 60_000)
  window.addEventListener('focus', refreshToday)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
  window.removeEventListener('focus', refreshToday)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="home-widget-summary habits-summary" aria-label="习惯打卡概览">
    <p class="home-widget-metric">今天完成 {{ completedCount }} / {{ items.length }} 个习惯</p>
    <ul v-if="nextHabits.length" class="home-widget-preview">
      <li v-for="habit in nextHabits" :key="habit.id">{{ habit.title }}</li>
    </ul>
    <p v-else class="home-widget-empty">{{ items.length ? '今天的习惯全部完成。' : '从一个容易坚持的小目标开始。' }}</p>
  </div>
</template>
