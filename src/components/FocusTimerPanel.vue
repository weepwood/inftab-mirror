<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Pause, Play, RotateCcw } from '@lucide/vue'
import { useStoredState } from '../composables/useStoredState'
import {
  advanceFocusTimer,
  defaultFocusTimerState,
  getFocusTimerRemainingMs,
  pauseFocusTimer,
  resetFocusTimer,
  sanitizeFocusTimerState,
  setFocusDuration,
  startFocusTimer,
  type FocusPhase,
} from '../data/focusTimer'

const state = useStoredState('inftab.focus-timer.v1', defaultFocusTimerState, sanitizeFocusTimerState)
const now = ref(Date.now())
const remainingMs = computed(() => getFocusTimerRemainingMs(state.value, now.value))
const running = computed(() => state.value.endsAt !== null && remainingMs.value > 0)
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
  state.value = advanceFocusTimer(state.value, now.value)
}

function start() {
  state.value = startFocusTimer(state.value, Date.now())
  tick()
}

function pause() {
  state.value = pauseFocusTimer(state.value, Date.now())
  tick()
}

function reset() {
  state.value = resetFocusTimer(state.value)
  tick()
}

function changeFocusDuration(event: Event) {
  state.value = setFocusDuration(state.value, Number((event.target as HTMLSelectElement).value))
}

onMounted(() => {
  tick()
  tickTimer = window.setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
})

onBeforeUnmount(() => {
  if (tickTimer !== undefined) window.clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', tick)
})
</script>

<template>
  <div class="focus-timer-content">
    <p class="focus-timer-phase" aria-live="polite">{{ phaseLabels[state.phase] }}</p>
    <output class="focus-timer-clock" role="timer" aria-label="剩余时间">{{ clockText }}</output>
    <p class="focus-timer-sessions">已完成 {{ state.completedSessions }} 轮专注；每四轮安排一次长休息。</p>
    <div class="focus-timer-controls">
      <button v-if="running" class="button-secondary" type="button" aria-label="暂停计时" @click="pause"><Pause :size="17" /> 暂停</button>
      <button v-else class="button-primary" type="button" aria-label="开始计时" @click="start"><Play :size="17" /> 开始</button>
      <button class="button-secondary" type="button" aria-label="重置计时" @click="reset"><RotateCcw :size="16" /> 重置</button>
    </div>
    <label class="focus-timer-duration">专注时长
      <select aria-label="专注时长" :value="state.focusMinutes" :disabled="running || state.phase !== 'focus'" @change="changeFocusDuration">
        <option :value="15">15 分钟</option>
        <option :value="25">25 分钟</option>
        <option :value="50">50 分钟</option>
      </select>
    </label>
    <p class="focus-timer-note">计时保存在本机，关闭面板或重新打开标签页后会继续。</p>
  </div>
</template>
