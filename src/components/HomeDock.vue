<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import type { LauncherItem } from '../types'

defineProps<{ items: LauncherItem[] }>()
const emit = defineEmits<{ open: [item: LauncherItem]; remove: [id: string] }>()
const dock = ref<HTMLElement>()

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

onMounted(() => {
  window.addEventListener('pointerdown', clearSuppressedClickOnPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', clearSuppressedClickOnPointerDown, true)
  cleanGestureListeners()
  clearSuppressedClick()
})
</script>

<template>
  <nav v-if="items.length" ref="dock" class="home-dock" aria-label="常驻 Dock" @pointerdown="startDockGesture" @click.capture="preventGestureClick">
    <div v-for="item in items" :key="item.id" class="home-dock-entry">
      <button
        type="button"
        class="home-dock-item"
        :data-dock-item-id="item.id"
        :aria-label="`打开${item.title}`"
        :title="item.title"
        @click="emit('open', item)"
      >
        <span class="home-dock-icon" :style="{ backgroundColor: item.color }">
          <img v-if="item.icon" :src="item.icon" alt="" />
          <span v-else>{{ item.mark }}</span>
        </span>
        <span class="home-dock-label">{{ item.title }}</span>
      </button>
      <button type="button" class="home-dock-remove" :aria-label="`从 Dock 移除${item.title}`" :title="`从 Dock 移除${item.title}`" @click="emit('remove', item.id)">
        <X :size="12" />
      </button>
    </div>
  </nav>
</template>
