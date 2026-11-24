<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Folder } from '@lucide/vue'
import { launcherIcons } from './launcherIcons'
import { maxDockItems, type LauncherItem, type PageTransitionEffect } from '../types'
import { useShortcutDrag } from '../composables/useShortcutDrag'
import { useShortcutParticles } from '../composables/useShortcutParticles'
import { splitShortcutPages, reservedShortcutRows } from '../data/shortcutPagination'

const ShortcutContextMenu = defineAsyncComponent(() => import('./ShortcutContextMenu.vue'))

const props = defineProps<{
  items: LauncherItem[]
  folderShortcuts?: LauncherItem[]
  dockItemIds?: string[]
  columns: number
  rows: number
  iconSize: number
  iconRadius: number
  showNames: boolean
  currentPage: number
  transitionDirection: number
  transitionEffect: PageTransitionEffect
  transitionDuration: number
  wheelOffset?: number
}>()

const emit = defineEmits<{
  open: [item: LauncherItem, event?: MouseEvent]
  edit: [item: LauncherItem]
  remove: [item: LauncherItem]
  toggleDock: [id: string]
  dock: [sourceId: string, targetId?: string]
  reorder: [sourceId: string, targetId: string]
  moveByKeyboard: [itemId: string, direction: -1 | 1]
  swipe: [direction: number]
}>()

const pageSize = computed(() => props.columns * props.rows)
const reservedRows = computed(() => reservedShortcutRows(props.items.length, props.columns, props.rows))
const cycleCount = 5
const centerCycle = Math.floor(cycleCount / 2)
const pages = computed(() => splitShortcutPages(props.items, pageSize.value))
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
const moveAnnouncement = ref('')
const failedIconUrls = ref(new Map<string, string>())
let contextMenuTrigger: HTMLElement | undefined
const gridViewport = ref<HTMLElement>()
const { draggingId, dragPosition, draggedItem, onPointerDown, openItem } = useShortcutDrag(props, emit, gridViewport, pages, moveAnnouncement)
const outgoingPage = ref<{ index: number; effect: PageTransitionEffect; direction: number; duration: number }>()
const incomingPage = ref<number>()
const physicalPage = ref(props.transitionEffect === 'particles' ? props.currentPage : centeredPhysicalPage())
const trackOffsetPx = ref(0)
const resettingTrack = ref(false)
let transitionTimer = 0
let trackSettleTimer = 0
let trackTransitionPending = false
let resetFrame = 0
let rebaseFrame = 0

const { playParticleTransition, cancelParticleTransition } = useShortcutParticles(gridViewport)

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

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scheduleTrackSettleFallback() {
  if (!trackTransitionPending) return
  const reducedMotion = prefersReducedMotion()
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
  const focusedButton = document.activeElement instanceof HTMLElement
    ? document.activeElement.closest<HTMLElement>('.shortcut-open')
    : null
  const focusedItemId = focusedButton?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
  const focusedItemIndex = focusedItemId ? props.items.findIndex((item) => item.id === focusedItemId) : -1
  if (focusedItemIndex >= 0 && props.items.length > 0) {
    const slot = focusedItemIndex % pageSize.value
    const targetIndex = Math.min(pageIndex * pageSize.value + slot, props.items.length - 1)
    const targetId = props.items[targetIndex]?.id
    if (targetId) void nextTick(() => {
      const buttons = Array.from(gridViewport.value?.querySelectorAll<HTMLElement>('.shortcut-open') ?? [])
      const targetButton = buttons
        .find((button) => button.closest<HTMLElement>('[data-item-id]')?.dataset.itemId === targetId
          && button.closest('.shortcut-page[aria-hidden="false"]'))
      targetButton?.focus()
    })
  }
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
  const duration = prefersReducedMotion()
    ? Math.min(1200, Math.max(420, props.transitionDuration))
    : Math.max(260, props.transitionDuration)
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
  const count = pages.value.length
  const distance = direction > 0 ? (pageIndex - previousPage + count) % count : (previousPage - pageIndex + count) % count
  if (distance > 1 && props.transitionEffect === 'slide') {
    resettingTrack.value = true
    physicalPage.value = centeredPhysicalPage()
    resetFrame = requestAnimationFrame(() => {
      resettingTrack.value = false
      resetFrame = 0
      completeTrackTransition()
    })
    return
  }
  physicalPage.value += direction * distance
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

watch(() => [...props.items, ...(props.folderShortcuts ?? [])].map((item) => [item.id, item.icon] as const), (icons) => {
  if (!failedIconUrls.value.size) return
  const currentIcons = new Map(icons.filter(([, icon]) => icon).map(([id, icon]) => [id, icon!]))
  const failed = new Map([...failedIconUrls.value].filter(([id, url]) => currentIcons.get(id) === url))
  if (failed.size !== failedIconUrls.value.size) failedIconUrls.value = failed
})

function openContextMenu(event: MouseEvent, item: LauncherItem) {
  if (!item.shortcut && !item.folder) {
    closeContextMenu()
    return
  }
  event.preventDefault()
  showContextMenu(item, event.clientX, event.clientY, event.currentTarget as HTMLElement)
}

function openContextMenuKeyboard(event: KeyboardEvent, item: LauncherItem) {
  if ((event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) || (!item.shortcut && !item.folder)) return
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  showContextMenu(item, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, event.currentTarget as HTMLElement)
}

function handleShortcutKeydown(event: KeyboardEvent, item: LauncherItem) {
  if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const currentIndex = props.items.findIndex((candidate) => candidate.id === item.id)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0) return
    if (nextIndex < 0 || nextIndex >= props.items.length) {
      moveAnnouncement.value = direction < 0 ? '已经是第一个入口。' : '已经是最后一个入口。'
      return
    }
    emit('moveByKeyboard', item.id, direction)
    moveAnnouncement.value = `已将${item.title}移动到第${nextIndex + 1}个位置。`
    return
  }
  openContextMenuKeyboard(event, item)
}

