<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
  swipe: [direction: number]
}>()

const itemIcons: Record<string, Component> = {
  weather: CloudSun,
  todos: ListTodo,
  notes: StickyNote,
  settings: Settings,
  wallpaper: Image,
}

const pageSize = computed(() => props.columns * 3)
const pages = computed(() => {
  const result: LauncherItem[][] = []
  for (let index = 0; index < props.items.length; index += pageSize.value) {
    result.push(props.items.slice(index, index + pageSize.value))
  }
  return result
})
const contextItem = ref<LauncherItem>()
const contextPosition = ref({ left: 0, top: 0 })
const draggingId = ref('')
const dragPosition = ref({ x: 0, y: 0 })
const draggedItem = computed(() => props.items.find((item) => item.id === draggingId.value))
const gridViewport = ref<HTMLElement>()
let pointer: { id: number; type: string; x: number; y: number; clientX: number; clientY: number; sourceId: string; targetId: string; dragging: boolean; hold?: number } | undefined
let suppressClick = false
let edgeTimer: number | undefined
let edgeDirection = 0
let lastEdgeDirection = 0

function startDrag() {
  if (!pointer || pointer.dragging) return
  pointer.dragging = true
  draggingId.value = pointer.sourceId
  dragPosition.value = { x: pointer.clientX, y: pointer.clientY }
}

function onPointerDown(event: PointerEvent, item: LauncherItem) {
  if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.shortcut-context-menu'))) return
  pointer = { id: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY, sourceId: item.id, targetId: item.id, dragging: false }
  if (event.pointerType === 'touch') {
    pointer.hold = window.setTimeout(startDrag, 360)
  }
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', cancelPointer)
}

function onPointerMove(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return
  pointer.clientX = event.clientX
  pointer.clientY = event.clientY
  const deltaX = event.clientX - pointer.x
  const deltaY = event.clientY - pointer.y
  if (pointer.type === 'touch' && !pointer.dragging) {
    if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (pointer.hold) window.clearTimeout(pointer.hold)
      pointer.hold = undefined
      return
    }
    if (Math.abs(deltaX) + Math.abs(deltaY) > 10) {
      if (pointer.hold) window.clearTimeout(pointer.hold)
      pointer.hold = undefined
      startDrag()
    }
  } else if (!pointer.dragging && Math.hypot(deltaX, deltaY) > 7) {
    startDrag()
  }
  if (!pointer.dragging) return
  event.preventDefault()
  dragPosition.value = { x: event.clientX, y: event.clientY }
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-item-id]')
  if (target?.dataset.itemId) pointer.targetId = target.dataset.itemId
  scheduleEdgePageTurn(event.clientX)
}

function scheduleEdgePageTurn(clientX: number) {
  const bounds = gridViewport.value?.getBoundingClientRect()
  if (!bounds) return
  const direction = clientX < bounds.left + 26 && props.currentPage > 0
    ? -1
    : clientX > bounds.right - 26 && props.currentPage < pages.value.length - 1 ? 1 : 0
  if (direction !== edgeDirection) {
    if (edgeTimer) window.clearTimeout(edgeTimer)
    edgeTimer = undefined
    edgeDirection = direction
  }
  if (!direction) {
    lastEdgeDirection = 0
    return
  }
  if (!edgeTimer && lastEdgeDirection !== direction) {
    edgeTimer = window.setTimeout(() => {
      emit('swipe', direction)
      lastEdgeDirection = direction
      edgeTimer = undefined
    }, 480)
  }
}

function cleanPointer() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', cancelPointer)
  if (pointer?.hold) window.clearTimeout(pointer.hold)
  if (edgeTimer) window.clearTimeout(edgeTimer)
  edgeTimer = undefined
  edgeDirection = 0
  lastEdgeDirection = 0
}

function onPointerUp(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return
  const deltaX = event.clientX - pointer.x
  const deltaY = event.clientY - pointer.y
  if (pointer.dragging && pointer.sourceId !== pointer.targetId) {
    emit('reorder', pointer.sourceId, pointer.targetId)
    suppressClick = true
    window.setTimeout(() => { suppressClick = false }, 100)
  } else if (pointer.type === 'touch' && !pointer.dragging && Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
    emit('swipe', deltaX < 0 ? 1 : -1)
    suppressClick = true
    window.setTimeout(() => { suppressClick = false }, 100)
  }
  draggingId.value = ''
  pointer = undefined
  cleanPointer()
}

function cancelPointer() {
  draggingId.value = ''
  pointer = undefined
  cleanPointer()
}

