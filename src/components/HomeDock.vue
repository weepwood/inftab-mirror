<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { launcherIcons } from './launcherIcons'
import { closeMenuOnFocusout, navigateMenu } from './menuNavigation'
import type { LauncherItem } from '../types'

const props = withDefaults(defineProps<{ items: LauncherItem[]; magnificationEnabled?: boolean; iconSize?: number; iconGap?: number; darkTheme?: boolean; autoHide?: boolean }>(), {
  magnificationEnabled: false,
  iconSize: 44,
  iconGap: 2,
  darkTheme: false,
})
const emit = defineEmits<{ open: [item: LauncherItem, event?: MouseEvent]; remove: [id: string]; reorder: [sourceId: string, targetId?: string, after?: boolean] }>()
const dock = ref<HTMLElement>()
const contextMenu = ref<HTMLElement>()
const contextItem = ref<LauncherItem>()
const contextPosition = ref({ left: 0, top: 0 })
let contextTrigger: HTMLElement | undefined

interface DockTouchGesture {
  pointerId: number
  startX: number
  startY: number
  startScrollTop: number
  home: HTMLElement | undefined
  axis?: 'horizontal' | 'vertical'
  moved: boolean
}

let gesture: DockTouchGesture | undefined
let suppressClickTimer: ReturnType<typeof setTimeout> | undefined
let suppressClick = false
let suppressedClickPointerId: number | undefined
let magnificationFrame = 0
let pointerX = 0
const dragId = ref<string>()
const dropTarget = ref<{ id: string; after: boolean }>()
const failedIcons = ref<Record<string, string>>({})
function startDrag(event: DragEvent, id: string) {
  dragId.value = id
  clearDockMagnification()
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }
}
function previewDrop(event: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) return
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropTarget.value = { id, after: event.clientX > bounds.left + bounds.width / 2 }
}
function endDrag() { dragId.value = undefined; dropTarget.value = undefined }
function dropItem(event: DragEvent, targetId: string) {
  if (!dragId.value) return
  event.preventDefault()
  if (dragId.value !== targetId) {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    emit('reorder', dragId.value, targetId, event.clientX > bounds.left + bounds.width / 2)
  }
  endDrag()
}

function clearSuppressedClick() {
  suppressClick = false
  suppressedClickPointerId = undefined
  if (suppressClickTimer !== undefined) {
    clearTimeout(suppressClickTimer)
    suppressClickTimer = undefined
  }
}

function clearSuppressedClickOnPointerDown() {
  clearSuppressedClick()
}

function cleanGestureListeners() {
  window.removeEventListener('pointermove', moveDockGesture)
  window.removeEventListener('pointerup', finishDockGesture)
  window.removeEventListener('pointercancel', cancelDockGesture)
}

function startDockGesture(event: PointerEvent) {
  if (event.pointerType !== 'touch' || event.button !== 0 || !dock.value) return
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startScrollTop: dock.value.closest<HTMLElement>('.home.home-scrollable')?.scrollTop ?? 0,
    home: dock.value.closest<HTMLElement>('.home.home-scrollable') ?? undefined,
    moved: false,
  }
  window.addEventListener('pointermove', moveDockGesture, { passive: false })
  window.addEventListener('pointerup', finishDockGesture)
  window.addEventListener('pointercancel', cancelDockGesture)
}

function moveDockGesture(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  if (!gesture.axis && Math.hypot(deltaX, deltaY) > 8) {
    gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
  }
  if (!gesture.axis) return
  gesture.moved = true
  if (gesture.axis === 'horizontal') return
  event.preventDefault()
  if (gesture.home) gesture.home.scrollTop = gesture.startScrollTop - deltaY
}

function finishDockGesture(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const moved = gesture.moved
  gesture = undefined
  cleanGestureListeners()
  if (!moved) return
  suppressClick = true
  suppressedClickPointerId = event.pointerId
  if (suppressClickTimer !== undefined) clearTimeout(suppressClickTimer)
  suppressClickTimer = setTimeout(clearSuppressedClick, 500)
}

