<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, CheckCircle2, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { getLocalDateKey, isHabitCompleteOn, maxHabits, maxHabitTitleLength } from '../data/habits'
import { truncateCodePoints } from '../data/text'
import type { Habit } from '../types'

const props = defineProps<{ items: Habit[] }>()
const emit = defineEmits<{
  add: [title: string]
  update: [id: string, title: string]
  toggleToday: [id: string]
  remove: [id: string]
}>()
const today = ref(getLocalDateKey())
const draft = ref('')
const editingId = ref('')
const editingTitle = ref('')
const completedCount = computed(() => props.items.filter((habit) => isHabitCompleteOn(habit, today.value)).length)
const limitReached = computed(() => props.items.length >= maxHabits && !editingId.value)
let refreshTimer: number | undefined

function resetForm() {
  draft.value = ''
  editingId.value = ''
  editingTitle.value = ''
}

function submit() {
  const title = truncateCodePoints((editingId.value ? editingTitle.value : draft.value).trim(), maxHabitTitleLength)
  if (!title) return
  if (editingId.value) emit('update', editingId.value, title)
  else emit('add', title)
  resetForm()
}

function beginEdit(habit: Habit) {
  editingId.value = habit.id
  editingTitle.value = habit.title
}

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
  <div class="todo-content habits-content">
    <form v-if="!editingId" class="inline-add" @submit.prevent="submit">
      <input v-model="draft" maxlength="80" :disabled="limitReached" :placeholder="limitReached ? '已达到 100 个习惯上限' : '添加一个想坚持的习惯'" aria-label="添加一个习惯" />
      <button type="submit" aria-label="添加习惯" :disabled="limitReached"><Plus :size="19" /></button>
    </form>
    <form v-else class="inline-add" @submit.prevent="submit">
      <input v-model="editingTitle" maxlength="80" aria-label="编辑习惯名称" />
      <button type="submit" aria-label="保存习惯"><Check :size="19" /></button>
      <button type="button" aria-label="取消编辑习惯" @click="resetForm"><X :size="18" /></button>
    </form>

    <p class="panel-footnote habits-progress" role="status">今天完成 {{ completedCount }} / {{ items.length }} 个习惯</p>
    <p v-if="limitReached" class="panel-footnote" role="status">已达到 100 个习惯上限；删除一个后即可添加。</p>

    <ul v-if="items.length" class="todo-list habits-list">
      <li v-for="habit in items" :key="habit.id" :class="{ done: isHabitCompleteOn(habit, today) }">
        <button
          class="todo-check"
          type="button"
          :aria-label="isHabitCompleteOn(habit, today) ? `取消${habit.title}今日打卡` : `完成${habit.title}今日打卡`"
          :aria-pressed="isHabitCompleteOn(habit, today)"
          @click="emit('toggleToday', habit.id)"
        ><CheckCircle2 :size="16" /></button>
        <span>{{ habit.title }}</span>
        <button class="icon-action" type="button" :aria-label="`编辑${habit.title}`" @click="beginEdit(habit)"><Pencil :size="14" /></button>
        <button class="icon-action" type="button" :aria-label="`删除${habit.title}`" @click="emit('remove', habit.id)"><Trash2 :size="15" /></button>
      </li>
    </ul>
    <div v-else class="empty-state"><CheckCircle2 :size="26" /><p>还没有习惯</p><small>从一个容易坚持的小目标开始</small></div>
  </div>
</template>
