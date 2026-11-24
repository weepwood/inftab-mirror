<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
let lastFrame = 0
let dirty = false
let hovering = false
let geometry: { slots: HTMLElement[]; left: number; right: number; size: number } | undefined
const springs = new Map<HTMLElement, { scale: number; velocity: number; target: number }>()
const dragId = ref<string>()
const dropTarget = ref<{ id: string; after: boolean }>()
const failedIcons = ref<Record<string, string>>({})
// FLIP: capture the visible pre-reorder position, then invert the keyed move.
// Animate only the entry wrapper, not the magnified inner icon.
const entries = () => Array.from(dock.value?.querySelectorAll<HTMLElement>('.home-dock-entry') ?? [])
// Offset geometry is independent of FLIP transforms and drop markers.
function slotBounds(el: HTMLElement) {
  const parent = el.offsetParent
  if (!el.offsetWidth || !(parent instanceof HTMLElement)) return el.getBoundingClientRect()
  const left = parent.getBoundingClientRect().left + parent.clientLeft + el.offsetLeft - parent.scrollLeft
  return { left, right: left + el.offsetWidth, width: el.offsetWidth }
}
const flips = new Map<HTMLElement, Animation>()
watch(() => props.magnificationEnabled, enabled => { if (!enabled) clearDockMagnification() })
watch(() => props.items.map(item => item.id).join('|'), async (_, __, onCleanup) => {
  const before = new Map(entries().map(el => [el, el.getBoundingClientRect().left]))
  flips.forEach(animation => animation.cancel())
  flips.clear()
  clearDockMagnification()
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  await nextTick()
  if (cancelled) return
  for (const el of entries()) {
    const old = before.get(el)
    if (old === undefined || !el.animate) continue
    const dx = old - slotBounds(el).left
    if (Math.abs(dx) < 1) continue
    const animation = el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.85,.25,1)' })
    flips.set(el, animation)
    animation.onfinish = () => { if (flips.get(el) === animation) flips.delete(el) }
  }
})
function startDrag(event: DragEvent, id: string) {
  dragId.value = id
  clearDockMagnification()
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }
}
function previewDrop(event: DragEvent, id: string) {
  if (!dragId.value || dragId.value === id) { dropTarget.value = undefined; return }
  event.preventDefault()
  const bounds = slotBounds(event.currentTarget as HTMLElement)
  dropTarget.value = { id, after: event.clientX > bounds.left + bounds.width / 2 }
}
function endDrag() { dragId.value = undefined; dropTarget.value = undefined }
function dropItem(event: DragEvent, targetId: string) {
  if (!dragId.value) return
  event.preventDefault()
  if (dragId.value !== targetId) {
    const bounds = slotBounds(event.currentTarget as HTMLElement)
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
  hovering = dirty = true
  queueMagnification()
}

function queueMagnification() {
  if (!magnificationFrame) magnificationFrame = requestAnimationFrame(paintMagnification)
}

function paintMagnification(now: number) {
  magnificationFrame = 0
  if (!dock.value) return
  if (dirty) {
    dirty = false
    const slots = entries()
    if (!slots.length) { clearDockMagnification(); return }
    const first = slotBounds(slots[0]!), last = slotBounds(slots.at(-1)!)
    const size = first.width || 48
    const pitch = (last.left - first.left) / Math.max(1, slots.length - 1)
    const radius = Math.max(size, pitch) * 2.8
    const bounds = dock.value.getBoundingClientRect()
    geometry = { slots, size, left: bounds.width ? Math.max(0, first.left - bounds.left) : size * slots.length, right: bounds.width ? Math.max(0, bounds.right - last.right) : size * slots.length }
    slots.forEach((el, index) => {
      const p = Math.max(0, 1 - Math.abs(pointerX - first.left - size / 2 - index * pitch) / radius)
      const state = springs.get(el) ?? { scale: 1, velocity: 0, target: 1 }
      state.target = hovering ? 1 + .65 * p * p * (3 - 2 * p) : 1
      springs.set(el, state)
    })
  }
  if (!geometry) return
  // Exact solution of x'' + 2*w*x' + w*w*x = 0, preserving velocity on retarget.
  // Time is milliseconds; w = .028/ms. No frame-rate-dependent Euler integration.
  const dt = lastFrame ? Math.min(64, Math.max(0, now - lastFrame)) : 16
  lastFrame = now
  const rate = .028, decay = Math.exp(-rate * dt)
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const { slots, left, right, size } = geometry
  let moving = false
  const scales = slots.map(el => {
    const s = springs.get(el)!
    const distance = s.scale - s.target, slope = s.velocity + rate * distance
    s.scale = reduced ? s.target : s.target + (distance + slope * dt) * decay
    s.velocity = reduced ? 0 : (s.velocity - rate * slope * dt) * decay
    if (Math.abs(s.scale - s.target) > .001 || Math.abs(s.velocity) > .00005) moving = true
    else { s.scale = s.target; s.velocity = 0 }
    return Math.max(1, Math.min(1.65, s.scale))
  })
  const expansion = scales.map(scale => (scale - 1) * Math.max(0, size - 4))
  const total = expansion.reduce((sum, value) => sum + value, 0)
  const factor = Math.min(1, (left + right) / (total || 1))
  let offset = Math.max(-left, Math.min(-total * factor / 2, right - total * factor))
  dock.value.classList.add('is-magnifying')
  dock.value.style.setProperty('--dock-lift', String(1 + (Math.max(...scales) - 1) * factor * .18))
  slots.forEach((entry, index) => {
    const extra = expansion[index]! * factor
    entry.style.setProperty('--dock-scale', (1 + (scales[index]! - 1) * factor).toFixed(3))
    entry.style.setProperty('--dock-shift-x', `${(offset + extra / 2).toFixed(2)}px`)
    entry.style.zIndex = scales[index]! > 1.05 ? '2' : ''
    offset += extra
  })
  if (moving) queueMagnification()
  else if (!hovering) clearDockMagnification()
  else lastFrame = 0
}

function releaseDockMagnification() {
  hovering = false
  if (geometry) { dirty = true; queueMagnification() }
  else clearDockMagnification()
}

function clearDockMagnification() {
  cancelAnimationFrame(magnificationFrame)
  magnificationFrame = lastFrame = 0
  hovering = dirty = false
  geometry = undefined
  springs.clear()
  dock.value?.classList.remove('is-magnifying')
  dock.value?.style.removeProperty('--dock-lift')
  entries().forEach(entry => {
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
  window.addEventListener('pointerdown', clearSuppressedClick, true)
  window.addEventListener('click', closeOnOutsideClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', clearSuppressedClick, true)
  window.removeEventListener('click', closeOnOutsideClick)
  cleanGestureListeners()
  clearSuppressedClick()
  clearDockMagnification()
  flips.forEach(animation => animation.cancel())
  flips.clear()
})
</script>

<template>
  <nav v-if="items.length" ref="dock" class="home-dock" :class="{ 'magnification-off': !props.magnificationEnabled, 'dock-auto-hide': props.autoHide, 'dock-menu-open': Boolean(contextItem), 'dock-dragging': Boolean(dragId) }" :style="{ '--dock-size-setting': `${props.iconSize}px`, '--dock-gap-setting': `${props.iconGap}px` }" aria-label="常驻 Dock" @pointerdown="startDockGesture" @pointermove="updateDockMagnification" @pointerleave="releaseDockMagnification" @click.capture="preventGestureClick">
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
