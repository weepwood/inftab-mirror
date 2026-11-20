<script setup lang="ts">
import SelectField from './SelectField.vue'
import { computed, nextTick, ref } from 'vue'
import { NotebookPen, Plus, Search, Trash2 } from '@lucide/vue'
import { truncateCodePoints } from '../data/text'
import type { Note } from '../types'

const props = defineProps<{ notes: Note[]; activeId: string }>()
const emit = defineEmits<{
  add: []
  select: [id: string]
  update: [id: string, field: 'title' | 'body', value: string]
  remove: [id: string]
}>()
const query = ref('')
const sort = ref('original')
const titleInput = ref<HTMLInputElement>()
const activeNote = computed(() => props.notes.find((note) => note.id === props.activeId) ?? props.notes[0])
const visibleNotes = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const matches = props.notes.filter((note) => note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle))
  if (sort.value === 'updated') matches.sort((a, b) => b.updatedAt - a.updatedAt)
  if (sort.value === 'title') matches.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  return matches
})
const characterCount = computed(() => Array.from(activeNote.value?.body ?? '').length)

async function createNote() {
  if (props.notes.length >= 500) return
  const previousId = activeNote.value?.id
  query.value = ''
  emit('add')
  await nextTick()
  if (activeNote.value?.id !== previousId) {
    titleInput.value?.focus()
    titleInput.value?.select()
  }
}

function clearSearch(event: KeyboardEvent) {
  if (!query.value) return
  query.value = ''
  event.stopPropagation()
}
</script>

<template>
  <div class="notes-layout">
    <aside class="notes-list">
      <div class="notes-tools">
        <button class="note-add" type="button" :disabled="notes.length >= 500" @click="createNote"><Plus :size="16" /> 新建笔记</button>
        <label class="collection-search"><Search :size="14" aria-hidden="true" /><input v-model="query" type="search" maxlength="500" placeholder="搜索标题或正文…" aria-label="查找笔记" @keydown.esc="clearSearch" /></label>
        <SelectField v-model="sort" class="notes-sort" aria-label="笔记排序"><option value="original">默认顺序</option><option value="updated">最近编辑</option><option value="title">按标题排序</option></SelectField>
        <p v-if="query.trim()" class="notes-result-count" role="status">找到 {{ visibleNotes.length }} / {{ notes.length }} 条笔记</p>
      </div>
      <button
        v-for="note in visibleNotes"
        :key="note.id"
        type="button"
        class="note-list-item"
        :class="{ active: activeNote?.id === note.id }"
        :aria-current="activeNote?.id === note.id ? 'true' : undefined"
        @click="emit('select', note.id)"
      >
        <strong>{{ note.title || '未命名笔记' }}</strong>
        <span>{{ truncateCodePoints(note.body, 140) || '空白笔记' }}</span>
      </button>
      <div v-if="!notes.length" class="notes-empty">新建一条笔记开始记录</div>
      <div v-else-if="!visibleNotes.length" class="collection-empty"><p>没有匹配的笔记</p><button class="text-button" type="button" @click="query = ''">清除搜索</button></div>
      <div v-if="notes.length >= 500" class="notes-empty" role="status">已达到 500 条笔记上限</div>
    </aside>
    <section v-if="activeNote" class="note-editor">
      <input ref="titleInput" :value="activeNote.title" class="note-title" aria-label="笔记标题" maxlength="500" placeholder="笔记标题" @input="emit('update', activeNote.id, 'title', ($event.target as HTMLInputElement).value)" />
      <textarea :value="activeNote.body" aria-label="笔记内容" maxlength="500000" placeholder="从这里开始记录……" @input="emit('update', activeNote.id, 'body', ($event.target as HTMLTextAreaElement).value)"></textarea>
      <footer class="note-editor-footer"><span class="note-meta">{{ characterCount }} 字符 · 本机自动保存</span><button class="note-delete" type="button" aria-label="删除笔记" @click="emit('remove', activeNote.id)"><Trash2 :size="15" /> 删除</button></footer>
    </section>
    <section v-else class="note-blank"><NotebookPen :size="32" :stroke-width="1.5" aria-hidden="true" /><p>选择或新建一条笔记</p></section>
  </div>
</template>
