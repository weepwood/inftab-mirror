import { onScopeDispose, ref, watch, type Ref } from 'vue'

export function useHomeNavigation({ currentPage, pageDirection, pageCount, minimalMode, shortHomeScrollEnabled, overlayOpen }: {
  currentPage: Ref<number>
  pageDirection: Ref<number>
  pageCount: Readonly<Ref<number>>
  minimalMode: Ref<boolean>
  shortHomeScrollEnabled: Readonly<Ref<boolean>>
  overlayOpen: Readonly<Ref<boolean>>
}) {
  let homeTouchStart: { x: number; y: number; pointerId: number; lastX: number; time: number } | undefined
  const wheelOffset = ref(0)
  let accumulated = 0
  let lastWheelTime = 0
  let speed = 0
  let frame = 0
  const threshold = 100
  function resetWheel() {
    clearTimeout(wheelTimer)
    cancelAnimationFrame(frame)
    frame = accumulated = speed = lastWheelTime = 0
    wheelOffset.value = 0
  }
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  function movePage(direction: number) {
    resetWheel()
    commitPage(direction)
  }
  function commitPage(direction: number) {
    if (pageCount.value < 2 || !direction) return
    pageDirection.value = direction < 0 ? -1 : 1
    currentPage.value = (currentPage.value + direction + pageCount.value) % pageCount.value
  }
  
  function goToPage(page: number) {
    if (page === currentPage.value) return
    const count = pageCount.value
    const forward = (page - currentPage.value + count) % count
    movePage(forward <= count / 2 ? forward : forward - count)
  }
  
  function startHomeSwipe(event: PointerEvent) {
    if (overlayOpen.value || minimalMode.value || pageCount.value < 2 || event.pointerType !== 'touch' || event.isPrimary === false || (event.target instanceof Element && event.target.closest('.shortcut-cell, .home-widget-shelf, .home-dock, .search-area, button, a, input'))) return
    resetWheel()
    homeTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, lastX: event.clientX, time: performance.now() }
  }
  
  function moveHomeSwipe(event: PointerEvent) {
    if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
    const x = event.clientX - homeTouchStart.x
    const y = event.clientY - homeTouchStart.y
    const now = performance.now()
    speed = (event.clientX - homeTouchStart.lastX) / Math.max(8, now - homeTouchStart.time)
    homeTouchStart.lastX = event.clientX
    homeTouchStart.time = now
    wheelOffset.value = Math.abs(x) > Math.abs(y) * 1.25
      ? Math.max(-.85, Math.min(.85, x / Math.max(160, window.innerWidth * .5)))
      : 0
  }
  function finishHomeSwipe(event: PointerEvent) {
    if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
    if (overlayOpen.value || minimalMode.value) { cancelHomeSwipe(); return }
    const deltaX = event.clientX - homeTouchStart.x
    const deltaY = event.clientY - homeTouchStart.y
    const elapsed = performance.now() - homeTouchStart.time
    const projection = elapsed < 120 ? Math.min(28, Math.max(0, Math.sign(deltaX) * speed * 24 * Math.exp(-elapsed / 48))) : 0
    cancelHomeSwipe()
    if (Math.abs(deltaX) >= 32 && Math.abs(deltaX) + projection > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) commitPage(deltaX < 0 ? 1 : -1)
  }
  
  function handleHomeWheel(event: WheelEvent) {
    if (minimalMode.value || overlayOpen.value || pageCount.value < 2 || event.ctrlKey
      || (event.target instanceof Element && event.target.closest('.home-widget-shelf, .home-dock, .search-area'))) return
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (shortHomeScrollEnabled.value && !horizontal) return
    const delta = (horizontal ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? threshold : 1)
    if (!Number.isFinite(delta) || !delta || !event.cancelable) return
    event.preventDefault()
    // Discrete wheel notches remain one-page actions; preserve the fractional
    // remainder of high-resolution input instead of discarding it at each turn.
    if (Math.abs(delta) >= threshold) {
      movePage(Math.sign(delta))
      return
    }
    const now = performance.now()
    speed = lastWheelTime && now - lastWheelTime < 100 ? delta / Math.max(16, now - lastWheelTime) : 0
    lastWheelTime = now
    accumulated += delta
    if (Math.abs(accumulated) >= threshold) {
      const direction = Math.sign(accumulated)
      accumulated -= direction * threshold
      commitPage(direction)
      wheelOffset.value = -accumulated / threshold
    }
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0
      wheelOffset.value = -accumulated / threshold
    })
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      const direction = Math.sign(accumulated)
      if (Math.abs(accumulated) >= 36 && Math.abs(accumulated) + Math.max(-20, Math.min(20, direction * speed * 24)) >= 40) movePage(direction)
      else resetWheel()
    }, 100)
  }
  function cancelHomeSwipe() { homeTouchStart = undefined; resetWheel() }
  watch([overlayOpen, minimalMode, pageCount], cancelHomeSwipe, { flush: 'sync' })
  onScopeDispose(cancelHomeSwipe)
  return { wheelOffset, movePage, goToPage, startHomeSwipe, moveHomeSwipe, finishHomeSwipe, handleHomeWheel, cancelHomeSwipe }
}
