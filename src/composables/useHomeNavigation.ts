import { onScopeDispose, watch, type Ref } from 'vue'

export function useHomeNavigation({ currentPage, pageDirection, pageCount, minimalMode, shortHomeScrollEnabled, overlayOpen, launcherAnimating }: {
  currentPage: Ref<number>
  pageDirection: Ref<number>
  pageCount: Readonly<Ref<number>>
  minimalMode: Ref<boolean>
  shortHomeScrollEnabled: Readonly<Ref<boolean>>
  overlayOpen: Readonly<Ref<boolean>>
  launcherAnimating?: Readonly<Ref<boolean>>
}) {
  let homeTouchStart: { x: number; y: number; pointerId: number } | undefined
  let accumulated = 0
  let lastWheelTime = -Infinity
  const threshold = 100
  function resetWheel() {
    accumulated = 0
    lastWheelTime = -Infinity
  }
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
    homeTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }
  
  function finishHomeSwipe(event: PointerEvent) {
    if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
    if (overlayOpen.value || minimalMode.value) { cancelHomeSwipe(); return }
    const deltaX = event.clientX - homeTouchStart.x
    const deltaY = event.clientY - homeTouchStart.y
    cancelHomeSwipe()
    if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) commitPage(deltaX < 0 ? 1 : -1)
  }
  
  function handleHomeWheel(event: WheelEvent) {
    if (homeTouchStart || minimalMode.value || overlayOpen.value || pageCount.value < 2 || event.ctrlKey
      || (event.target instanceof Element && event.target.closest('.home-widget-shelf, .home-dock, .search-area'))) return
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (shortHomeScrollEnabled.value && !horizontal) return
    const delta = (horizontal ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? threshold : 1)
    if (!Number.isFinite(delta) || !delta || !event.cancelable) return
    event.preventDefault()
    if (launcherAnimating?.value) { resetWheel(); return }
    // WheelEvent does not identify a physical mouse versus a trackpad.
    // Treat all wheel input as discrete page navigation: below threshold,
    // never touch the visual offset and never commit on an idle timer.
    const now = performance.now()
    if (now - lastWheelTime > 220 || Math.sign(accumulated) !== Math.sign(delta)) accumulated = 0
    lastWheelTime = now
    if (Math.abs(delta) >= threshold) {
      accumulated = 0
      commitPage(Math.sign(delta))
      return
    }
    accumulated += delta
    if (Math.abs(accumulated) >= threshold) {
      const direction = Math.sign(accumulated)
      accumulated -= direction * threshold
      commitPage(direction)
    }
  }
  function cancelHomeSwipe() { homeTouchStart = undefined; resetWheel() }
  watch([overlayOpen, minimalMode, pageCount], cancelHomeSwipe, { flush: 'sync' })
  onScopeDispose(cancelHomeSwipe)
  return { movePage, goToPage, startHomeSwipe, finishHomeSwipe, handleHomeWheel, cancelHomeSwipe }
}
