<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Pencil, Plus, Search, Trash2 } from '@lucide/vue'
import type { TodoItem } from '../types'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{
  add: [title: string]
  toggle: [id: string]
  update: [id: string, title: string]
  remove: [id: string]
  clearCompleted: []
}>()
const draft = ref('')
const query = ref('')
const filter = ref<'all' | 'open' | 'done'>('all')
const filters = [{ id: 'all', label: '全部' }, { id: 'open', label: '待完成' }, { id: 'done', label: '已完成' }] as const
const draftInput = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const editingId = ref('')
const editingTitle = ref('')
const completedCount = computed(() => props.items.filter((item) => item.done).length)
const counts = computed(() => ({ all: props.items.length, open: props.items.length - completedCount.value, done: completedCount.value }))
const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.items.filter((item) => (filter.value === 'all' || item.done === (filter.value === 'done')) && item.title.toLowerCase().includes(needle))
})
watch([query, filter], () => { editingId.value = '' })

async function submit() {
  const title = draft.value.trim()
  if (!title || props.items.length >= 500) return
  query.value = ''
  if (filter.value === 'done') filter.value = 'open'
  emit('add', title)
  draft.value = ''
  await nextTick()
  draftInput.value?.focus()
}

async function beginEdit(item: TodoItem) {
  editingId.value = item.id
  editingTitle.value = item.title
  await nextTick()
  const input = list.value?.querySelector<HTMLInputElement>('input')
  input?.focus()
  input?.select()
}

async function toggleItem(id: string, event: MouseEvent) {
  const hadFocus = event.currentTarget === document.activeElement
  const index = filteredItems.value.findIndex((item) => item.id === id)
  emit('toggle', id)
  await nextTick()
  if (!hadFocus || filteredItems.value.some((item) => item.id === id)) return
  const checks = list.value?.querySelectorAll<HTMLButtonElement>('.todo-check')
  const target = checks?.[Math.min(index, checks.length - 1)] ?? draftInput.value
  target?.focus()
}

async function finishEdit(save = false) {
  const id = editingId.value
  const title = editingTitle.value.trim()
  if (save && title) emit('update', id, title)
  editingId.value = ''
  await nextTick()
  const row = [...(list.value?.querySelectorAll<HTMLElement>('[data-todo-id]') ?? [])].find((element) => element.dataset.todoId === id)
  const target = row?.querySelector<HTMLButtonElement>('.todo-edit-trigger') ?? draftInput.value
  target?.focus()
}

function clearSearch(event: KeyboardEvent) {
  if (!query.value) return
  query.value = ''
  event.stopPropagation()
}
</script>

<template>
  <div class="todo-content">
    <form class="inline-add" @submit.prevent="submit">
      <input ref="draftInput" v-model="draft" maxlength="500" :disabled="items.length >= 500" :placeholder="items.length >= 500 ? '已达到 500 项上限' : '添加一项待办'" aria-label="添加一项待办" />
      <button type="submit" aria-label="添加" :disabled="items.length >= 500 || !draft.trim()"><Plus :size="19" /></button>
    </form>
    <div v-if="items.length" class="collection-tools">
      <div class="collection-filters" role="group" aria-label="待办状态">
        <button v-for="option in filters" :key="option.id" type="button" :aria-pressed="filter === option.id" @click="filter = option.id">{{ option.label }}<span>{{ counts[option.id] }}</span></button>
      </div>
      <label class="collection-search"><Search :size="15" aria-hidden="true" /><input v-model="query" type="search" maxlength="500" placeholder="查找待办…" aria-label="查找待办" @keydown.esc="clearSearch" /></label>
    </div>
    <ul v-if="filteredItems.length" ref="list" class="todo-list">
      <li v-for="item in filteredItems" :key="item.id" :data-todo-id="item.id" :class="{ done: item.done }">
        <button class="todo-check" type="button" :aria-label="item.done ? '标记为未完成' : '标记为完成'" :aria-pressed="item.done" @click="toggleItem(item.id, $event)"><Check :size="14" /></button>
        <form v-if="editingId === item.id" class="todo-edit-form" @submit.prevent="finishEdit(true)">
          <input v-model="editingTitle" maxlength="500" aria-label="编辑待办" @keydown.esc.stop="finishEdit()" />
          <button type="submit" aria-label="保存待办"><Check :size="14" /></button>
        </form>
        <span v-else>{{ item.title }}</span>
        <button v-if="editingId !== item.id" class="icon-action todo-edit-trigger" type="button" aria-label="编辑待办" @click="beginEdit(item)"><Pencil :size="14" /></button>
        <button class="icon-action" type="button" aria-label="删除待办" @click="emit('remove', item.id)"><Trash2 :size="15" /></button>
      </li>
    </ul>
    <div v-else-if="items.length" class="collection-empty"><p>没有符合条件的待办</p><button class="text-button" type="button" @click="query = ''; filter = 'all'">重置筛选</button></div>
    <div v-else class="empty-state"><span>☀</span><p>还没有待办事项</p><small>把接下来要做的事记在这里</small></div>
    <div v-if="items.length" class="todo-footer">
      <p class="panel-footnote">{{ counts.open }} 项待完成<span v-if="query.trim() || filter !== 'all'"> · 显示 {{ filteredItems.length }} 项</span></p>
      <p v-if="items.length >= 500" class="panel-footnote" role="status">已达到 500 项上限</p>
      <button v-if="completedCount" class="text-button" type="button" @click="emit('clearCompleted')">清除已完成（{{ completedCount }}）</button>
    </div>
  </div>
</template>
