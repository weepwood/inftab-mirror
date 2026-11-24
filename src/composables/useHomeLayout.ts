import { computed, type Ref } from 'vue'
import type { LauncherItem, Preferences } from '../types'

export function useHomeLayout({ preferences, viewport, layoutColumns, allLauncherItems, homeDockItems, pageCount, minimalMode, localSearchMode }: {
  preferences: Readonly<Ref<Preferences>>
  viewport: Ref<{ width: number; height: number }>
  layoutColumns: Readonly<Ref<number>>
  allLauncherItems: Readonly<Ref<LauncherItem[]>>
  homeDockItems: Readonly<Ref<LauncherItem[]>>
  pageCount: Readonly<Ref<number>>
  minimalMode: Ref<boolean>
  localSearchMode: Ref<boolean>
}) {
  const showHomeWidgets = computed(() => preferences.value.homeWidgetIds.length > 0)
  const shortHomeScrollEnabled = computed(() => !minimalMode.value && (showHomeWidgets.value || homeDockItems.value.length > 0) && viewport.value.height <= 560)
  const homeWidgetRows = computed(() => {
    if (!showHomeWidgets.value || viewport.value.width <= 780) return showHomeWidgets.value ? 1 : 0
    const shelfWidth = Math.min(Math.max(0, viewport.value.width - 64), 960)
    const columns = Math.max(1, Math.floor((shelfWidth + 12) / 252))
    let rows = 1
    let occupiedColumns = 0
    for (const id of preferences.value.homeWidgetIds) {
      const size = preferences.value.homeWidgetSizes[id]
      const span = size === 'full' ? columns : size === 'wide' ? Math.min(2, columns) : 1
      if (occupiedColumns + span > columns) {
        rows += 1
        occupiedColumns = 0
      }
      occupiedColumns += span
    }
    return rows
  })
  const compactRows = computed(() => Math.min(preferences.value.rows, Math.max(1, Math.ceil(allLauncherItems.value.length / layoutColumns.value))))
  const fitMetrics = computed(() => {
    const { width, height } = viewport.value
    const mobile = width <= 780
    const smallMobile = width <= 480
    const compactHeight = height <= 680
    const veryShortHeight = height <= 560
    const rows = compactRows.value
    const topPadding = veryShortHeight ? 38 : compactHeight ? Math.min(64, Math.max(48, height * 0.09)) : mobile ? Math.min(128, Math.max(80, height * 0.14)) : Math.min(112, Math.max(80, height * 0.1))
    const clockSize = compactHeight ? 40 : showHomeWidgets.value ? 48 : mobile ? 64 : height <= 800 ? 72 : 88
    const clockBottomGap = compactHeight ? 16 : 28
    const clockClearance = preferences.value.showClock && !veryShortHeight ? clockSize + 12 + 20 + clockBottomGap : 0
    const searchVisible = preferences.value.showSearchBar || localSearchMode.value || minimalMode.value
    const tabHeight = searchVisible && !localSearchMode.value && preferences.value.visibleSearchModes.length ? (veryShortHeight ? 26 : smallMobile ? 28 : 33) : 0
    const searchHeight = searchVisible ? Math.min(preferences.value.searchHeight, veryShortHeight ? 44 : mobile ? 48 : 100) : 0
    const configuredTopGap = searchVisible ? preferences.value.gridTopGap * (mobile && !compactHeight ? 0.68 : 1) : 0
    const gridTopGap = veryShortHeight ? Math.min(configuredTopGap, 16) : compactHeight ? Math.min(configuredTopGap, 28) : configuredTopGap
    const paginationHeight = pageCount.value > 1 ? (veryShortHeight ? 31 : compactHeight ? 37 : mobile ? 43 : 48) : 0
    const nameHeight = preferences.value.showNames ? (smallMobile ? 13 : 17) + 7 : 0
    const footerClearance = veryShortHeight ? 24 : 38
    const workspaceTabsClearance = 46
    const dockClearance = homeDockItems.value.length ? 76 : 0
    const widgetClearance = showHomeWidgets.value && !shortHomeScrollEnabled.value
      ? homeWidgetRows.value * 112 + Math.max(0, homeWidgetRows.value - 1) * 12 + 22
      : 0
    const available = height - topPadding - clockClearance - widgetClearance - dockClearance - workspaceTabsClearance - tabHeight - searchHeight - gridTopGap - paginationHeight - footerClearance - rows * nameHeight
    const requestedGap = Math.min(preferences.value.gridGapY, smallMobile ? 20 : mobile ? 24 : preferences.value.gridGapY)
    const fittedGap = rows > 1 ? Math.min(requestedGap, Math.max(4, (available - rows * Math.min(preferences.value.iconSize, 48)) / (rows - 1))) : requestedGap
    const fittedIcon = Math.max(28, Math.min(preferences.value.iconSize, (available - (rows - 1) * fittedGap) / rows))
    return { fittedGap, fittedIcon, topPadding, clockSize, clockBottomGap }
  })
  const backgroundStyle = computed(() => {
    const value = preferences.value.customWallpaper.trim() || preferences.value.wallpaper
    const backgroundImage = value.startsWith('linear-gradient') ? value : `url("${value.replaceAll('"', '%22')}")`
    return {
      backgroundImage,
      '--page-shade': String(preferences.value.shade),
      '--home-top-padding': `${fitMetrics.value.topPadding}px`,
      '--clock-size': `${fitMetrics.value.clockSize}px`,
      '--clock-bottom-gap': `${fitMetrics.value.clockBottomGap}px`,
      '--grid-columns': String(layoutColumns.value),
      '--shortcut-size': `${preferences.value.iconSize}px`,
      '--shortcut-radius': `${preferences.value.iconRadius}px`,
      '--search-width': `${preferences.value.searchWidth}px`,
      '--search-height': `${preferences.value.searchHeight}px`,
      '--grid-top-gap': `${preferences.value.showSearchBar || localSearchMode.value || minimalMode.value ? preferences.value.gridTopGap : 16}px`,
      '--shortcut-gap-x': `${preferences.value.gridGapX}px`,
      '--shortcut-gap-y': `${fitMetrics.value.fittedGap}px`,
      '--fit-icon-size': `${fitMetrics.value.fittedIcon}px`,
      '--page-transition-duration': `${preferences.value.pageTransitionMs}ms`,
      '--hover-glow-strength': String(preferences.value.hoverGlow / 100),
    }
  })
  return { showHomeWidgets, shortHomeScrollEnabled, backgroundStyle }
}
