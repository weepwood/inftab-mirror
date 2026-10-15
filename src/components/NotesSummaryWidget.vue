<script setup lang="ts">
import { computed } from 'vue'
import type { Note } from '../types'
import { truncateCodePoints } from '../data/text'

const props = defineProps<{ notes: Note[]; activeId: string }>()
const note = computed(() => props.notes.find((item) => item.id === props.activeId) ?? props.notes[0])
const preview = computed(() => note.value ? truncateCodePoints(note.value.body.trim().replace(/\s+/g, ' '), 100) : '')
</script>

<template>
  <div class="home-widget-summary" aria-label="笔记预览">
    <template v-if="note">
      <p class="home-widget-metric">{{ note.title || '未命名笔记' }}</p>
      <p class="home-widget-highlight">{{ preview || '这条笔记还没有内容。' }}</p>
    </template>
    <p v-else class="home-widget-empty">新建一条笔记，随手记下重要内容。</p>
  </div>
</template>
