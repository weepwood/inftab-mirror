<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CloudSun, Folder, Image, ListTodo, Pencil, Settings, StickyNote, Trash2 } from '@lucide/vue'
import type { Component } from 'vue'
import type { LauncherItem, PageTransitionEffect } from '../types'

const props = defineProps<{
  items: LauncherItem[]
  columns: number
  rows: number
  iconSize: number
  iconRadius: number
  showNames: boolean
  currentPage: number
  transitionDirection: number
  transitionEffect: PageTransitionEffect
  transitionDuration: number
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

const pageSize = computed(() => props.columns * props.rows)
const cycleCount = 5
const centerCycle = Math.floor(cycleCount / 2)
const pages = computed(() => {
  const result: LauncherItem[][] = []
  for (let index = 0; index < props.items.length; index += pageSize.value) {
    result.push(props.items.slice(index, index + pageSize.value))
  }
  return result
})
function centeredPhysicalPage(pageIndex = props.currentPage) {
  return pages.value.length > 1 ? pages.value.length * centerCycle + pageIndex : pageIndex
}
const displayPages = computed(() => {
  if (props.transitionEffect === 'particles') {
    const visiblePageIndexes = new Set([props.currentPage, outgoingPage.value?.index, incomingPage.value]
      .filter((index): index is number => typeof index === 'number'))
    return pages.value.flatMap((items, pageIndex) => visiblePageIndexes.has(pageIndex)
      ? [{ items, pageIndex, clone: false, trackIndex: pageIndex }]
      : [])
  }
  if (pages.value.length < 2) {
    return pages.value.map((items, pageIndex) => ({ items, pageIndex, clone: false, trackIndex: pageIndex }))
  }
  return Array.from({ length: cycleCount }, (_, cycleIndex) => pages.value.map((items, pageIndex) => {
    const trackIndex = cycleIndex * pages.value.length + pageIndex
    return {
      // Keep every track slot to preserve seamless looping, but only mount
      // shortcut cells for the visible page and its immediate neighbors.
      items: Math.abs(trackIndex - physicalPage.value) <= 1 ? items : [],
      pageIndex,
      clone: cycleIndex !== centerCycle,
      trackIndex,
    }
  })).flat()
})
const contextItem = ref<LauncherItem>()
const contextPosition = ref({ left: 0, top: 0 })
const draggingId = ref('')
const dragPosition = ref({ x: 0, y: 0 })
const draggedItem = computed(() => props.items.find((item) => item.id === draggingId.value))
const gridViewport = ref<HTMLElement>()
const outgoingPage = ref<{ index: number; effect: PageTransitionEffect; direction: number; duration: number }>()
const incomingPage = ref<number>()
const physicalPage = ref(props.transitionEffect === 'particles' ? props.currentPage : centeredPhysicalPage())
const trackOffsetPx = ref(0)
const resettingTrack = ref(false)
let pointer: { id: number; type: string; x: number; y: number; clientX: number; clientY: number; sourceId: string; targetId: string; dragging: boolean; hold?: number } | undefined
let suppressClick = false
let suppressClickTimer = 0
let edgeTimer: number | undefined
let edgeDirection = 0
let lastEdgeDirection = 0
let particleFrame = 0
let transitionTimer = 0
let trackSettleTimer = 0
let trackTransitionPending = false
let resetFrame = 0
let rebaseFrame = 0

interface IconParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  delay: number
}