function showContextMenu(item: LauncherItem, x: number, y: number, trigger: HTMLElement) {
  const width = 164
  const height = item.shortcut ? 166 : 130
  contextPosition.value = {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  }
  contextMenuTrigger = trigger
  contextItem.value = item
}

function closeContextMenu(restoreFocus = false) {
  const trigger = contextMenuTrigger
  contextMenuTrigger = undefined
  contextItem.value = undefined
  if (restoreFocus && trigger?.isConnected) void nextTick(() => trigger.focus())
}

function handleWindowClick() {
  closeContextMenu()
}

function hasUsableIcon(item: LauncherItem) {
  return Boolean(item.icon && failedIconUrls.value.get(item.id) !== item.icon)
}

const folderShortcutIndex = computed(() => new Map((props.folderShortcuts ?? []).map(item => [item.id, item])))
const folderPreviews = computed(() => new Map(props.items.flatMap(item => {
  if (!item.folder) return []
  const previews: LauncherItem[] = []
  for (const id of item.folder.shortcutIds) {
    const shortcut = folderShortcutIndex.value.get(id)
    if (shortcut) previews.push(shortcut)
    if (previews.length === 4) break
  }
  return [[item.id, previews] as const]
})))
const emptyPreview: LauncherItem[] = []
function folderPreviewItems(item: LauncherItem) { return folderPreviews.value.get(item.id) ?? emptyPreview }

function handleIconError(item: LauncherItem) {
  if (!item.icon) return
  const failed = new Map(failedIconUrls.value)
  failed.set(item.id, item.icon)
  failedIconUrls.value = failed
}

function editContextItem() {
  if (contextItem.value) emit('edit', contextItem.value)
  closeContextMenu(true)
}

function removeContextItem() {
  if (contextItem.value) emit('remove', contextItem.value)
  closeContextMenu(true)
}

function toggleDockContextItem() {
  const item = contextItem.value
  if (!item) return
  const dockItemIds = props.dockItemIds ?? []
  if (dockItemIds.includes(item.id)) {
    emit('toggleDock', item.id)
    moveAnnouncement.value = `已将${item.title}从 Dock 移除。`
  } else if (dockItemIds.length < maxDockItems) {
    emit('toggleDock', item.id)
    moveAnnouncement.value = `已将${item.title}固定到 Dock。`
  } else {
    moveAnnouncement.value = `Dock 最多固定 ${maxDockItems} 个入口。`
  }
  closeContextMenu(true)
}

async function copyContextItem() {
  const shortcut = contextItem.value?.shortcut
  if (!shortcut) return
  try {
    const extensionPermissions = (globalThis as typeof globalThis & {
      chrome?: { permissions?: { request: (permissions: { permissions: string[] }) => Promise<boolean> } }
    }).chrome?.permissions
    if (extensionPermissions && !(await extensionPermissions.request({ permissions: ['clipboardWrite'] }))) {
      throw new Error('Clipboard permission was not granted')
    }
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(shortcut.url)
    moveAnnouncement.value = `已复制${shortcut.title}的网址。`
  } catch {
    moveAnnouncement.value = '无法复制网址，请检查浏览器剪贴板权限。'
  }
  closeContextMenu(true)
}

function closeContextOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && contextItem.value) {
    event.preventDefault()
    closeContextMenu(true)
  }
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  window.addEventListener('keydown', closeContextOnEscape)
})
onBeforeUnmount(() => {
  cancelTransitionTimers()
  if (rebaseFrame) cancelAnimationFrame(rebaseFrame)
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('keydown', closeContextOnEscape)
})
</script>

<template>
  <div class="shortcut-grid-wrap" @click="closeContextMenu()">
    <span id="launcher-reorder-hint" class="visually-hidden">按 Shift 加左右方向键可调整此入口的位置。</span>
    <span class="visually-hidden" role="status" aria-live="polite">{{ moveAnnouncement }}</span>
    <div
      v-if="draggedItem"
      class="shortcut-drag-ghost"
      aria-hidden="true"
      :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px`, '--shortcut-size': `${iconSize}px`, '--shortcut-radius': `${iconRadius}px` }"
    >
      <span class="shortcut-icon" :class="{ builtin: draggedItem.action }" :data-action="draggedItem.action" :style="{ backgroundColor: draggedItem.action ? undefined : draggedItem.color }">
        <component v-if="draggedItem.action && launcherIcons[draggedItem.action]" :is="launcherIcons[draggedItem.action]" :size="35" :stroke-width="1.8" />
        <img v-else-if="hasUsableIcon(draggedItem)" class="shortcut-picture" :src="draggedItem.icon" decoding="async" alt="" draggable="false" @error="handleIconError(draggedItem)" />
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
          'is-wheel-tracking': Boolean(wheelOffset) && transitionEffect === 'slide',
        }"
        :style="{ transform: transitionEffect === 'particles' ? 'none' : `translate3d(calc(${(-physicalPage + (transitionEffect === 'slide' ? (wheelOffset ?? 0) : 0)) * 100}% + ${trackOffsetPx}px), 0, 0)` }"
        @transitionend="handleTrackTransitionEnd"
      >
          <section
            v-for="renderPage in displayPages"
            :key="renderPage.trackIndex"
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
            '--grid-rows': reservedRows,
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
            <button class="shortcut-open" type="button" :aria-label="`打开${item.title}`" aria-describedby="launcher-reorder-hint" aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight" :aria-haspopup="item.folder ? 'dialog' : item.shortcut ? 'menu' : undefined" @click="openItem($event, item)" @auxclick.middle.prevent="openItem($event, item)" @keydown="handleShortcutKeydown($event, item)">
              <span class="shortcut-icon" :class="{ builtin: item.action }" :data-action="item.action" :style="{ backgroundColor: item.action ? undefined : item.color }">
                <component v-if="item.action && launcherIcons[item.action]" :is="launcherIcons[item.action]" :size="35" :stroke-width="1.8" />
                <img v-else-if="hasUsableIcon(item)" class="shortcut-picture" :src="item.icon" decoding="async" alt="" draggable="false" @error="handleIconError(item)" />
                <span v-else-if="item.folder" class="folder-preview-grid">
                  <span v-for="shortcut in folderPreviewItems(item)" :key="shortcut.id" class="folder-preview-tile" :style="{ backgroundColor: shortcut.color }">
                    <img v-if="hasUsableIcon(shortcut)" :src="shortcut.icon" decoding="async" alt="" draggable="false" @error="handleIconError(shortcut)" />
                    <span v-else>{{ shortcut.mark }}</span>
                  </span>
                  <Folder v-if="!folderPreviewItems(item).length" :size="35" :stroke-width="2.2" />
                </span>
                <span v-else class="shortcut-mark">{{ item.mark }}</span>
                <span v-if="item.badge" class="shortcut-badge">{{ item.badge }}</span>
              </span>
              <span v-if="showNames" class="shortcut-name">{{ item.title }}</span>
            </button>
          </article>
        </section>
      </div>
    </div>

    <ShortcutContextMenu
      v-if="contextItem"
      :key="contextItem.id"
      :item="contextItem"
      :dock-item-ids="dockItemIds ?? []"
      :position="contextPosition"
      @close="closeContextMenu()"
      @edit="editContextItem"
      @copy="copyContextItem"
      @toggle-dock="toggleDockContextItem"
      @remove="removeContextItem"
    />
  </div>
</template>
