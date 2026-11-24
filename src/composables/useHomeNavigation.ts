import { onScopeDispose, ref, watch, type Ref } from 'vue'

export function useHomeNavigation({ currentPage, pageDirection, pageCount, minimalMode, shortHomeScrollEnabled, overlayOpen }: {
  currentPage: Ref<number>
  pageDirection: Ref<number>
  pageCount: Readonly<Ref<number>>
  minimalMode: Ref<boolean>
  shortHomeScrollEnabled: Readonly<Ref<boolean>>
  overlayOpen: Readonly<Ref<boolean>>
}) {
  let homeTouchStart: { x: number; y: number; pointerId: number } | undefined
  const wheelOffset = ref(0)
  let accumulated = 0
  let frame = 0
  const threshold = 100
  function resetWheel() {
    if (wheelTimer !== undefined) clearTimeout(wheelTimer)
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    wheelTimer = undefined
    accumulated = 0
    wheelOffset.value = 0
  }
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  function movePage(direction: number) {
    if (pageCount.value < 2) return
    resetWheel()
    pageDirection.value = direction < 0 ? -1 : 1
    currentPage.value = (currentPage.value + direction + pageCount.value) % pageCount.value
  }
  
  function goToPage(page: number) {
    if (page === currentPage.value) return
    resetWheel()
    const forward = (page - currentPage.value + pageCount.value) % pageCount.value
    pageDirection.value = forward <= pageCount.value / 2 ? 1 : -1
    currentPage.value = page
  }
  
  function startHomeSwipe(event: PointerEvent) {
    if (overlayOpen.value || minimalMode.value || event.pointerType !== 'touch' || (event.target instanceof Element && event.target.closest('.shortcut-cell, .home-widget-shelf, .home-dock, .search-area'))) return
    homeTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }
  
  function finishHomeSwipe(event: PointerEvent) {
    if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
    if (overlayOpen.value) { homeTouchStart = undefined; return }
    const deltaX = event.clientX - homeTouchStart.x
    const deltaY = event.clientY - homeTouchStart.y
    if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) movePage(deltaX < 0 ? 1 : -1)
    homeTouchStart = undefined
  }
  
  function handleHomeWheel(event: WheelEvent) {
    if (minimalMode.value || overlayOpen.value || pageCount.value < 2 || event.ctrlKey
      || (event.target instanceof Element && event.target.closest('.home-widget-shelf, .home-dock, .search-area'))) return
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (shortHomeScrollEnabled.value && !horizontal) return
    const delta = (horizontal ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? threshold : 1)
    if (!Number.isFinite(delta) || !delta || !event.cancelable) return
    event.preventDefault()
    accumulated += Math.max(-threshold, Math.min(threshold, delta))
    if (Math.abs(accumulated) >= threshold) {
      movePage(Math.sign(accumulated))
      return
    }
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0
      wheelOffset.value = -accumulated / threshold * 0.8
    })
    if (wheelTimer !== undefined) clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      if (Math.abs(accumulated) >= 40) movePage(Math.sign(accumulated))
      else resetWheel()
    }, 100)
  }
  function cancelHomeSwipe() { homeTouchStart = undefined }
  watch([overlayOpen, minimalMode, pageCount], resetWheel, { flush: 'sync' })
  onScopeDispose(resetWheel)
  return { wheelOffset, movePage, goToPage, startHomeSwipe, finishHomeSwipe, handleHomeWheel, cancelHomeSwipe }
}
