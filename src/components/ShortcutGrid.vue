<script setup lang="ts">
import { computed } from 'vue'
import { CloudSun, Image, ListTodo, Pencil, Settings, StickyNote, Trash2 } from '@lucide/vue'
import type { Component } from 'vue'
import type { LauncherItem } from '../types'

const props = defineProps<{
  items: LauncherItem[]
  columns: number
  iconSize: number
  iconRadius: number
  showNames: boolean
  currentPage: number
}>()

const emit = defineEmits<{
  open: [item: LauncherItem]
  edit: [item: LauncherItem]
  remove: [item: LauncherItem]
  reorder: [sourceId: string, targetId: string]
}>()

const itemIcons: Record<string, Component> = {
  weather: CloudSun,
  todos: ListTodo,
  notes: StickyNote,
  settings: Settings,
  wallpaper: Image,
}

const pageSize = computed(() => props.columns * 3)
const visibleItems = computed(() => props.items.slice(props.currentPage * pageSize.value, (props.currentPage + 1) * pageSize.value))

function dropOn(event: DragEvent, item: LauncherItem) {
  const sourceId = event.dataTransfer?.getData('text/plain')
  if (sourceId && item.shortcut && sourceId !== item.shortcut.id) emit('reorder', sourceId, item.shortcut.id)
}
</script>

<template>
  <div class="shortcut-grid-wrap">
    <div
      class="shortcut-grid"
      :style="{ '--grid-columns': columns, '--shortcut-size': `${iconSize}px`, '--shortcut-radius': `${iconRadius}px` }"
    >
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="shortcut-cell"
        :draggable="Boolean(item.shortcut)"
        @dragstart="item.shortcut && $event.dataTransfer?.setData('text/plain', item.shortcut.id)"
        @dragover.prevent
        @drop="dropOn($event, item)"
      >
        <button class="shortcut-open" type="button" :aria-label="`打开${item.title}`" @click="emit('open', item)">
          <span class="shortcut-icon" :class="{ builtin: item.action }" :style="{ backgroundColor: item.color }">
            <component v-if="item.action" :is="itemIcons[item.action]" :size="35" :stroke-width="2.6" />
            <span v-else class="shortcut-mark">{{ item.mark }}</span>
            <span v-if="item.badge" class="shortcut-badge">{{ item.badge }}</span>
          </span>
          <span v-if="showNames" class="shortcut-name">{{ item.title }}</span>
        </button>
        <div v-if="item.shortcut" class="shortcut-tools">
          <button type="button" :aria-label="`编辑${item.title}`" @click="emit('edit', item)"><Pencil :size="13" /></button>
          <button type="button" :aria-label="`删除${item.title}`" @click="emit('remove', item)"><Trash2 :size="13" /></button>
        </div>
      </article>
    </div>
  </div>
</template>
