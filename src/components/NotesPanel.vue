<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import type { Note } from '../types'

const props = defineProps<{ notes: Note[]; activeId: string }>()
const emit = defineEmits<{
  add: []
  select: [id: string]
  update: [id: string, field: 'title' | 'body', value: string]
  remove: [id: string]
}>()
const activeNote = computed(() => props.notes.find((note) => note.id === props.activeId) ?? props.notes[0])
</script>

<template>
  <div class="notes-layout">
    <aside class="notes-list">
      <button class="note-add" type="button" @click="emit('add')"><Plus :size="16" /> 新建笔记</button>
      <button
        v-for="note in notes"
        :key="note.id"
        type="button"
        class="note-list-item"
        :class="{ active: activeNote?.id === note.id }"
        @click="emit('select', note.id)"
      >
        <strong>{{ note.title || '未命名笔记' }}</strong>
        <span>{{ note.body || '空白笔记' }}</span>
      </button>
      <div v-if="!notes.length" class="notes-empty">新建一条笔记开始记录</div>
    </aside>
    <section v-if="activeNote" class="note-editor">
      <input :value="activeNote.title" class="note-title" placeholder="笔记标题" @input="emit('update', activeNote.id, 'title', ($event.target as HTMLInputElement).value)" />
      <textarea :value="activeNote.body" placeholder="从这里开始记录……" @input="emit('update', activeNote.id, 'body', ($event.target as HTMLTextAreaElement).value)"></textarea>
      <button class="note-delete" type="button" aria-label="删除笔记" @click="emit('remove', activeNote.id)"><Trash2 :size="15" /> 删除</button>
    </section>
    <section v-else class="note-blank"><span>▮</span><p>选择或新建一条笔记</p></section>
  </div>
</template>
