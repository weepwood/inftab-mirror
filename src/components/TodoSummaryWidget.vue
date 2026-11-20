<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Plus } from '@lucide/vue'
import type { TodoItem } from '../types'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{ add: [title: string]; toggle: [id: string] }>()
const draft = ref('')
const draftInput = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const undoButton = ref<HTMLButtonElement>()
const lastCompletedId = ref('')
const announcement = ref('')
const openItems = computed(() => props.items.filter((item) => !item.done))
const previewItems = computed(() => openItems.value.slice(0, 2))
const canUndo = computed(() => props.items.some((item) => item.id === lastCompletedId.value && item.done))
watch(canUndo, (available) => { if (!available) lastCompletedId.value = '' })
const composing = ref(false)
let ignoreSubmit = false
let compositionTimer: number | undefined

function guardComposition(event: KeyboardEvent) {
  if (event.key !== 'Enter' || !(composing.value || event.isComposing || event.keyCode === 229)) return
  ignoreSubmit = true
  if (compositionTimer !== undefined) window.clearTimeout(compositionTimer)
  compositionTimer = window.setTimeout(() => { ignoreSubmit = false }, 0)
}

async function add() {
  const title = draft.value.trim()
  if (composing.value || ignoreSubmit || !title || props.items.length >= 500) return
  emit('add', title)
  draft.value = ''
  announcement.value = `已添加待办：${title}`
  await nextTick()
  draftInput.value?.focus()
}

async function complete(item: TodoItem, index: number) {
  lastCompletedId.value = item.id
  emit('toggle', item.id)
  announcement.value = `已完成：${item.title}，可撤销。`
  await nextTick()
  const checks = list.value?.querySelectorAll<HTMLInputElement>('input')
  const target = checks?.[Math.min(index, checks.length - 1)] ?? undoButton.value
  target?.focus()
}

async function undo() {
  if (!canUndo.value) return
  const id = lastCompletedId.value
  emit('toggle', id)
  lastCompletedId.value = ''
  announcement.value = '已恢复为待完成。'
  await nextTick()
  const check = [...(list.value?.querySelectorAll<HTMLInputElement>('input') ?? [])].find((element) => element.dataset.todoId === id)
  const target = check ?? draftInput.value
  target?.focus()
}

onBeforeUnmount(() => { if (compositionTimer !== undefined) window.clearTimeout(compositionTimer) })
</script>

<template>
  <div class="home-widget-summary widget-todo" aria-label="待办预览">
    <p class="home-widget-metric">{{ openItems.length ? `还有 ${openItems.length} 项待完成` : items.length ? '今天的待办都完成了' : '今天没有待办' }}</p>
    <ul v-if="previewItems.length" ref="list" class="widget-todo-list">
      <li v-for="(item, index) in previewItems" :key="item.id">
        <label><input type="checkbox" :data-todo-id="item.id" :aria-label="`完成待办：${item.title}`" :checked="false" @change="complete(item, index)" /><span :title="item.title">{{ item.title }}</span></label>
      </li>
    </ul>
    <p v-else class="home-widget-empty">{{ items.length ? '留一点时间给自己，也可以继续添加。' : '添加一项任务，开始安排今天。' }}</p>
    <p v-if="canUndo" class="widget-todo-undo"><span>已完成一项待办</span><button ref="undoButton" type="button" @click="undo">撤销</button></p>
    <form class="widget-todo-add" @submit.prevent="add" @keydown="guardComposition">
      <input ref="draftInput" v-model="draft" maxlength="500" :disabled="items.length >= 500" :placeholder="items.length >= 500 ? '已达到 500 项上限' : '记下一件要做的事…'" aria-label="快速添加待办" @compositionstart="composing = true" @compositionend="composing = false" />
      <button type="submit" aria-label="添加待办" :disabled="items.length >= 500 || !draft.trim()"><Plus :size="16" aria-hidden="true" /></button>
    </form>
    <span class="visually-hidden" role="status">{{ announcement }}</span>
  </div>
</template>