function iconParticles(icon: HTMLElement, direction: number, iconIndex: number, iconCount: number): IconParticle[] {
  const bounds = icon.getBoundingClientRect()
  const image = icon.querySelector('img')
  const mark = icon.querySelector<HTMLElement>('.shortcut-mark')
  const sample = document.createElement('canvas')
  sample.width = 48
  sample.height = 48
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const radius = Math.min(13, Number.parseFloat(getComputedStyle(icon).borderRadius) || 0)
  context.fillStyle = getComputedStyle(icon).backgroundColor
  context.beginPath()
  context.roundRect(0, 0, 48, 48, radius)
  context.fill()
  if (image?.complete && image.naturalWidth > 0) {
    context.save()
    context.beginPath()
    context.roundRect(0, 0, 48, 48, radius)
    context.clip()
    context.drawImage(image, 0, 0, 48, 48)
    context.restore()
  } else if (mark) {
    context.fillStyle = getComputedStyle(mark).color
    context.font = `700 ${Math.min(25, Number.parseFloat(getComputedStyle(mark).fontSize) || 21)}px system-ui`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(mark.textContent?.trim().slice(0, 5) ?? '', 24, 24, 42)
  }
  let pixels: ImageData
  try {
    pixels = context.getImageData(0, 0, 48, 48)
  } catch {
    return []
  }
  const stride = Math.max(4, Math.ceil(Math.sqrt((48 * 48 * iconCount) / 900)))
  const result: IconParticle[] = []
  const stepDelay = (iconIndex / Math.max(1, iconCount - 1)) * 90
  for (let y = 1; y < 48; y += stride) {
    for (let x = 1; x < 48; x += stride) {
      const offset = (y * 48 + x) * 4
      const alpha = pixels.data[offset + 3] / 255
      if (alpha < 0.12 || Math.random() > 0.88) continue
      const angle = Math.random() * Math.PI * 2
      const speed = 24 + Math.random() * 95
      result.push({
        x: bounds.left + (x / 48) * bounds.width,
        y: bounds.top + (y / 48) * bounds.height,
        vx: Math.cos(angle) * speed - direction * (20 + Math.random() * 54),
        vy: Math.sin(angle) * speed - 18,
        size: 1.5 + Math.random() * 3.5,
        color: `rgba(${pixels.data[offset]}, ${pixels.data[offset + 1]}, ${pixels.data[offset + 2]}, ${alpha})`,
        delay: stepDelay,
      })
    }
  }
  return result
}

function playParticleTransition(pageIndex: number, direction: number, duration: number) {
  const page = gridViewport.value?.querySelector<HTMLElement>(`.shortcut-page[data-page-index="${pageIndex}"]:not([data-clone="true"])`)
  const icons = [...(page?.querySelectorAll<HTMLElement>('.shortcut-icon') ?? [])]
  if (!icons.length) return
  const particles = icons.flatMap((icon, index) => iconParticles(icon, direction, index, icons.length))
  if (!particles.length) return
  cancelParticleTransition()
  const canvas = document.createElement('canvas')
  canvas.id = 'shortcut-particle-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '4', pointerEvents: 'none' })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * pixelRatio)
  canvas.height = Math.round(window.innerHeight * pixelRatio)
  document.body.append(canvas)
  const context = canvas.getContext('2d')
  if (!context) { canvas.remove(); return }
  context.scale(pixelRatio, pixelRatio)
  const startedAt = performance.now()
  const animationDuration = Math.max(260, duration)
  const animate = (now: number) => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight)
    let hasParticles = false
    for (const particle of particles) {
      const elapsed = now - startedAt - particle.delay
      if (elapsed < 0) { hasParticles = true; continue }
      const progress = Math.min(1, elapsed / animationDuration)
      if (progress >= 1) continue
      hasParticles = true
      const eased = 1 - (1 - progress) ** 2
      context.globalAlpha = (1 - progress) ** 1.4
      context.fillStyle = particle.color
      context.shadowColor = particle.color
      context.shadowBlur = 7 * (1 - progress)
      context.fillRect(particle.x + particle.vx * eased * 0.48, particle.y + particle.vy * eased * 0.48 + 34 * progress * progress, particle.size * (1 - progress * 0.55), particle.size * (1 - progress * 0.55))
    }
    context.globalAlpha = 1
    context.shadowBlur = 0
    if (hasParticles) particleFrame = requestAnimationFrame(animate)
    else { canvas.remove(); particleFrame = 0 }
  }
  particleFrame = requestAnimationFrame(animate)
}