function openContextMenu(event: MouseEvent, item: LauncherItem) {
  if (!item.shortcut) {
    closeContextMenu()
    return
  }
  event.preventDefault()
  showContextMenu(item, event.clientX, event.clientY)
}

function openContextMenuKeyboard(event: KeyboardEvent, item: LauncherItem) {
  if ((event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) || !item.shortcut) return
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  showContextMenu(item, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
}

function showContextMenu(item: LauncherItem, x: number, y: number) {
  const width = 164
  const height = 94
  contextPosition.value = {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  }
  contextItem.value = item
}

function closeContextMenu() {
  contextItem.value = undefined
}

function openItem(event: MouseEvent, item: LauncherItem) {
  if (suppressClick) {
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
    return
  }
  emit('open', item)
}

function editContextItem(event: MouseEvent) {
  event.stopPropagation()
  if (contextItem.value) emit('edit', contextItem.value)
  closeContextMenu()
}

function removeContextItem(event: MouseEvent) {
  event.stopPropagation()
  if (contextItem.value) emit('remove', contextItem.value)
  closeContextMenu()
}

function closeContextOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('keydown', closeContextOnEscape)
})
onBeforeUnmount(() => {
  cleanPointer()
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('keydown', closeContextOnEscape)
})
</script>

<template>
  <div class="shortcut-grid-wrap" @click="closeContextMenu">
    <div
      v-if="draggedItem"
      class="shortcut-drag-ghost"
      aria-hidden="true"
      :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px`, '--shortcut-size': `${iconSize}px`, '--shortcut-radius': `${iconRadius}px` }"
    >
      <span class="shortcut-icon" :class="{ builtin: draggedItem.action }" :style="{ backgroundColor: draggedItem.color }">
        <img v-if="draggedItem.icon" class="shortcut-picture" :src="draggedItem.icon" alt="" draggable="false" />
        <component v-else-if="draggedItem.action" :is="itemIcons[draggedItem.action]" :size="35" :stroke-width="2.6" />
        <span v-else class="shortcut-mark">{{ draggedItem.mark }}</span>
        <span v-if="draggedItem.badge" class="shortcut-badge">{{ draggedItem.badge }}</span>
      </span>
      <span v-if="showNames" class="shortcut-name">{{ draggedItem.title }}</span>
    </div>
    <div ref="gridViewport" class="shortcut-grid-viewport">
      <div class="shortcut-pages" :style="{ transform: `translate3d(-${currentPage * 100}%, 0, 0)` }">
          <section
            v-for="(page, pageIndex) in pages"
            :key="pageIndex"
            class="shortcut-page"
            :aria-hidden="pageIndex !== currentPage"
            :inert="pageIndex !== currentPage"
            :style="{ '--grid-columns': columns, '--shortcut-size': `${iconSize}px`, '--shortcut-radius': `${iconRadius}px` }"
          >
          <article
            v-for="item in page"
            :key="item.id"
            class="shortcut-cell"
            :class="{ dragging: draggingId === item.id }"
            :data-item-id="item.id"
            @pointerdown="onPointerDown($event, item)"
            @contextmenu="openContextMenu($event, item)"
          >
            <button class="shortcut-open" type="button" :aria-label="`打开${item.title}`" :aria-haspopup="item.shortcut ? 'menu' : undefined" @click="openItem($event, item)" @keydown="openContextMenuKeyboard($event, item)">
              <span class="shortcut-icon" :class="{ builtin: item.action }" :style="{ backgroundColor: item.color }">
                <img v-if="item.icon" class="shortcut-picture" :src="item.icon" alt="" draggable="false" />
                <component v-else-if="item.action" :is="itemIcons[item.action]" :size="35" :stroke-width="2.6" />
                <span v-else class="shortcut-mark">{{ item.mark }}</span>
                <span v-if="item.badge" class="shortcut-badge">{{ item.badge }}</span>
              </span>
              <span v-if="showNames" class="shortcut-name">{{ item.title }}</span>
            </button>
          </article>
        </section>
      </div>
    </div>

    <div
      v-if="contextItem"
      class="shortcut-context-menu"
      role="menu"
      :style="{ left: `${contextPosition.left}px`, top: `${contextPosition.top}px` }"
      @click.stop
    >
      <button type="button" role="menuitem" @click="editContextItem"><Pencil :size="14" /> 编辑快捷入口</button>
      <button type="button" role="menuitem" class="danger" @click="removeContextItem"><Trash2 :size="14" /> 删除快捷入口</button>
    </div>
  </div>
</template>
