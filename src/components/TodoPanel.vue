<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Pencil, Plus, Trash2 } from '@lucide/vue'
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
const editingId = ref('')
const editingTitle = ref('')
const completedCount = computed(() => props.items.filter((item) => item.done).length)

function submit() {
  const title = draft.value.trim()
  if (!title) return
  emit('add', title)
  draft.value = ''
}

function beginEdit(item: TodoItem) {
  editingId.value = item.id
  editingTitle.value = item.title
}

function saveEdit() {
  const title = editingTitle.value.trim()
  if (title) emit('update', editingId.value, title)
  editingId.value = ''
}
</script>

<template>
  <div class="todo-content">
    <form class="inline-add" @submit.prevent="submit">
      <input v-model="draft" maxlength="500" :disabled="items.length >= 500" :placeholder="items.length >= 500 ? '已达到 500 项上限' : '添加一项待办'" aria-label="添加一项待办" />
      <button type="submit" aria-label="添加" :disabled="items.length >= 500"><Plus :size="19" /></button>
    </form>
    <ul v-if="items.length" class="todo-list">
      <li v-for="item in items" :key="item.id" :class="{ done: item.done }">
        <button class="todo-check" type="button" :aria-label="item.done ? '标记为未完成' : '标记为完成'" @click="emit('toggle', item.id)"><Check :size="14" /></button>
        <form v-if="editingId === item.id" class="todo-edit-form" @submit.prevent="saveEdit">
          <input v-model="editingTitle" maxlength="500" aria-label="编辑待办" autofocus @keydown.esc.stop="editingId = ''" />
          <button type="submit" aria-label="保存待办"><Check :size="14" /></button>
        </form>
        <span v-else>{{ item.title }}</span>
        <button v-if="editingId !== item.id" class="icon-action" type="button" aria-label="编辑待办" @click="beginEdit(item)"><Pencil :size="14" /></button>
        <button class="icon-action" type="button" aria-label="删除待办" @click="emit('remove', item.id)"><Trash2 :size="15" /></button>
      </li>
    </ul>
    <div v-else class="empty-state"><span>☀</span><p>还没有待办事项</p><small>把接下来要做的事记在这里</small></div>
    <div v-if="items.length" class="todo-footer">
      <p class="panel-footnote">{{ items.length - completedCount }} 项待完成</p>
      <p v-if="items.length >= 500" class="panel-footnote" role="status">已达到 500 项上限</p>
      <button v-if="completedCount" class="text-button" type="button" @click="emit('clearCompleted')">清除已完成（{{ completedCount }}）</button>
    </div>
  </div>
</template>
