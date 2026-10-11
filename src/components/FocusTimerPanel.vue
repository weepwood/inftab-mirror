<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pause, Play, RotateCcw } from '@lucide/vue'
import { getFocusTimerRemainingMs, type FocusTimerState, type FocusPhase } from '../data/focusTimerState'

const props = defineProps<{ state: FocusTimerState }>()
const emit = defineEmits<{
  start: []
  pause: []
  reset: []
  setDuration: [minutes: number]
}>()
const now = ref(Date.now())
const remainingMs = computed(() => getFocusTimerRemainingMs(props.state, now.value))
const running = computed(() => props.state.endsAt !== null && remainingMs.value > 0)
const clockText = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
})
const phaseLabels: Record<FocusPhase, string> = {
  focus: '专注时间',
  'short-break': '短暂休息',
  'long-break': '长休息',
}
let tickTimer: number | undefined

function tick() {
  now.value = Date.now()
}

function syncTickTimer() {
  if (props.state.endsAt === null) {
    if (tickTimer !== undefined) window.clearInterval(tickTimer)
    tickTimer = undefined
    return
  }
  if (tickTimer === undefined) tickTimer = window.setInterval(tick, 1000)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') tick()
}

watch(() => props.state.endsAt, syncTickTimer)

onMounted(() => {
  tick()
  syncTickTimer()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  if (tickTimer !== undefined) window.clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="focus-timer-content">
    <p class="focus-timer-phase" aria-live="polite">{{ phaseLabels[state.phase] }}</p>
    <output class="focus-timer-clock" role="timer" aria-label="剩余时间">{{ clockText }}</output>
    <p class="focus-timer-sessions">已完成 {{ state.completedSessions }} 轮专注；每四轮安排一次长休息。</p>
    <div class="focus-timer-controls">
      <button v-if="running" class="button-secondary" type="button" aria-label="暂停计时" @click="emit('pause')"><Pause :size="17" /> 暂停</button>
      <button v-else class="button-primary" type="button" aria-label="开始计时" @click="emit('start')"><Play :size="17" /> 开始</button>
      <button class="button-secondary" type="button" aria-label="重置计时" @click="emit('reset')"><RotateCcw :size="16" /> 重置</button>
    </div>
    <label class="focus-timer-duration">专注时长
      <select aria-label="专注时长" :value="state.focusMinutes" :disabled="running || state.phase !== 'focus'" @change="emit('setDuration', Number(($event.target as HTMLSelectElement).value))">
        <option :value="15">15 分钟</option>
        <option :value="25">25 分钟</option>
        <option :value="50">50 分钟</option>
      </select>
    </label>
    <p class="focus-timer-note">计时保存在本机，关闭面板或重新打开标签页后会继续。</p>
  </div>
</template>
