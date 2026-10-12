<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowUp, GripVertical, X } from '@lucide/vue'
import { homeWidgetPlugins, type HomeWidgetContext, type HomeWidgetPluginRegistry } from '../plugins/widgetRegistry'
import type { PanelId } from '../plugins/registry'
import type { HomeWidgetId, HomeWidgetSize } from '../types'

const props = withDefaults(defineProps<{
  widgetIds: HomeWidgetId[]
  widgetSizes: Record<HomeWidgetId, HomeWidgetSize>
  context: HomeWidgetContext
  plugins?: HomeWidgetPluginRegistry
}>(), { plugins: () => homeWidgetPlugins })
const emit = defineEmits<{
  open: [panel: PanelId]
  remove: [id: HomeWidgetId]
  reorder: [from: number, to: number]
  resize: [id: HomeWidgetId, size: HomeWidgetSize]
}>()
const draggingIndex = ref<number | null>(null)
const moveAnnouncement = ref('')

function reorderWidget(from: number, to: number) {
  const id = props.widgetIds[from]
  if (!id || to < 0 || to >= props.widgetIds.length || from === to) return
  emit('reorder', from, to)
  moveAnnouncement.value = `${props.plugins[id].title}已移到第${to + 1}个位置。`
}

function openWidget(id: HomeWidgetId) {
  const panel = props.plugins[id].panel
  if (panel) emit('open', panel)
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
      :class="{ dragging: draggingIndex === index, 'home-widget-card-wide': widgetSizes[id] === 'wide' }"
      @dragover.prevent
      @drop="dropWidget($event, index)"
      @dragend="draggingIndex = null"
    >
      <header class="home-widget-header">
        <button class="home-widget-grip" type="button" draggable="true" :aria-label="`拖动${props.plugins[id].title}排序`" @dragstart="startDrag($event, index)">
          <GripVertical :size="15" aria-hidden="true" />
        </button>
        <button v-if="props.plugins[id].panel" class="home-widget-title" type="button" :aria-label="`打开${props.plugins[id].title}`" @click="openWidget(id)">
          {{ props.plugins[id].title }}
        </button>
        <span v-else class="home-widget-title home-widget-title-static">{{ props.plugins[id].title }}</span>
        <button class="home-widget-order" type="button" :disabled="index === 0" :aria-label="`将${props.plugins[id].title}上移`" @click="moveWidget(index, -1)"><ArrowUp :size="14" /></button>
        <button class="home-widget-order" type="button" :disabled="index === widgetIds.length - 1" :aria-label="`将${props.plugins[id].title}下移`" @click="moveWidget(index, 1)"><ArrowDown :size="14" /></button>
        <button class="home-widget-size" type="button" :aria-label="widgetSizes[id] === 'wide' ? `将${props.plugins[id].title}恢复标准宽度` : `将${props.plugins[id].title}加宽`" @click="emit('resize', id, widgetSizes[id] === 'wide' ? 'standard' : 'wide')">{{ widgetSizes[id] === 'wide' ? '标准' : '加宽' }}</button>
        <button class="home-widget-remove" type="button" :aria-label="`移除${props.plugins[id].title}`" @click="emit('remove', id)"><X :size="15" /></button>
      </header>
      <component :is="props.plugins[id].component" v-bind="props.plugins[id].props(context)" />
    </article>
  </section>
</template>
