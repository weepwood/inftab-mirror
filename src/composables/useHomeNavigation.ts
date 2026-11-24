import { onScopeDispose, type Ref } from 'vue'

export function useHomeNavigation({ currentPage, pageDirection, pageCount, minimalMode, shortHomeScrollEnabled, activePanel, shortcutDialog }: {
  currentPage: Ref<number>
  pageDirection: Ref<number>
  pageCount: Readonly<Ref<number>>
  minimalMode: Ref<boolean>
  shortHomeScrollEnabled: Readonly<Ref<boolean>>
  activePanel: Readonly<Ref<string | null>>
  shortcutDialog: Ref<boolean>
}) {
  let homeTouchStart: { x: number; y: number; pointerId: number } | undefined
  let homeWheelLocked = false
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  function movePage(direction: number) {
    if (pageCount.value < 2) return
    pageDirection.value = direction < 0 ? -1 : 1
    currentPage.value = (currentPage.value + direction + pageCount.value) % pageCount.value
  }
  
  function goToPage(page: number) {
    if (page === currentPage.value) return
    pageDirection.value = page > currentPage.value ? 1 : -1
    currentPage.value = page
  }
  
  function startHomeSwipe(event: PointerEvent) {
    if (minimalMode.value || event.pointerType !== 'touch' || (event.target instanceof Element && event.target.closest('.shortcut-cell, .home-widget-shelf, .home-dock, .search-area'))) return
    homeTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }
  
  function finishHomeSwipe(event: PointerEvent) {
    if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
    const deltaX = event.clientX - homeTouchStart.x
    const deltaY = event.clientY - homeTouchStart.y
    if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) movePage(deltaX < 0 ? 1 : -1)
    homeTouchStart = undefined
  }
  
  function handleHomeWheel(event: WheelEvent) {
    if (minimalMode.value || shortHomeScrollEnabled.value) return
    if (activePanel.value || shortcutDialog.value || homeWheelLocked
      || (event.target instanceof Element && event.target.closest('.home-widget-shelf, .home-dock, .search-area'))) return
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    const delta = horizontal ? event.deltaX : event.deltaY
    if (Math.abs(delta) <= 24) return
    event.preventDefault()
    movePage(delta > 0 ? 1 : -1)
    homeWheelLocked = true
    wheelTimer = setTimeout(() => { homeWheelLocked = false; wheelTimer = undefined }, 450)
  }
  function cancelHomeSwipe() { homeTouchStart = undefined }
  onScopeDispose(() => { if (wheelTimer !== undefined) clearTimeout(wheelTimer) })
  return { movePage, goToPage, startHomeSwipe, finishHomeSwipe, handleHomeWheel, cancelHomeSwipe }
}
