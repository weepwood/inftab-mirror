<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowUp, GripVertical, X } from '@lucide/vue'
import { homeWidgetPlugins, type HomeWidgetContext } from '../plugins/widgetRegistry'
import type { PanelId } from '../plugins/registry'
import type { HomeWidgetId } from '../types'

const props = defineProps<{ widgetIds: HomeWidgetId[]; context: HomeWidgetContext }>()
const emit = defineEmits<{
  open: [panel: PanelId]
  remove: [id: HomeWidgetId]
  reorder: [from: number, to: number]
}>()
const draggingIndex = ref<number | null>(null)
const moveAnnouncement = ref('')

function reorderWidget(from: number, to: number) {
  const id = props.widgetIds[from]
  if (!id || to < 0 || to >= props.widgetIds.length || from === to) return
  emit('reorder', from, to)
  moveAnnouncement.value = `${homeWidgetPlugins[id].title}已移到第${to + 1}个位置。`
}

function startDrag(event: DragEvent, index: number) {
  draggingIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function dropWidget(event: DragEvent, targetIndex: number) {
  event.preventDefault()
  const transferIndex = event.dataTransfer?.getData('text/plain') ?? ''
  const sourceIndex = draggingIndex.value ?? (transferIndex ? Number(transferIndex) : Number.NaN)
  if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < props.widgetIds.length) reorderWidget(sourceIndex, targetIndex)
  draggingIndex.value = null
}

function moveWidget(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex >= 0 && targetIndex < props.widgetIds.length) reorderWidget(index, targetIndex)
}
</script>

<template>
  <section class="home-widget-shelf" aria-label="首页小组件">
    <span class="visually-hidden" role="status" aria-live="polite">{{ moveAnnouncement }}</span>
    <article
      v-for="(id, index) in widgetIds"
      :key="id"
      class="home-widget-card"
      :data-widget-id="id"
      :class="{ dragging: draggingIndex === index }"
      @dragover.prevent
      @drop="dropWidget($event, index)"
      @dragend="draggingIndex = null"
    >
      <header class="home-widget-header" draggable="true" @dragstart="startDrag($event, index)">
        <GripVertical :size="15" aria-hidden="true" class="home-widget-grip" />
        <button class="home-widget-title" type="button" :aria-label="`打开${homeWidgetPlugins[id].title}`" @click="emit('open', homeWidgetPlugins[id].panel)">
          {{ homeWidgetPlugins[id].title }}
        </button>
        <button class="home-widget-order" type="button" :disabled="index === 0" :aria-label="`将${homeWidgetPlugins[id].title}上移`" @click="moveWidget(index, -1)"><ArrowUp :size="14" /></button>
        <button class="home-widget-order" type="button" :disabled="index === widgetIds.length - 1" :aria-label="`将${homeWidgetPlugins[id].title}下移`" @click="moveWidget(index, 1)"><ArrowDown :size="14" /></button>
        <button class="home-widget-remove" type="button" :aria-label="`移除${homeWidgetPlugins[id].title}`" @click="emit('remove', id)"><X :size="15" /></button>
      </header>
      <component :is="homeWidgetPlugins[id].component" v-bind="homeWidgetPlugins[id].props(context)" />
    </article>
  </section>
</template>
