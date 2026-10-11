<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getFocusTimerRemainingMs, type FocusTimerState } from '../data/focusTimerState'

const props = defineProps<{ state: FocusTimerState }>()
const now = ref(Date.now())
const remainingMs = computed(() => getFocusTimerRemainingMs(props.state, now.value))
const clockText = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1000)
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
})
const phaseLabel = computed(() => ({ focus: '专注时间', 'short-break': '短暂休息', 'long-break': '长休息' })[props.state.phase])
let timer: number | undefined

function syncTimer() {
  if (props.state.endsAt === null) {
    if (timer !== undefined) window.clearInterval(timer)
    timer = undefined
    return
  }
  if (timer === undefined) timer = window.setInterval(() => { now.value = Date.now() }, 1000)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') now.value = Date.now()
}

watch(() => props.state.endsAt, syncTimer)
onMounted(() => {
  syncTimer()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="home-widget-summary focus-timer-summary" aria-label="专注计时状态">
    <p class="home-widget-highlight">{{ phaseLabel }}</p>
    <p class="focus-timer-summary-clock" role="timer" aria-label="剩余时间">{{ clockText }}</p>
    <p class="home-widget-empty">已完成 {{ state.completedSessions }} 轮专注</p>
  </div>
</template>