function cancelDockGesture(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  gesture = undefined
  cleanGestureListeners()
}

function preventGestureClick(event: MouseEvent) {
  if (event.detail === 0) {
    clearSuppressedClick()
    return
  }
  if (!suppressClick) return
  const pointerId = 'pointerId' in event && typeof event.pointerId === 'number' ? event.pointerId : undefined
  if (pointerId !== undefined && pointerId !== suppressedClickPointerId) {
    clearSuppressedClick()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  clearSuppressedClick()
}

function updateDockMagnification(event: PointerEvent) {
  if (event.pointerType === 'touch' || dragId.value || !props.magnificationEnabled || !dock.value) return
  pointerX = event.clientX
  if (magnificationFrame) return
  magnificationFrame = window.requestAnimationFrame(() => {
    magnificationFrame = 0
    const entries = Array.from(dock.value?.querySelectorAll<HTMLElement>('.home-dock-entry') ?? [])
    if (!entries.length) return
    const first = entries[0]!.getBoundingClientRect()
    const last = entries.at(-1)!.getBoundingClientRect()
    const itemSize = first.width || 48
    const pitch = entries.length > 1 ? (last.left - first.left) / (entries.length - 1) : itemSize
    const centers = entries.map((_, index) => first.left + itemSize / 2 + index * pitch)
    const influenceRadius = Math.max(itemSize, pitch) * 2.8
    dock.value?.classList.add('is-magnifying')
    const scales = centers.map(center => {
      const proximity = Math.max(0, 1 - Math.abs(pointerX - center) / influenceRadius)
      return 1 + .65 * proximity * proximity * (3 - 2 * proximity)
    })
    const expansion = scales.map(scale => (scale - 1) * Math.max(0, itemSize - 4))
    const total = expansion.reduce((sum, value) => sum + value, 0)
    const bounds = dock.value?.getBoundingClientRect()
    const left = first.left
    const right = last.right
    const room = bounds?.width ? Math.max(0, bounds.right - right) + Math.max(0, left - bounds.left) : total
    const factor = total > 0 ? Math.min(1, room / total) : 1
    let offset = bounds?.width ? -Math.min(total * factor / 2, Math.max(0, left - bounds.left)) : -total / 2
    if (bounds?.width) offset = Math.min(offset, Math.max(0, bounds.right - right) - total * factor)
    entries.forEach((entry, index) => {
      const extra = expansion[index]! * factor
      entry.style.setProperty('--dock-scale', (1 + (scales[index]! - 1) * factor).toFixed(3))
      entry.style.setProperty('--dock-shift-x', `${(offset + extra / 2).toFixed(2)}px`)
      entry.style.zIndex = scales[index]! > 1.05 ? '2' : ''
      offset += extra
    })
  })
}

function clearDockMagnification() {
  if (magnificationFrame) window.cancelAnimationFrame(magnificationFrame)
  magnificationFrame = 0
  dock.value?.classList.remove('is-magnifying')
  dock.value?.querySelectorAll<HTMLElement>('.home-dock-entry').forEach((entry) => {
    entry.style.removeProperty('--dock-scale')
    entry.style.removeProperty('--dock-shift-x')
    entry.style.removeProperty('z-index')
  })
}

function closeContextMenu(restoreFocus = false) {
  const trigger = contextTrigger
  contextTrigger = undefined
  contextItem.value = undefined
  if (restoreFocus && trigger?.isConnected) void nextTick(() => trigger.focus())
}

function closeOnOutsideClick() { closeContextMenu() }

function showContextMenu(event: Event, item: LauncherItem, x: number, y: number) {
  event.preventDefault()
  contextTrigger = event.currentTarget as HTMLElement
  const width = 176
  const height = 52
  contextPosition.value = {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  }
  contextItem.value = item
  void nextTick(() => contextMenu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
}

function handleItemKeydown(event: KeyboardEvent, item: LauncherItem) {
  if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    event.stopPropagation()
    const after = event.key === 'ArrowRight'
    const target = props.items[props.items.findIndex(candidate => candidate.id === item.id) + (after ? 1 : -1)]
    if (target) emit('reorder', item.id, target.id, after)
    return
  }
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  showContextMenu(event, item, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
}

function removeContextItem() {
  if (!contextItem.value) return
  emit('remove', contextItem.value.id)
  closeContextMenu()
}

onMounted(() => {
  window.addEventListener('pointerdown', clearSuppressedClickOnPointerDown, true)
  window.addEventListener('click', closeOnOutsideClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', clearSuppressedClickOnPointerDown, true)
  window.removeEventListener('click', closeOnOutsideClick)
  cleanGestureListeners()
  clearSuppressedClick()
  clearDockMagnification()
})
</script>

<template>
  <nav v-if="items.length" ref="dock" class="home-dock" :class="{ 'magnification-off': !props.magnificationEnabled, 'dock-auto-hide': props.autoHide, 'dock-menu-open': Boolean(contextItem), 'dock-dragging': Boolean(dragId) }" :style="{ '--dock-size-setting': `${props.iconSize}px`, '--dock-gap-setting': `${props.iconGap}px` }" aria-label="常驻 Dock" @pointerdown="startDockGesture" @pointermove="updateDockMagnification" @pointerleave="clearDockMagnification" @click.capture="preventGestureClick">
    <div class="home-dock-track">
      <div v-for="item in items" :key="item.id" class="home-dock-entry" :data-title="item.title" :class="{ 'dock-drag-source': dragId === item.id, 'dock-drop-before': dropTarget?.id === item.id && !dropTarget.after, 'dock-drop-after': dropTarget?.id === item.id && dropTarget.after }" @dragover="previewDrop($event, item.id)" @drop="dropItem($event, item.id)">
        <button
          type="button"
          class="home-dock-item"
          :data-dock-item-id="item.id"
          :aria-label="`打开${item.title}`"
          draggable="true"
          @dragstart="startDrag($event, item.id)"
          @dragend="endDrag"
          aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
          @click="emit('open', item, $event)"
          @auxclick.middle.prevent="emit('open', item, $event)"
          @contextmenu="showContextMenu($event, item, $event.clientX, $event.clientY)"
          @keydown="handleItemKeydown($event, item)"
        >
          <span class="home-dock-icon" :class="{ builtin: item.action }" :data-action="item.action" :style="{ backgroundColor: item.action ? undefined : item.color, '--dock-glow-color': item.color }">
            <component v-if="item.action && launcherIcons[item.action]" :is="launcherIcons[item.action]" :size="24" :stroke-width="1.8" />
            <img v-else-if="item.icon && failedIcons[item.id] !== item.icon" :src="item.icon" decoding="async" alt="" draggable="false" @error="failedIcons[item.id] = item.icon!" />
            <span v-else>{{ item.mark }}</span>
          </span>
        </button>
      </div>
    </div>
  </nav>
  <Teleport to="body">
    <div v-if="contextItem" class="dock-context-theme" :class="{ 'theme-dark': props.darkTheme }">
      <div
        ref="contextMenu"
        class="shortcut-context-menu dock-context-menu"
        role="menu"
        :aria-label="`${contextItem.title} 的 Dock 操作`"
        :style="{ left: `${contextPosition.left}px`, top: `${contextPosition.top}px` }"
        @click.stop
        @keydown="navigateMenu"
        @focusout="closeMenuOnFocusout($event, closeContextMenu)"
        @keydown.esc.stop.prevent="closeContextMenu(true)"
      >
        <button type="button" role="menuitem" class="danger" :aria-label="`从 Dock 移除${contextItem.title}`" @click="removeContextItem"><X :size="14" /> 从 Dock 移除</button>
      </div>
    </div>
  </Teleport>
</template>
