import { computed, ref, onScopeDispose, type Ref } from 'vue'
import type { LauncherItem } from '../types'

type DragEmit = {
  (event: 'dock', sourceId: string, targetId?: string): void
  (event: 'reorder', sourceId: string, targetId: string): void
  (event: 'swipe', direction: number): void
  (event: 'open', item: LauncherItem, mouseEvent?: MouseEvent): void
}

export function useShortcutDrag(props: { readonly items: LauncherItem[]; readonly dockItemIds?: string[] }, emit: DragEmit, gridViewport: Ref<HTMLElement | undefined>, pages: Readonly<Ref<LauncherItem[][]>>, moveAnnouncement: Ref<string>) {
  const draggingId = ref('')
  const dragPosition = ref({ x: 0, y: 0 })
  const draggedItem = computed(() => props.items.find((item) => item.id === draggingId.value))
  let pointer: {
    id: number
    type: string
    x: number
    y: number
    clientX: number
    clientY: number
    sourceId: string
    targetId: string
    dockTargetId?: string
    dragging: boolean
    scrolling: boolean
    scrollContainer?: HTMLElement
    scrollStartTop: number
    hold?: number
  } | undefined
  let suppressClick = false
  let suppressClickTimer = 0
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
    const scrollContainer = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest<HTMLElement>('.home.home-scrollable') ?? undefined
      : undefined
    pointer = {
      id: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      sourceId: item.id,
      targetId: item.id,
      dragging: false,
      scrolling: false,
      scrollContainer,
      scrollStartTop: scrollContainer?.scrollTop ?? 0,
    }
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
    if (pointer.type === 'touch' && !pointer.dragging && !pointer.scrolling) {
      if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (pointer.hold) window.clearTimeout(pointer.hold)
        pointer.hold = undefined
        return
      }
      if (pointer.scrollContainer && Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        if (pointer.hold) window.clearTimeout(pointer.hold)
        pointer.hold = undefined
        pointer.scrolling = true
      }
      if (Math.abs(deltaX) + Math.abs(deltaY) > 10) {
        if (!pointer.scrolling && !pointer.scrollContainer) {
          if (pointer.hold) window.clearTimeout(pointer.hold)
          pointer.hold = undefined
          startDrag()
        }
      }
    } else if (!pointer.dragging && !pointer.scrolling && Math.hypot(deltaX, deltaY) > 7) {
      startDrag()
    }
    if (pointer.scrolling) {
      event.preventDefault()
      pointer.scrollContainer!.scrollTop = pointer.scrollStartTop - deltaY
      return
    }
    if (!pointer.dragging) return
    event.preventDefault()
    dragPosition.value = { x: event.clientX, y: event.clientY }
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const inDock = hit?.closest('.home-dock')
    pointer.dockTargetId = hit?.closest<HTMLElement>('[data-dock-item-id]')?.dataset.dockItemId
    const target = inDock ? undefined : hit?.closest<HTMLElement>('[data-item-id]')
    if (target?.dataset.itemId) pointer.targetId = target.dataset.itemId
    if (!inDock) scheduleEdgePageTurn(event.clientX)
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
    if (pointer.scrolling) {
      suppressNextClick()
    } else if (pointer.dragging && document.elementFromPoint(event.clientX, event.clientY)?.closest('.home-dock')) {
      const sourceId = pointer.sourceId
      const title = props.items.find((item) => item.id === sourceId)?.title ?? '入口'
      const alreadyDocked = props.dockItemIds?.includes(sourceId) ?? false
      if (sourceId !== pointer.dockTargetId) emit('dock', sourceId, pointer.dockTargetId)
      moveAnnouncement.value = alreadyDocked
        ? `已调整${title}在 Dock 中的位置。`
        : `已将${title}固定到 Dock。`
      suppressNextClick()
    } else if (pointer.dragging && pointer.sourceId !== pointer.targetId) {
      emit('reorder', pointer.sourceId, pointer.targetId)
      suppressNextClick()
    } else if (pointer.type === 'touch' && !pointer.dragging && Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      emit('swipe', deltaX < 0 ? 1 : -1)
      suppressNextClick()
    }
    draggingId.value = ''
    cleanPointer()
    pointer = undefined
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
    cleanPointer()
    pointer = undefined
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
    emit('open', item, event)
  }
  onScopeDispose(() => {
    cleanPointer()
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
  })
  return { draggingId, dragPosition, draggedItem, onPointerDown, openItem }
}
