<script setup lang="ts">
import { ref } from 'vue'
import { Check, Plus, Trash2 } from '@lucide/vue'
import type { TodoItem } from '../types'

defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{
  add: [title: string]
  toggle: [id: string]
  remove: [id: string]
}>()
const draft = ref('')

function submit() {
  const title = draft.value.trim()
  if (!title) return
  emit('add', title)
  draft.value = ''
}
</script>

<template>
  <div class="todo-content">
    <form class="inline-add" @submit.prevent="submit">
      <input v-model="draft" placeholder="添加一项待办" aria-label="添加一项待办" />
      <button type="submit" aria-label="添加"><Plus :size="19" /></button>
    </form>
    <ul v-if="items.length" class="todo-list">
      <li v-for="item in items" :key="item.id" :class="{ done: item.done }">
        <button class="todo-check" type="button" :aria-label="item.done ? '标记为未完成' : '标记为完成'" @click="emit('toggle', item.id)"><Check :size="14" /></button>
        <span>{{ item.title }}</span>
        <button class="icon-action" type="button" aria-label="删除待办" @click="emit('remove', item.id)"><Trash2 :size="15" /></button>
      </li>
    </ul>
    <div v-else class="empty-state"><span>☀</span><p>还没有待办事项</p><small>把接下来要做的事记在这里</small></div>
    <p v-if="items.length" class="panel-footnote">{{ items.filter((item) => !item.done).length }} 项待完成</p>
  </div>
</template>
