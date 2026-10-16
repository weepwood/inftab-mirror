<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import type { LauncherItem } from '../types'

const props = withDefaults(defineProps<{ items: LauncherItem[]; magnificationEnabled?: boolean; iconSize?: number; iconGap?: number; glowStrength?: number; darkTheme?: boolean }>(), {
  magnificationEnabled: false,
  iconSize: 44,
  iconGap: 2,
  glowStrength: 100,
  darkTheme: false,
})
const emit = defineEmits<{ open: [item: LauncherItem]; remove: [id: string] }>()
const dock = ref<HTMLElement>()
const contextMenu = ref<HTMLElement>()
const contextItem = ref<LauncherItem>()
const contextPosition = ref({ left: 0, top: 0 })

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
  if (event.pointerType === 'touch' || !props.magnificationEnabled || !dock.value) return
  const pointerX = event.clientX
  if (magnificationFrame) window.cancelAnimationFrame(magnificationFrame)
  magnificationFrame = window.requestAnimationFrame(() => {
    magnificationFrame = 0
    const entries = Array.from(dock.value?.querySelectorAll<HTMLElement>('.home-dock-entry') ?? [])
    const centers = entries.map((entry) => {
      const bounds = entry.getBoundingClientRect()
      return bounds.left + bounds.width / 2
    })
    entries.forEach((entry, index) => {
      const influence = Math.max(0, 1 - Math.abs(pointerX - centers[index]!) / 112)
      const scale = 1 + influence * .24
      entry.style.setProperty('--dock-scale', scale.toFixed(3))
    })
  })
}

function clearDockMagnification() {
  if (magnificationFrame) window.cancelAnimationFrame(magnificationFrame)
  magnificationFrame = 0
  dock.value?.querySelectorAll<HTMLElement>('.home-dock-entry').forEach((entry) => {
    entry.style.removeProperty('--dock-scale')
  })
}

function closeContextMenu() {
  contextItem.value = undefined
}

function showContextMenu(event: Event, item: LauncherItem, x: number, y: number) {
  event.preventDefault()
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
  window.addEventListener('click', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', clearSuppressedClickOnPointerDown, true)
  window.removeEventListener('click', closeContextMenu)
  cleanGestureListeners()
  clearSuppressedClick()
  clearDockMagnification()
})
</script>

<template>
  <nav v-if="items.length" ref="dock" class="home-dock" :class="{ 'magnification-off': !props.magnificationEnabled }" :style="{ '--dock-size-setting': `${props.iconSize}px`, '--dock-gap-setting': `${props.iconGap}px`, '--dock-glow-strength': String(props.glowStrength / 100) }" aria-label="常驻 Dock" @pointerdown="startDockGesture" @pointermove="updateDockMagnification" @pointerleave="clearDockMagnification" @click.capture="preventGestureClick">
    <div v-for="item in items" :key="item.id" class="home-dock-entry" :data-title="item.title">
      <button
        type="button"
        class="home-dock-item"
        :data-dock-item-id="item.id"
        :aria-label="`打开${item.title}`"
        :title="item.title"
        @click="emit('open', item)"
        @contextmenu="showContextMenu($event, item, $event.clientX, $event.clientY)"
        @keydown="handleItemKeydown($event, item)"
      >
        <span class="home-dock-icon" :style="{ backgroundColor: item.color, '--dock-glow-color': item.color }">
          <img v-if="item.icon" :src="item.icon" alt="" />
          <span v-else>{{ item.mark }}</span>
        </span>
      </button>
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
        @keydown.esc.stop.prevent="closeContextMenu"
      >
        <button type="button" role="menuitem" class="danger" :aria-label="`从 Dock 移除${contextItem.title}`" @click="removeContextItem"><X :size="14" /> 从 Dock 移除</button>
      </div>
    </div>
  </Teleport>
</template>
