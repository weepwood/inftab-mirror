<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, CalendarDays } from '@lucide/vue'
import { getCalendarDays, toLocalDateKey, type CalendarDay } from '../data/calendar'

const today = new Date()
const todayKey = toLocalDateKey(today)
const dayFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
const currentMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref(todayKey)
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const monthLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(currentMonth.value))
const days = computed(() => getCalendarDays(currentMonth.value.getFullYear(), currentMonth.value.getMonth()))
const selectedDateLabel = computed(() => {
  const [year, month, day] = selectedDate.value.split('-').map(Number)
  const selected = new Date(0)
  selected.setFullYear(year!, month! - 1, day!)
  selected.setHours(0, 0, 0, 0)
  return dayFormatter.format(selected)
})

function changeMonth(offset: number) {
  const next = new Date(currentMonth.value)
  next.setMonth(next.getMonth() + offset)
  currentMonth.value = new Date(next.getFullYear(), next.getMonth(), 1)
}

function selectDay(day: CalendarDay) {
  selectedDate.value = day.dateKey
  if (!day.inCurrentMonth) currentMonth.value = new Date(day.date.getFullYear(), day.date.getMonth(), 1)
}

function goToToday() {
  currentMonth.value = new Date(today.getFullYear(), today.getMonth(), 1)
  selectedDate.value = todayKey
}
</script>

<template>
  <div class="calendar-content">
    <div class="calendar-toolbar">
      <button type="button" class="button-secondary calendar-today" @click="goToToday">今天</button>
      <div class="calendar-month-nav">
        <button type="button" class="calendar-nav-button" aria-label="上个月" @click="changeMonth(-1)"><ArrowLeft :size="17" /></button>
        <h3 aria-live="polite">{{ monthLabel }}</h3>
        <button type="button" class="calendar-nav-button next" aria-label="下个月" @click="changeMonth(1)"><ArrowLeft :size="17" /></button>
      </div>
      <CalendarDays :size="18" class="calendar-heading-icon" aria-hidden="true" />
    </div>
    <div class="calendar-grid" role="group" :aria-label="`${monthLabel}日历`">
      <span v-for="weekday in weekdays" :key="weekday" class="calendar-weekday" aria-hidden="true">{{ weekday.slice(1) }}</span>
      <button
        v-for="day in days"
        :key="day.dateKey"
        type="button"
        class="calendar-day"
        :class="{ 'outside-month': !day.inCurrentMonth, today: day.dateKey === todayKey }"
        :aria-label="dayFormatter.format(day.date)"
        :aria-pressed="selectedDate === day.dateKey"
        :aria-current="day.dateKey === todayKey ? 'date' : undefined"
        @click="selectDay(day)"
      >{{ day.day }}</button>
    </div>
    <p class="calendar-selected" role="status">已选择：{{ selectedDateLabel }}</p>
  </div>
</template>
