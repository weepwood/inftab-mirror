<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { desktopHabitIcon, launcherIcons } from './launcherIcons'
import { closeMenuOnFocusout, navigateMenu } from './menuNavigation'
import type { LauncherItem } from '../types'
import { launcherPanelRoutes, shortcutPanelRoutes } from '../plugins/routes'
import type { PanelId } from '../plugins/ids'

const props = withDefaults(defineProps<{ items: LauncherItem[]; magnificationEnabled?: boolean; iconSize?: number; iconGap?: number; darkTheme?: boolean; autoHide?: boolean; runningPanels?: PanelId[]; desktop?: boolean; blocked?:boolean }>(), {
  magnificationEnabled: false,
  iconSize: 44,
  iconGap: 2,
  darkTheme: false,
})
const emit = defineEmits<{ finder: []; open: [item: LauncherItem, event?: MouseEvent]; remove: [id: string]; reorder: [sourceId: string, targetId?: string, after?: boolean] }>()
function running(item:LauncherItem) {
 const panel=item.action?launcherPanelRoutes[item.action]:shortcutPanelRoutes[item.id]
 return !!panel&&props.runningPanels?.includes(panel)
}
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
let geometry: { slots: HTMLElement[]; left: number; right: number; size: number; origin: number; pitch: number; radius: number } | undefined
type Spring = { position: number; velocity: number; target: number }
const springs = new Map<HTMLElement, Spring>()
// Critical damping, exact integration; shared between magnification and reorder.
function advanceSpring(s: Spring, dt: number, rate: number, epsilon: number) {
  const distance = s.position - s.target, slope = s.velocity + rate * distance
  const decay = Math.exp(-rate * dt)
  s.position = s.target + (distance + slope * dt) * decay
  s.velocity = (s.velocity - rate * slope * dt) * decay
  if (Math.abs(s.position - s.target) > epsilon || Math.abs(s.velocity) > epsilon * rate) return true
  s.position = s.target
  s.velocity = 0
  return false
}
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
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
const reorders = new Map<HTMLElement, Spring>()
let reorderFrame = 0, reorderTime = 0
function clearReorders() {
  cancelAnimationFrame(reorderFrame)
  reorderFrame = reorderTime = 0
  reorders.forEach((_, el) => el.style.removeProperty('transform'))
  reorders.clear()
}
function paintReorder(now: number) {
  reorderFrame = 0
  const dt = Math.min(64, Math.max(0, now - reorderTime))
  reorderTime = now
  const reduced = reducedMotion()
  reorders.forEach((s, el) => {
    if (!reduced && advanceSpring(s, dt, .028, .05)) {
      el.style.transform = `translateX(${s.position}px)`
    } else {
      el.style.removeProperty('transform')
      reorders.delete(el)
    }
  })
  if (reorders.size) reorderFrame = requestAnimationFrame(paintReorder)
}
watch(() => [props.magnificationEnabled, props.iconSize, props.iconGap], clearDockMagnification)
watch(() => props.items.map(item => item.id).join('|'), async (_, __, onCleanup) => {
  const active = document.activeElement
  const focused = active instanceof HTMLElement && dock.value?.contains(active) ? active : undefined
  const before = new Map(entries().map(el => [el, { left: el.getBoundingClientRect().left, velocity: reorders.get(el)?.velocity ?? 0 }]))
  clearReorders()
  clearDockMagnification()
  let cancelled = false
  onCleanup(() => { cancelled = true })
  await nextTick()
  if (cancelled) return
  if (focused?.isConnected && document.activeElement === document.body) focused.focus({ preventScroll: true })
  if (reducedMotion()) return
  for (const el of entries()) {
    const old = before.get(el)
    if (!old) continue
    const dx = old.left - slotBounds(el).left
    if (Math.abs(dx) < .05 && Math.abs(old.velocity) < .001) continue
    reorders.set(el, { position: dx, velocity: old.velocity, target: 0 })
    el.style.transform = `translateX(${dx}px)`
  }
  if (reorders.size) {
    reorderTime = performance.now()
    reorderFrame = requestAnimationFrame(paintReorder)
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
  if (props.blocked || event.pointerType !== 'touch' || event.button !== 0 || !dock.value) return
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
  if (event.pointerType === 'touch' || dragId.value || contextItem.value || !props.magnificationEnabled || !dock.value) return
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
    if (!geometry) {
      const slots = entries()
      if (!slots.length) { clearDockMagnification(); return }
      const first = slotBounds(slots[0]!), last = slotBounds(slots.at(-1)!)
      const size = first.width || 48
      const pitch = (last.left - first.left) / Math.max(1, slots.length - 1)
      const bounds = dock.value.getBoundingClientRect()
      geometry = { slots, size, origin: first.left + size / 2, pitch, radius: Math.max(size, pitch) * 2.8, left: bounds.width ? Math.max(0, first.left - bounds.left) : size * slots.length, right: bounds.width ? Math.max(0, bounds.right - last.right) : size * slots.length }
    }
    const { slots, origin, pitch, radius } = geometry
    slots.forEach((el, index) => {
      const p = Math.max(0, 1 - Math.abs(pointerX - origin - index * pitch) / radius)
      const state = springs.get(el) ?? { position: 1, velocity: 0, target: 1 }
      state.target = hovering ? 1 + .65 * p * p * (3 - 2 * p) : 1
      springs.set(el, state)
    })
  }
  if (!geometry) return
  // Exact solution of x'' + 2*w*x' + w*w*x = 0, preserving velocity on retarget.
  // Time is milliseconds; w = .028/ms. No frame-rate-dependent Euler integration.
  const dt = lastFrame ? Math.min(64, Math.max(0, now - lastFrame)) : 16
  lastFrame = now
  const reduced = reducedMotion()
  const { slots, left, right, size } = geometry
  let moving = false
  const scales = slots.map(el => {
    const s = springs.get(el)!
    if (reduced) { s.position = s.target; s.velocity = 0 }
    else if (advanceSpring(s, dt, .028, .001)) moving = true
    return Math.max(1, Math.min(1.65, s.position))
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
watch(()=>props.blocked,value=>{if(value){closeContextMenu();clearDockMagnification();cleanGestureListeners();gesture=undefined;dragId.value=undefined;dropTarget.value=undefined;clearSuppressedClick();clearReorders()}})

function showContextMenu(event: Event, item: LauncherItem, x: number, y: number) {
  event.preventDefault()
  if(props.blocked)return
  contextTrigger = event.currentTarget as HTMLElement
  if(props.desktop)clearDockMagnification()
  const iconBounds = contextTrigger.querySelector('.home-dock-icon')?.getBoundingClientRect()
  const width = 176
  const height = props.desktop ? 96 : 52
  contextPosition.value = {
    left: Math.max(8, Math.min(props.desktop && iconBounds ? iconBounds.left+iconBounds.width/2-width/2 : x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(props.desktop ? (iconBounds?.top??y)-height-24 : y, window.innerHeight - height - 8)),
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

function openContextItem(){
 const item=contextItem.value
 closeContextMenu()
 if(item)emit('open',item)
}

function removeContextItem() {
  if (!contextItem.value) return
  emit('remove', contextItem.value.id)
  closeContextMenu()
}

onMounted(() => {
  window.addEventListener('pointerdown', clearSuppressedClick, true)
  window.addEventListener('click', closeOnOutsideClick)
  window.addEventListener('resize', clearDockMagnification)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', clearSuppressedClick, true)
  window.removeEventListener('click', closeOnOutsideClick)
  window.removeEventListener('resize', clearDockMagnification)
  cleanGestureListeners()
  clearSuppressedClick()
  clearDockMagnification()
  clearReorders()
})
</script>

<template>
  <nav v-if="items.length || props.desktop" ref="dock" :inert="(props.blocked)||undefined" class="home-dock" :class="{ 'magnification-off': !props.magnificationEnabled, 'dock-auto-hide': props.autoHide, 'dock-menu-open': Boolean(contextItem), 'dock-dragging': Boolean(dragId) }" :style="{ '--dock-size-setting': `${props.iconSize}px`, '--dock-gap-setting': `${props.iconGap}px` }" aria-label="常驻 Dock" @pointerdown="startDockGesture" @pointermove="updateDockMagnification" @pointerleave="releaseDockMagnification" @click.capture="preventGestureClick">
    <div class="home-dock-track" @scroll.passive="clearDockMagnification">
      <div v-if="props.desktop" class="home-dock-system-entry">
        <button type="button" class="home-dock-finder" aria-label="打开 Finder" title="Finder" @click="emit('finder')">
          <span class="home-dock-icon mac-finder-glyph" aria-hidden="true"><i/><b/></span>
        </button>
      </div>
      <div v-for="(item,index) in items" :key="item.id" class="home-dock-entry" :data-title="item.title" :class="{ 'dock-divider': props.desktop && index>0 && !item.action && !!items[index-1]?.action, 'dock-drag-source': dragId === item.id, 'dock-drop-before': dropTarget?.id === item.id && !dropTarget.after, 'dock-drop-after': dropTarget?.id === item.id && dropTarget.after }" @dragover="previewDrop($event, item.id)" @drop="dropItem($event, item.id)">
        <button
          type="button"
          class="home-dock-item"
          :data-dock-item-id="item.id"
          :aria-label="`打开${item.title}`"
          :data-running="running(item) || undefined"
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
            <span v-if="props.desktop && item.folder" class="mac-folder-icon" aria-hidden="true"/>
            <component v-else-if="item.action && launcherIcons[item.action]" :is="props.desktop&&item.action==='habits'?desktopHabitIcon:launcherIcons[item.action]" :size="24" :stroke-width="1.8" />
            <img v-else-if="item.icon && failedIcons[item.id] !== item.icon" :src="item.icon" decoding="async" alt="" draggable="false" @error="failedIcons[item.id] = item.icon!" />
            <span v-else>{{ item.mark }}</span>
          </span>
          <span v-if="running(item)" class="dock-running-dot" aria-hidden="true"/>
        </button>
      </div>
    </div>
  </nav>
  <Teleport to="body">
    <div v-if="contextItem" class="dock-context-theme" :class="{ 'theme-dark': props.darkTheme, 'mac-dock-context':props.desktop }">
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
        <button v-if="props.desktop" type="button" role="menuitem" @click="openContextItem">{{running(contextItem)?'显示窗口':'打开'}}</button>
        <button type="button" role="menuitem" class="danger" :aria-label="`从 Dock 移除${contextItem.title}`" @click="removeContextItem"><X :size="14" /> 从 Dock 移除</button>
      </div>
    </div>
  </Teleport>
</template>