function cancelParticleTransition() {
  if (particleFrame) cancelAnimationFrame(particleFrame)
  particleFrame = 0
  document.getElementById('shortcut-particle-canvas')?.remove()
}

function cancelTransitionTimers() {
  if (transitionTimer) window.clearTimeout(transitionTimer)
  if (trackSettleTimer) window.clearTimeout(trackSettleTimer)
  if (resetFrame) cancelAnimationFrame(resetFrame)
  resetFrame = 0
  cancelParticleTransition()
}

function completeTrackTransition() {
  if (!trackTransitionPending) return
  trackTransitionPending = false
  if (trackSettleTimer) window.clearTimeout(trackSettleTimer)
  trackSettleTimer = 0
}

function finishTrackReset() {
  if (props.transitionEffect === 'particles' || pages.value.length < 2) {
    completeTrackTransition()
    return
  }
  const centeredPage = centeredPhysicalPage()
  if (physicalPage.value === centeredPage) {
    completeTrackTransition()
    return
  }
  resettingTrack.value = true
  physicalPage.value = centeredPage
  if (resetFrame) cancelAnimationFrame(resetFrame)
  resetFrame = requestAnimationFrame(() => {
    resetFrame = requestAnimationFrame(() => {
      resettingTrack.value = false
      trackOffsetPx.value = 0
      resetFrame = 0
      completeTrackTransition()
    })
  })
}

function readTrackTranslateX(track: HTMLElement) {
  const transform = getComputedStyle(track).transform
  if (transform === 'none') return 0
  const values = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number)
  return transform.startsWith('matrix3d') ? values[12] ?? 0 : values[4] ?? 0
}

function rebaseTrackIfNeeded() {
  const pageCount = pages.value.length
  if (props.transitionEffect === 'particles' || pageCount < 2) return
  const lowerLimit = pageCount
  const upperLimit = pageCount * (cycleCount - 1)
  if (physicalPage.value >= lowerLimit && physicalPage.value < upperLimit) return

  const track = gridViewport.value?.querySelector<HTMLElement>('.shortcut-pages')
  const viewportWidth = gridViewport.value?.getBoundingClientRect().width ?? 0
  const targetBeforeRebase = physicalPage.value
  const targetAfterRebase = centeredPhysicalPage()
  if (!track || !viewportWidth) {
    physicalPage.value = targetAfterRebase
    return
  }

  // Shift by whole page cycles while preserving the exact in-flight visual position.
  const currentX = readTrackTranslateX(track)
  trackOffsetPx.value = currentX + targetBeforeRebase * viewportWidth
  resettingTrack.value = true
  physicalPage.value = targetAfterRebase
  if (rebaseFrame) cancelAnimationFrame(rebaseFrame)
  rebaseFrame = requestAnimationFrame(() => {
    resettingTrack.value = false
    trackOffsetPx.value = 0
    rebaseFrame = 0
  })
}

function settleTrackTransition() {
  if (!trackTransitionPending) return
  if (trackSettleTimer) window.clearTimeout(trackSettleTimer)
  trackSettleTimer = 0
  finishTrackReset()
}

function scheduleTrackSettleFallback() {
  if (!trackTransitionPending) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const configuredDuration = Math.max(0, props.transitionDuration)
  const trackDuration = reducedMotion && props.transitionEffect === 'trails'
    ? Math.min(configuredDuration, 1200)
    : configuredDuration
  const visualDuration = props.transitionEffect === 'trails'
    ? (reducedMotion ? Math.min(1200, Math.max(420, configuredDuration)) : Math.max(260, configuredDuration))
    : 0
  trackSettleTimer = window.setTimeout(settleTrackTransition, Math.max(trackDuration, visualDuration) + 180)
}

function handleTrackTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
  settleTrackTransition()
}

watch(() => props.currentPage, (pageIndex, previousPage) => {
  if (pageIndex === previousPage) return
  cancelTransitionTimers()
  if (rebaseFrame) {
    cancelAnimationFrame(rebaseFrame)
    rebaseFrame = 0
    resettingTrack.value = false
    trackOffsetPx.value = 0
  }
  trackTransitionPending = true
  resettingTrack.value = false
  const direction = props.transitionDirection < 0 ? -1 : 1
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reducedMotion ? Math.min(1200, Math.max(420, props.transitionDuration)) : Math.max(260, props.transitionDuration)
  incomingPage.value = props.transitionEffect === 'particles' ? pageIndex : undefined
  if (props.transitionEffect !== 'slide') {
    outgoingPage.value = {
      index: props.transitionEffect === 'particles' ? previousPage : physicalPage.value,
      effect: props.transitionEffect,
      direction,
      duration,
    }
    if (props.transitionEffect === 'particles') playParticleTransition(previousPage, direction, duration)
    if (props.transitionEffect === 'trails') transitionTimer = window.setTimeout(() => {
      outgoingPage.value = undefined
      transitionTimer = 0
    }, duration + 160)
  }

  if (props.transitionEffect === 'particles') {
    physicalPage.value = pageIndex
    const particleDuration = Math.max(duration + 140, 1220)
    transitionTimer = window.setTimeout(() => {
      outgoingPage.value = undefined
      incomingPage.value = undefined
      transitionTimer = 0
      completeTrackTransition()
    }, particleDuration)
    return
  }
  physicalPage.value += direction
  rebaseTrackIfNeeded()
  scheduleTrackSettleFallback()
})

watch(() => [pages.value.length, props.transitionEffect] as const, () => {
  cancelTransitionTimers()
  if (rebaseFrame) cancelAnimationFrame(rebaseFrame)
  rebaseFrame = 0
  trackTransitionPending = false
  outgoingPage.value = undefined
  incomingPage.value = undefined
  resettingTrack.value = true
  trackOffsetPx.value = 0
  physicalPage.value = props.transitionEffect === 'particles' ? props.currentPage : centeredPhysicalPage()
  if (resetFrame) cancelAnimationFrame(resetFrame)
  resetFrame = requestAnimationFrame(() => {
    resettingTrack.value = false
    resetFrame = 0
  })
}, { flush: 'post' })

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
  const direction = clientX < bounds.left + 26 && pages.value.length > 1
    ? -1
    : clientX > bounds.right - 26 && pages.value.length > 1 ? 1 : 0
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
    suppressNextClick()
  } else if (pointer.type === 'touch' && !pointer.dragging && Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
    emit('swipe', deltaX < 0 ? 1 : -1)
    suppressNextClick()
  }
  draggingId.value = ''
  pointer = undefined
  cleanPointer()
}

function suppressNextClick() {
  suppressClick = true
  if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
  suppressClickTimer = window.setTimeout(() => {
    suppressClick = false
    suppressClickTimer = 0
  }, 100)
}

function cancelPointer() {
  draggingId.value = ''
  pointer = undefined
  cleanPointer()
}

function openContextMenu(event: MouseEvent, item: LauncherItem) {
  if (!item.shortcut && !item.folder) {
    closeContextMenu()
    return
  }
  event.preventDefault()
  showContextMenu(item, event.clientX, event.clientY)
}

