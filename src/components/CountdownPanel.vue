<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarDays, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { daysUntilCountdown, formatCountdown, isValidCalendarDate } from '../data/countdown'
import type { CountdownItem, CountdownRecurrence } from '../types'

const props = defineProps<{ items: CountdownItem[] }>()
const emit = defineEmits<{
  add: [title: string, date: string, recurrence: CountdownRecurrence]
  update: [id: string, title: string, date: string, recurrence: CountdownRecurrence]
  remove: [id: string]
}>()

const title = ref('')
const date = ref('')
const recurrence = ref<CountdownRecurrence>('once')
const editingId = ref('')
const today = ref(new Date())
const limitReached = computed(() => props.items.length >= 500 && !editingId.value)
const orderedItems = computed(() => [...props.items].sort((left, right) => {
  const leftDays = daysUntilCountdown(left, today.value)
  const rightDays = daysUntilCountdown(right, today.value)
  if (leftDays < 0 && rightDays >= 0) return 1
  if (leftDays >= 0 && rightDays < 0) return -1
  return leftDays - rightDays
}))
let dateRefreshTimer: ReturnType<typeof setInterval> | undefined

function refreshToday() {
  today.value = new Date()
}

onMounted(() => {
  dateRefreshTimer = setInterval(refreshToday, 60_000)
  window.addEventListener('focus', refreshToday)
})
onBeforeUnmount(() => {
  if (dateRefreshTimer) clearInterval(dateRefreshTimer)
  window.removeEventListener('focus', refreshToday)
})

function resetForm() {
  title.value = ''
  date.value = ''
  recurrence.value = 'once'
  editingId.value = ''
}

function submit() {
  const cleanTitle = title.value.trim()
  if (!cleanTitle || !isValidCalendarDate(date.value)) return
  if (editingId.value) emit('update', editingId.value, cleanTitle, date.value, recurrence.value)
  else emit('add', cleanTitle, date.value, recurrence.value)
  resetForm()
}

function beginEdit(item: CountdownItem) {
  editingId.value = item.id
  title.value = item.title
  date.value = item.date
  recurrence.value = item.recurrence
}

function remove(item: CountdownItem) {
  if (editingId.value === item.id) resetForm()
  emit('remove', item.id)
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}
</script>

<template>
  <div class="countdown-content">
    <form class="countdown-form" @submit.prevent="submit">
      <label>名称
        <input v-model="title" maxlength="80" required :disabled="limitReached" aria-label="纪念日名称" placeholder="例如：生日、旅行" />
      </label>
      <label>日期
        <input v-model="date" type="date" required :disabled="limitReached" aria-label="纪念日日期" />
      </label>
      <label>重复
        <select v-model="recurrence" :disabled="limitReached" aria-label="重复频率">
          <option value="once">仅一次</option>
          <option value="yearly">每年重复</option>
        </select>
      </label>
      <div class="countdown-form-actions">
        <button v-if="editingId" class="button-secondary" type="button" @click="resetForm"><X :size="15" /> 取消</button>
        <button class="button-primary" type="submit" :disabled="limitReached"><component :is="editingId ? CalendarDays : Plus" :size="16" />{{ editingId ? '保存修改' : '添加纪念日' }}</button>
      </div>
    </form>
    <p v-if="limitReached" class="panel-footnote" role="status">已达到 500 条纪念日上限；删除一条后即可添加。</p>

    <ul v-if="orderedItems.length" class="countdown-list">
      <li v-for="item in orderedItems" :key="item.id" class="countdown-item">
        <span class="countdown-icon"><CalendarDays :size="17" /></span>
        <div class="countdown-copy">
          <strong>{{ item.title }}</strong>
          <small>{{ displayDate(item.date) }} · {{ item.recurrence === 'yearly' ? '每年重复' : '仅一次' }}</small>
        </div>
        <span class="countdown-remaining" :class="{ elapsed: item.recurrence === 'once' && daysUntilCountdown(item, today) < 0 }">{{ formatCountdown(item, today) }}</span>
        <button class="icon-action" type="button" :aria-label="`编辑${item.title}`" @click="beginEdit(item)"><Pencil :size="14" /></button>
        <button class="icon-action" type="button" :aria-label="`删除${item.title}`" @click="remove(item)"><Trash2 :size="14" /></button>
      </li>
    </ul>
    <div v-else class="empty-state countdown-empty"><CalendarDays :size="27" /><p>还没有纪念日</p><small>添加生日、旅行或重要日期</small></div>
  </div>
</template>