function openContextMenuKeyboard(event: KeyboardEvent, item: LauncherItem) {
  if ((event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) || (!item.shortcut && !item.folder)) return
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
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
    suppressClickTimer = 0
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
  cancelTransitionTimers()
  if (rebaseFrame) cancelAnimationFrame(rebaseFrame)
  if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
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
        <Folder v-else-if="draggedItem.folder" :size="35" :stroke-width="2.2" />
        <span v-else class="shortcut-mark">{{ draggedItem.mark }}</span>
        <span v-if="draggedItem.badge" class="shortcut-badge">{{ draggedItem.badge }}</span>
      </span>
      <span v-if="showNames" class="shortcut-name">{{ draggedItem.title }}</span>
    </div>
    <div ref="gridViewport" class="shortcut-grid-viewport">
      <div
        class="shortcut-pages"
        :class="{
          'motion-opt-in': transitionEffect !== 'slide',
          'particles-mode': transitionEffect === 'particles',
          'is-resetting': resettingTrack,
        }"
        :style="{ transform: transitionEffect === 'particles' ? 'none' : `translate3d(calc(-${physicalPage * 100}% + ${trackOffsetPx}px), 0, 0)` }"
        @transitionend="handleTrackTransitionEnd"
      >
          <section
            v-for="(renderPage, renderIndex) in displayPages"
            :key="renderIndex"
            class="shortcut-page"
          :class="{
            'particles-out': !renderPage.clone && outgoingPage?.index === renderPage.pageIndex && outgoingPage.effect === 'particles',
            'particles-in': incomingPage === renderPage.pageIndex && transitionEffect === 'particles',
            'trails-out': outgoingPage?.index === renderPage.trackIndex && outgoingPage.effect === 'trails',
            'trails-to-next': outgoingPage?.index === renderPage.trackIndex && outgoingPage.effect === 'trails' && outgoingPage.direction > 0,
            'trails-to-previous': outgoingPage?.index === renderPage.trackIndex && outgoingPage.effect === 'trails' && outgoingPage.direction < 0,
          }"
            :data-page-index="renderPage.pageIndex"
          :data-render-index="renderPage.trackIndex"
            :data-clone="String(renderPage.clone)"
          :aria-hidden="transitionEffect === 'particles' ? renderPage.pageIndex !== currentPage : renderPage.trackIndex !== physicalPage"
          :inert="transitionEffect === 'particles' ? renderPage.pageIndex !== currentPage : renderPage.trackIndex !== physicalPage"
          :style="{
            '--grid-columns': columns,
            '--shortcut-size': `${iconSize}px`,
            '--shortcut-radius': `${iconRadius}px`,
            '--outgoing-duration': `${outgoingPage?.duration ?? 0}ms`,
            '--incoming-duration': `${outgoingPage?.duration ?? transitionDuration}ms`,
          }"
          >
          <article
            v-for="(item, itemIndex) in renderPage.items"
            :key="item.id"
            class="shortcut-cell"
            :class="{ dragging: draggingId === item.id }"
            :data-item-id="item.id"
            :style="{ '--entry-index': itemIndex }"
            @pointerdown="onPointerDown($event, item)"
            @contextmenu="openContextMenu($event, item)"
          >
            <button class="shortcut-open" type="button" :aria-label="`打开${item.title}`" :aria-haspopup="item.folder ? 'dialog' : item.shortcut ? 'menu' : undefined" @click="openItem($event, item)" @keydown="openContextMenuKeyboard($event, item)">
              <span class="shortcut-icon" :class="{ builtin: item.action }" :style="{ backgroundColor: item.color }">
                <img v-if="item.icon" class="shortcut-picture" :src="item.icon" alt="" draggable="false" />
                <component v-else-if="item.action" :is="itemIcons[item.action]" :size="35" :stroke-width="2.6" />
                <Folder v-else-if="item.folder" :size="35" :stroke-width="2.2" />
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
      <button type="button" role="menuitem" @click="editContextItem"><Pencil :size="14" /> 编辑{{ contextItem.folder ? '文件夹' : '快捷入口' }}</button>
      <button type="button" role="menuitem" class="danger" @click="removeContextItem"><Trash2 :size="14" /> 删除{{ contextItem.folder ? '文件夹' : '快捷入口' }}</button>
    </div>
  </div>
</template>
