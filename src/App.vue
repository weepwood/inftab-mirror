<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { ArrowLeft, House, Menu, X } from '@lucide/vue'
import SearchBar from './components/SearchBar.vue'
import ClockWidget from './components/ClockWidget.vue'
import { lazyPluginComponent, retryAsyncLoad } from './plugins/asyncComponent'
import { useLocalWorkspace } from './composables/useLocalWorkspace'
import { storageWriteErrorEvent, storageWriteSuccessEvent } from './composables/useStoredState'
import { launcherItems } from './data/defaults'
import { maxImageUploadBytes } from './data/imageLimits'
import { buildSearchUrl } from './data/search'
import { getPageNavigation } from './data/pagination'
import { toLocalDateKey } from './data/calendar'
import { createLocalId } from './data/createId'
import { normalizeWebUrl } from './data/urls'
import { truncateCodePoints } from './data/text'
import type { BrowserTabCandidate } from './data/browserTabs'
import { launcherPanelRoutes, shortcutPanelRoutes } from './plugins/routes'
import type { PanelId, PanelPluginContext } from './plugins/registry'
import { maxDockItems, type HomeWidgetId, type HomeWidgetSize, type LauncherItem, type Shortcut, type ShortcutFolder } from './types'

type Panel = PanelId | null
interface LocalSearchMatch {
  item: LauncherItem
  folderTitle?: string
}

const ShortcutGrid = lazyPluginComponent(
  () => import('./components/ShortcutGrid.vue'),
  '正在加载快捷入口…',
  '快捷入口暂时无法加载，请重试。',
)
const HomeWidgetShelf = lazyPluginComponent(
  () => import('./components/HomeWidgetShelf.vue'),
  '正在加载首页组件…',
  '首页组件暂时无法加载。',
)
const HomeDock = lazyPluginComponent(
  () => import('./components/HomeDock.vue'),
  '正在加载常驻 Dock…',
  '常驻 Dock 暂时无法加载。',
)
const FolderDialog = lazyPluginComponent(
  () => import('./components/FolderDialog.vue'),
  '正在加载文件夹…',
  '文件夹暂时无法加载，请重试。',
)
const ConfirmDialog = lazyPluginComponent(
  () => import('./components/ConfirmDialog.vue'),
  '正在加载确认对话框…',
  '确认对话框暂时无法加载，请重试。',
)
const BrowserTabImport = lazyPluginComponent(
  () => import('./components/BrowserTabImport.vue'),
  '正在加载标签页导入…',
  '标签页导入暂时无法加载，请重试。',
)
const HomeWorkspaceTabs = lazyPluginComponent(
  () => import('./components/HomeWorkspaceTabs.vue'),
  '正在加载工作区…',
  '工作区暂时无法加载。',
)

const baseUrl = import.meta.env.BASE_URL
const {
  preferences,
  shortcuts,
  folders,
  launcherOrder,
  homeWorkspaces,
  activeHomeWorkspaceId,
  todos,
  habits,
  countdowns,
  notes,
  activeNoteId,
  weatherCity,
  focusTimer,
  customSearchEngines,
  saveShortcut: saveShortcutData,
  addShortcuts: addShortcutsData,
  removeShortcut: removeShortcutData,
  saveFolder: saveFolderData,
  removeFolder: removeFolderData,
  createHomeWorkspace,
  renameHomeWorkspace,
  moveHomeWorkspace,
  removeHomeWorkspace,
  reorderLauncherItems: reorderLauncherOrder,
  setVisibleLauncherOrder,
  addTodo,
  toggleTodo,
  updateTodo,
  removeTodo,
  clearCompletedTodos,
  addHabit,
  updateHabit,
  toggleHabitToday,
  removeHabit,
  addCountdown,
  updateCountdown,
  removeCountdown,
  addNote,
  updateNote,
  removeNote,
  updatePreferences,
  addCustomSearchEngine,
  removeCustomSearchEngine,
  resetPreferences,
  createBackup,
  restoreBackup,
  startFocusTimer,
  pauseFocusTimer,
  resetFocusTimer,
  setFocusDuration,
  tickFocusTimer,
} = useLocalWorkspace()

const query = ref('')
const localSearchMode = ref(false)
const minimalMode = ref(false)
const systemPrefersDark = ref(false)
const effectiveTheme = computed(() => preferences.value.themeMode === 'system'
  ? (systemPrefersDark.value ? 'dark' : 'light')
  : preferences.value.themeMode)
const currentPage = ref(0)
const pageDirection = ref(1)
const activePanel = ref<Panel>(null)
const panelRegistry = shallowRef<typeof import('./plugins/registry')>()
const panelRegistryError = ref('')
let panelRegistryLoading: Promise<void> | undefined
const backupExportError = ref('')
const storageError = ref('')
const failedStorageWriteKeys = new Set<string>()
const pendingDestructiveAction = ref<{ title: string; description: string; confirmLabel?: string; run: () => void }>()
let destructiveActionFocusTarget: HTMLElement | undefined
const searchBar = ref<{ focusSearch: () => void; showTranslationError: () => void }>()
const sidePanel = ref<HTMLElement>()
const shortcutDialogElement = ref<HTMLFormElement>()
const shortcutTitleInput = ref<HTMLInputElement>()
const folderDialogOpen = ref(false)
const activeFolder = ref<ShortcutFolder>()
const folderSaveError = ref('')
const shortcutDialog = ref(false)
let shortcutDialogReturnFocusTarget: HTMLElement | undefined
const editingId = ref('')
const shortcutWorkspaceId = ref('default')
const shortcutTitle = ref('')
const shortcutUrl = ref('https://')
const shortcutColor = ref('#3d82f6')
const shortcutMark = ref('')
const shortcutIcon = ref('')
const shortcutUrlError = ref('')
const shortcutSaveError = ref('')
const shortcutIconFile = ref<HTMLInputElement>()
const shortcutIconError = ref('')
const savingShortcut = ref(false)
const loadingShortcutIcon = ref(false)
let shortcutSaveRequestId = 0
let shortcutIconUploadRequestId = 0
const canImportBrowserTabs = location.protocol === 'chrome-extension:'
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const pageSize = computed(() => preferences.value.columns * preferences.value.rows)
const activeHomeWorkspace = computed(() => homeWorkspaces.value.find((workspace) => workspace.id === activeHomeWorkspaceId.value) ?? homeWorkspaces.value[0]!)
const activeHomeWorkspaceItemIds = computed(() => new Set(activeHomeWorkspace.value?.itemIds ?? []))
const shortcutLimitReached = computed(() => !editingId.value && shortcuts.value.length >= 500)
const folderLimitReached = computed(() => !activeFolder.value && folders.value.length >= 500)
let homeTouchStart: { x: number; y: number; pointerId: number } | undefined
let homeWheelLocked = false
let wallpaperRotationTimer: number | undefined
let wallpaperRotationRequest = 0
let focusTimerInterval: number | undefined
const availableLauncherItems = computed<LauncherItem[]>(() => {
  const items = [
    ...launcherItems.map((item) => item.id === 'todos'
      ? { ...item, icon: item.icon ? `${baseUrl}inftab-icons/${item.icon}` : undefined, badge: todos.value.filter((todo) => !todo.done).length || undefined }
      : { ...item, icon: item.icon ? `${baseUrl}inftab-icons/${item.icon}` : undefined }),
    ...shortcuts.value.map((shortcut) => ({
      id: shortcut.id,
      title: shortcut.title,
      color: shortcut.color,
      mark: shortcut.mark,
      icon: shortcut.icon
        ? (/^(https?:|data:|\/)/i.test(shortcut.icon) ? shortcut.icon : `${baseUrl}inftab-icons/${shortcut.icon}`)
        : undefined,
      shortcut,
    })),
    ...folders.value.map((folder) => ({
      id: folder.id,
      title: folder.title,
      color: folder.color,
      mark: folder.mark,
      folder,
    })),
  ]
  const order = new Map(launcherOrder.value.map((id, index) => [id, index]))
  return items.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
})
const folderedShortcutIds = computed(() => new Set(folders.value.flatMap((folder) => folder.shortcutIds)))
const allLauncherItems = computed(() => availableLauncherItems.value.filter((item) => activeHomeWorkspaceItemIds.value.has(item.id)
  && !preferences.value.hiddenLauncherIds.includes(item.id)
  && (!item.shortcut || !folderedShortcutIds.value.has(item.id))))
const homeDockItems = computed(() => preferences.value.dockItemIds.flatMap((id) => {
  if (!activeHomeWorkspaceItemIds.value.has(id)) return []
  const item = availableLauncherItems.value.find((candidate) => candidate.id === id)
  return item ? [item] : []
}))
const unavailableFolderShortcutIds = computed(() => folders.value
  .filter((folder) => folder.id !== activeFolder.value?.id)
  .flatMap((folder) => folder.shortcutIds))
const folderEditorShortcuts = computed(() => shortcuts.value.filter((shortcut) => activeHomeWorkspaceItemIds.value.has(shortcut.id)
  || activeFolder.value?.shortcutIds.includes(shortcut.id)))
const pageCount = computed(() => Math.max(1, Math.ceil(allLauncherItems.value.length / pageSize.value)))
const pageNavigation = computed(() => getPageNavigation(pageCount.value, currentPage.value))
watch(activeHomeWorkspaceId, () => { currentPage.value = 0 })
const localSearchMatches = computed<LocalSearchMatch[]>(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return []
  const matches: LocalSearchMatch[] = allLauncherItems.value.map((item) => ({ item }))
  for (const folder of folders.value) {
    if (!activeHomeWorkspaceItemIds.value.has(folder.id)) continue
    for (const shortcutId of folder.shortcutIds) {
      const item = availableLauncherItems.value.find((candidate) => candidate.id === shortcutId && candidate.shortcut)
      if (item) matches.push({ item, folderTitle: folder.title })
    }
  }
  return matches.filter(({ item, folderTitle }) => item.title.toLowerCase().includes(needle)
    || item.shortcut?.url.toLowerCase().includes(needle)
    || folderTitle?.toLowerCase().includes(needle)).slice(0, 8)
})
let panelReturnFocusTarget: HTMLElement | undefined
let systemThemeQuery: MediaQueryList | undefined
function updateSystemTheme(event?: MediaQueryListEvent) {
  systemPrefersDark.value = event?.matches ?? systemThemeQuery?.matches ?? false
}
const panelContext = computed<PanelPluginContext>(() => ({
  preferences: preferences.value,
  backupExportError: backupExportError.value,
  todos: todos.value,
  habits: habits.value,
  countdowns: countdowns.value,
  notes: notes.value,
  activeNoteId: activeNoteId.value,
  weatherCity: weatherCity.value,
  customSearchEngines: customSearchEngines.value,
  focusTimer: focusTimer.value,
  availableShortcutSlots: Math.max(0, 500 - shortcuts.value.length),
  updatePreferences,
  resetPreferences: () => requestDestructiveAction('恢复默认设置？', '当前外观、组件和布局设置将恢复默认值。', resetPreferences, '恢复默认设置'),
  openShortcut: () => openShortcutDialog(),
  openShortcutFromBookmark: (title, url) => {
    openShortcutDialog()
    shortcutTitle.value = title
    shortcutUrl.value = url
  },
  importBookmarks: (items) => {
    if (shortcuts.value.length + items.length > 500) return { added: 0, error: '快捷入口已达到 500 个上限，请先删除一些再导入。' }
    const newShortcuts: Shortcut[] = items.map(({ title, url }) => {
      const cleanTitle = truncateCodePoints(title.trim(), 80) || url
      return {
        id: createLocalId(),
        title: cleanTitle,
        url,
        color: '#3d82f6',
        mark: Array.from(truncateCodePoints(cleanTitle, 2)).join(' ').toUpperCase(),
      }
    })
    if (!addShortcutsData(newShortcuts, activeHomeWorkspaceId.value)) {
      return { added: 0, error: '书签未能完整导入；请检查网址或快捷入口数量后重试。' }
    }
    return { added: newShortcuts.length }
  },
  openFolder: () => openFolderEditor(),
  exportBackup: downloadBackup,
  importBackup: applyWorkspaceBackup,
  addTodo,
  toggleTodo,
  updateTodo,
  removeTodo: (id) => requestDestructiveAction('删除待办？', '此待办将从本机移除。', () => removeTodo(id)),
  clearCompletedTodos: () => requestDestructiveAction('清除已完成待办？', '所有已完成的待办都将从本机移除。', clearCompletedTodos),
  addHabit,
  updateHabit,
  toggleHabitToday,
  removeHabit: (id) => requestDestructiveAction('删除习惯？', '此习惯及其打卡记录将从本机移除。', () => removeHabit(id)),
  addCountdown,
  updateCountdown,
  removeCountdown: (id) => requestDestructiveAction('删除纪念日？', '此纪念日将从本机移除。', () => removeCountdown(id)),
  addNote,
  selectNote: (id) => { activeNoteId.value = id },
  updateNote,
  removeNote: (id) => requestDestructiveAction('删除笔记？', '此笔记及其内容将从本机移除。', () => removeNote(id)),
  updateWeatherCity: (city) => { weatherCity.value = city },
  addCustomSearchEngine,
  removeCustomSearchEngine: (id) => requestDestructiveAction('删除自定义搜索引擎？', '删除后，将无法再用此搜索引擎搜索。', () => removeCustomSearchEngine(id)),
  startFocusTimer,
  pauseFocusTimer,
  resetFocusTimer,
  setFocusDuration,
}))
const activePanelPlugin = computed(() => activePanel.value ? panelRegistry.value?.panelPlugins[activePanel.value] : undefined)
const activePanelComponent = computed<Component | undefined>(() => activePanelPlugin.value?.component)
const activePanelProps = computed<Record<string, unknown>>(() => activePanel.value && panelRegistry.value
  ? panelRegistry.value.getPanelProps(activePanel.value, panelContext.value)
  : {})
const activePanelListeners = computed<Record<string, (...args: never[]) => void>>(() => activePanel.value && panelRegistry.value
  ? panelRegistry.value.getPanelListeners(activePanel.value, panelContext.value)
  : {})
const homeWidgetContext = computed(() => ({ todos: todos.value, habits: habits.value, countdowns: countdowns.value, notes: notes.value, activeNoteId: activeNoteId.value, weatherCity: weatherCity.value, focusTimer: focusTimer.value }))
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
const compactRows = computed(() => Math.min(preferences.value.rows, Math.max(1, Math.ceil(allLauncherItems.value.length / preferences.value.columns))))
const fitMetrics = computed(() => {
  const { width, height } = viewport.value
  const mobile = width <= 780
  const smallMobile = width <= 480
  const compactHeight = height <= 680
  const veryShortHeight = height <= 560
  const rows = compactRows.value
  const topPadding = veryShortHeight ? 38 : compactHeight ? Math.min(64, Math.max(48, height * 0.09)) : smallMobile ? height * 0.18 : mobile ? height * 0.17 : Math.min(112, Math.max(72, height * 0.09))
  const searchVisible = preferences.value.showSearchBar
  const tabHeight = searchVisible && preferences.value.visibleSearchModes.length ? (veryShortHeight ? 26 : smallMobile ? 28 : 33) : 0
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
  const available = height - topPadding - widgetClearance - dockClearance - workspaceTabsClearance - tabHeight - searchHeight - gridTopGap - paginationHeight - footerClearance - rows * nameHeight
  const requestedGap = Math.min(preferences.value.gridGapY, smallMobile ? 20 : mobile ? 24 : preferences.value.gridGapY)
  const fittedGap = rows > 1 ? Math.min(requestedGap, Math.max(4, (available - rows * 32) / (rows - 1))) : requestedGap
  const fittedIcon = Math.max(28, Math.min(preferences.value.iconSize, (available - (rows - 1) * fittedGap) / rows))
  return { fittedGap, fittedIcon }
})
const backgroundStyle = computed(() => {
  const value = preferences.value.customWallpaper.trim() || preferences.value.wallpaper
  const backgroundImage = value.startsWith('linear-gradient') ? value : `url("${value.replaceAll('"', '%22')}")`
  return {
    backgroundImage,
    '--page-shade': String(preferences.value.shade),
    '--grid-columns': String(preferences.value.columns),
    '--shortcut-size': `${preferences.value.iconSize}px`,
    '--shortcut-radius': `${preferences.value.iconRadius}px`,
    '--search-width': `${preferences.value.searchWidth}px`,
    '--search-height': `${preferences.value.searchHeight}px`,
    '--grid-top-gap': `${preferences.value.gridTopGap}px`,
    '--shortcut-gap-x': `${preferences.value.gridGapX}px`,
    '--shortcut-gap-y': `${fitMetrics.value.fittedGap}px`,
    '--fit-icon-size': `${fitMetrics.value.fittedIcon}px`,
    '--page-transition-duration': `${preferences.value.pageTransitionMs}ms`,
    '--hover-glow-strength': String(preferences.value.hoverGlow / 100),
  }
})

watch(pageCount, (count) => { currentPage.value = Math.min(currentPage.value, count - 1) })
watch(() => [preferences.value.wallpaperRotation, preferences.value.wallpaperRotationLastAt, preferences.value.wallpaper, preferences.value.customWallpaper] as const, () => { void scheduleWallpaperRotation() })
watch(activePanel, async (panel, previousPanel) => {
  if (panel && !previousPanel) panelReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  if (!panel && previousPanel) {
    if (panelReturnFocusTarget?.isConnected) panelReturnFocusTarget.focus()
    panelReturnFocusTarget = undefined
    return
  }
  if (!panel) return
  await nextTick()
  sidePanel.value?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]):not(.visually-hidden)')?.focus()
})
watch(shortcutDialog, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    const prefersTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const initialFocus = prefersTouch
      ? shortcutDialogElement.value?.querySelector<HTMLElement>('button[aria-label="关闭"]')
      : shortcutTitleInput.value
    initialFocus?.focus()
    return
  }
  shortcutSaveRequestId += 1
  shortcutIconUploadRequestId += 1
  savingShortcut.value = false
  loadingShortcutIcon.value = false
  const target = shortcutDialogReturnFocusTarget
  shortcutDialogReturnFocusTarget = undefined
  await nextTick()
  if (target?.isConnected) target.focus()
}, { flush: 'post' })

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !sidePanel.value) return
  const focusable = [...sidePanel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]):not(.visually-hidden)',
  )]
  if (!focusable.length) {
    event.preventDefault()
    return
  }
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function submitSearch() {
  if (localSearchMode.value) {
    const [firstMatch] = localSearchMatches.value
    if (firstMatch) openLocalSearchResult(firstMatch.item)
    return
  }
  const destination = buildSearchUrl(preferences.value.engine, preferences.value.mode, query.value, customSearchEngines.value)
  if (destination) window.location.assign(destination)
}

async function submitTranslation() {
  if (localSearchMode.value) return
  const submittedQuery = query.value
  try {
    const { buildTranslationUrl } = await retryAsyncLoad(() => import('./data/translation'))
    const destination = buildTranslationUrl(submittedQuery)
    if (destination) window.location.assign(destination)
  } catch {
    searchBar.value?.showTranslationError()
  }
}

function openLocalSearchResult(item: LauncherItem) {
  localSearchMode.value = false
  query.value = ''
  openItem(item)
}

function handleLocalSearchResultKeydown(event: KeyboardEvent) {
  const results = [...document.querySelectorAll<HTMLButtonElement>('.local-search-result')]
  const index = results.indexOf(event.currentTarget as HTMLButtonElement)
  const nextIndex = event.key === 'ArrowDown' ? Math.min(index + 1, results.length - 1)
    : event.key === 'ArrowUp' ? Math.max(index - 1, 0)
      : event.key === 'Home' ? 0
        : event.key === 'End' ? results.length - 1
          : -1
  if (nextIndex < 0 || !results.length) return
  event.preventDefault()
  results[nextIndex]?.focus()
}

function loadPanelRegistry() {
  if (panelRegistry.value || panelRegistryLoading) return
  panelRegistryError.value = ''
  panelRegistryLoading = retryAsyncLoad(() => import('./plugins/registry'))
    .then((registry) => { panelRegistry.value = registry })
    .catch(() => { panelRegistryError.value = '面板目录暂时无法加载，请重试。' })
    .finally(() => { panelRegistryLoading = undefined })
}

function openPanel(id: PanelId) {
  activePanel.value = id
  loadPanelRegistry()
}

function openItem(item: LauncherItem) {
  if (item.folder) openFolder(item.folder)
  else if (item.action) openPanel(launcherPanelRoutes[item.action])
  else if (item.shortcut) {
    const panel = shortcutPanelRoutes[item.shortcut.id]
    if (panel) openPanel(panel)
    else window.open(item.shortcut.url, '_blank', 'noopener,noreferrer')
  }
}

function openFolder(folder: ShortcutFolder) {
  folderSaveError.value = ''
  activeFolder.value = folder
  folderDialogOpen.value = true
}

function openFolderEditor(folder?: ShortcutFolder) {
  folderSaveError.value = ''
  activeFolder.value = folder
  folderDialogOpen.value = true
}

function addHomeWorkspace() {
  const names = new Set(homeWorkspaces.value.map((workspace) => workspace.name.toLocaleLowerCase()))
  let index = 1
  while (names.has(`工作区 ${index}`.toLocaleLowerCase())) index += 1
  createHomeWorkspace(`工作区 ${index}`)
}

function requestHomeWorkspaceRemoval(id: string) {
  const workspace = homeWorkspaces.value.find((item) => item.id === id)
  if (!workspace) return
  requestDestructiveAction(
    '删除工作区？',
    `“${workspace.name}”中的快捷入口和文件夹会移回“主页”，不会被删除。`,
    () => removeHomeWorkspace(id),
  )
}

function closeFolderDialog() {
  folderDialogOpen.value = false
  activeFolder.value = undefined
  folderSaveError.value = ''
}

function requestDestructiveAction(title: string, description: string, run: () => void, confirmLabel?: string) {
  if (pendingDestructiveAction.value) return
  destructiveActionFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  pendingDestructiveAction.value = { title, description, run, confirmLabel }
}

async function cancelDestructiveAction() {
  pendingDestructiveAction.value = undefined
  await nextTick()
  destructiveActionFocusTarget?.focus()
  destructiveActionFocusTarget = undefined
}

function confirmDestructiveAction() {
  const action = pendingDestructiveAction.value
  pendingDestructiveAction.value = undefined
  destructiveActionFocusTarget = undefined
  action?.run()
}

function saveFolder(folder: ShortcutFolder) {
  if (!saveFolderData(folder)) {
    folderSaveError.value = '最多只能保存 500 个文件夹。'
    return
  }
  folderSaveError.value = ''
  activeFolder.value = folder
  folderDialogOpen.value = false
}

function editLauncherItem(item: LauncherItem) {
  if (item.folder) openFolderEditor(item.folder)
  else if (item.shortcut) openShortcutDialog(item)
}

function removeLauncherItem(item: LauncherItem) {
  if (!item.folder && !item.shortcut) return
  requestDestructiveAction(
    item.folder ? '删除文件夹？' : '删除快捷入口？',
    item.folder ? `“${item.title}”文件夹将被移除，其中的快捷入口会保留。` : `“${item.title}”快捷入口将从本机移除。`,
    () => item.folder ? removeFolderData(item.folder.id) : removeShortcutData(item.shortcut!.id),
  )
}

function requestFolderRemoval(id: string) {
  const folder = folders.value.find((candidate) => candidate.id === id)
  if (!folder) return
  requestDestructiveAction('删除文件夹？', `“${folder.title}”文件夹将被移除，其中的快捷入口会保留。`, () => {
    removeFolderData(id)
    closeFolderDialog()
  })
}

function toggleDockItem(id: string) {
  const dockItemIds = preferences.value.dockItemIds
  if (dockItemIds.includes(id)) {
    updatePreferences({ dockItemIds: dockItemIds.filter((itemId) => itemId !== id) })
  } else if (dockItemIds.length < maxDockItems) {
    updatePreferences({ dockItemIds: [...dockItemIds, id] })
  }
}

function dockLauncherItem(id: string, targetId?: string) {
  const dockItemIds = preferences.value.dockItemIds
  const alreadyDocked = dockItemIds.includes(id)
  if (id === targetId || (!alreadyDocked && dockItemIds.length >= maxDockItems)) return
  const next = dockItemIds.filter((itemId) => itemId !== id)
  const targetIndex = targetId ? next.indexOf(targetId) : -1
  if (targetIndex >= 0) next.splice(targetIndex, 0, id)
  else if (!alreadyDocked || targetId) next.push(id)
  if (next.length !== dockItemIds.length || next.some((itemId, index) => itemId !== dockItemIds[index])) {
    updatePreferences({ dockItemIds: next })
  }
}

function openFolderShortcut(shortcut: Shortcut) {
  window.open(shortcut.url, '_blank', 'noopener,noreferrer')
}

function openFolderShortcuts(items: Shortcut[]) {
  for (const shortcut of items) window.open(shortcut.url, '_blank', 'noopener,noreferrer')
}

function openShortcutDialog(item?: LauncherItem) {
  shortcutSaveRequestId += 1
  shortcutIconUploadRequestId += 1
  savingShortcut.value = false
  loadingShortcutIcon.value = false
  shortcutDialogReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  editingId.value = item?.shortcut?.id ?? ''
  shortcutWorkspaceId.value = item?.shortcut
    ? homeWorkspaces.value.find((workspace) => workspace.itemIds.includes(item.shortcut!.id))?.id ?? activeHomeWorkspaceId.value
    : activeHomeWorkspaceId.value
  shortcutTitle.value = item?.shortcut?.title ?? ''
  shortcutUrl.value = item?.shortcut?.url ?? 'https://'
  shortcutUrlError.value = ''
  shortcutSaveError.value = ''
  shortcutColor.value = item?.shortcut?.color ?? '#3d82f6'
  shortcutMark.value = item?.shortcut?.mark ?? ''
  shortcutIcon.value = item?.shortcut?.icon ?? ''
  shortcutIconError.value = ''
  if (shortcutIconFile.value) shortcutIconFile.value.value = ''
  shortcutDialog.value = true
}

function handleShortcutDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    shortcutDialog.value = false
    return
  }
  if (event.key !== 'Tab' || !shortcutDialogElement.value) return
  const focusable = [...shortcutDialogElement.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]):not(.visually-hidden)',
  )]
  if (!focusable.length) {
    event.preventDefault()
    return
  }
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
function fillShortcutFromBrowserTab(tab: BrowserTabCandidate) {
  shortcutTitle.value = truncateCodePoints(tab.title, 80)
  shortcutUrl.value = tab.url
  shortcutUrlError.value = ''
}

function handleShortcutIconInput() {
  shortcutIconUploadRequestId += 1
  loadingShortcutIcon.value = false
  shortcutIconError.value = ''
}

async function loadShortcutIconFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const requestId = ++shortcutIconUploadRequestId
  loadingShortcutIcon.value = false
  shortcutIconError.value = ''
  if (!file) return
  if (file.size > maxImageUploadBytes) {
    shortcutIconError.value = '图片不能超过 10 MB。'
    return
  }
  loadingShortcutIcon.value = true
  try {
    const { compressImageBlob } = await import('./data/images')
    if (requestId !== shortcutIconUploadRequestId || !shortcutDialog.value) return
    const icon = await compressImageBlob(file, 192)
    if (requestId !== shortcutIconUploadRequestId || !shortcutDialog.value) return
    shortcutIcon.value = icon
  } catch (error) {
    if (requestId !== shortcutIconUploadRequestId || !shortcutDialog.value) return
    shortcutIconError.value = error instanceof Error ? error.message : '无法处理这张图片。'
  } finally {
    if (requestId === shortcutIconUploadRequestId) loadingShortcutIcon.value = false
  }
}

async function saveShortcut() {
  if (savingShortcut.value || loadingShortcutIcon.value) return
  const title = shortcutTitle.value.trim()
  let destination = shortcutUrl.value.trim()
  if (!title || !destination) return
  const normalizedDestination = normalizeWebUrl(destination)
  if (!normalizedDestination) {
    shortcutUrlError.value = '请输入有效的 HTTP 或 HTTPS 网址。'
    return
  }
  destination = normalizedDestination
  const saveRequestId = ++shortcutSaveRequestId
  const shortcutId = editingId.value || createLocalId()
  const destinationWorkspaceId = shortcutWorkspaceId.value
  const color = shortcutColor.value
  const mark = shortcutMark.value.trim() || truncateCodePoints(title, 2)
  shortcutUrlError.value = ''
  let icon = shortcutIcon.value.trim()
  shortcutIconError.value = ''
  if (/^(?:https?:)?\/\//i.test(icon)) {
    const normalizedIcon = normalizeWebUrl(icon)
    if (!normalizedIcon) {
      shortcutIconError.value = '请输入有效的 HTTP 或 HTTPS 图片网址。'
      return
    }
    icon = normalizedIcon
  }
  // Extension pages have narrowly scoped host permissions for weather only.
  // Keep user supplied remote icons as image URLs instead of requesting broad host access.
  if (/^https?:\/\//i.test(icon) && location.protocol !== 'chrome-extension:') {
    savingShortcut.value = true
    try {
      const { fetchAndCompressImage } = await import('./data/images')
      if (saveRequestId !== shortcutSaveRequestId || !shortcutDialog.value) return
      icon = await fetchAndCompressImage(icon, 192)
    } catch (error) {
      if (saveRequestId !== shortcutSaveRequestId || !shortcutDialog.value) return
      shortcutIconError.value = error instanceof Error && !error.message.includes('Failed to fetch')
        ? error.message
        : '无法从这个网址读取图片（可能被跨域限制）。请上传本地图片后再保存。'
      savingShortcut.value = false
      return
    }
    if (saveRequestId !== shortcutSaveRequestId || !shortcutDialog.value) return
    savingShortcut.value = false
  }
  const next: Shortcut = {
    id: shortcutId,
    title,
    url: destination,
    color,
    mark,
    icon: icon || undefined,
  }
  if (saveRequestId !== shortcutSaveRequestId || !shortcutDialog.value) return
  if (!saveShortcutData(next, destinationWorkspaceId)) {
    shortcutSaveError.value = '最多只能保存 500 个快捷入口。'
    return
  }
  shortcutSaveError.value = ''
  shortcutDialog.value = false
}

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
  if (minimalMode.value || event.pointerType !== 'touch' || (event.target instanceof Element && event.target.closest('.shortcut-cell, .home-widget-shelf, .home-dock'))) return
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
    || (event.target instanceof Element && event.target.closest('.home-widget-shelf, .home-dock'))) return
  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
  const delta = horizontal ? event.deltaX : event.deltaY
  if (Math.abs(delta) <= 24) return
  event.preventDefault()
  movePage(delta > 0 ? 1 : -1)
  homeWheelLocked = true
  setTimeout(() => { homeWheelLocked = false }, 450)
}

function reorderItems(sourceId: string, targetId: string) {
  reorderLauncherOrder(sourceId, targetId, allLauncherItems.value.map((item) => item.id))
}

function moveLauncherItemByKeyboard(itemId: string, direction: -1 | 1) {
  const nextOrder = allLauncherItems.value.map((item) => item.id)
  const currentIndex = nextOrder.indexOf(itemId)
  const nextIndex = currentIndex + direction
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nextOrder.length) return
  const [item] = nextOrder.splice(currentIndex, 1)
  if (item === undefined) return
  nextOrder.splice(nextIndex, 0, item)
  setVisibleLauncherOrder(nextOrder)
}

function removeHomeWidget(id: HomeWidgetId) {
  updatePreferences({ homeWidgetIds: preferences.value.homeWidgetIds.filter((widgetId) => widgetId !== id) })
}

function resizeHomeWidget(id: HomeWidgetId, size: HomeWidgetSize) {
  updatePreferences({ homeWidgetSizes: { ...preferences.value.homeWidgetSizes, [id]: size } })
}

function reorderHomeWidgets(from: number, to: number) {
  const next = [...preferences.value.homeWidgetIds]
  const [widgetId] = next.splice(from, 1)
  if (!widgetId || to < 0 || to >= next.length + 1) return
  next.splice(to, 0, widgetId)
  updatePreferences({ homeWidgetIds: next })
}

function downloadBackup() {
  try {
    const contents = JSON.stringify(createBackup(), null, 2)
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `inftab-backup-${toLocalDateKey(new Date())}.json`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    backupExportError.value = ''
    storageError.value = ''
  } catch (error) {
    backupExportError.value = error instanceof Error ? `导出失败：${error.message}` : '导出失败，请稍后重试。'
    storageError.value = backupExportError.value
  }
}

function applyWorkspaceBackup(backup: Parameters<typeof restoreBackup>[0], mode: 'merge' | 'replace') {
  backupExportError.value = restoreBackup(backup, mode) ?? ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || pendingDestructiveAction.value) return
  if (event.key === 'Escape') {
    if (localSearchMode.value) {
      localSearchMode.value = false
      query.value = ''
      return
    }
    if (shortcutDialog.value) {
      shortcutDialog.value = false
      return
    }
    if (folderDialogOpen.value) {
      closeFolderDialog()
      return
    }
    if (activePanel.value) {
      activePanel.value = null
      return
    }
    if (minimalMode.value) {
      minimalMode.value = false
      return
    }
  }
  const target = event.target instanceof HTMLElement ? event.target : null
  const editingText = target?.matches('input, textarea, [contenteditable="true"]') ?? false
  const navigatingComposite = Boolean(target?.closest('[role="menu"], [role="listbox"]'))
  const localSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
  if (localSearchShortcut && (!editingText || target?.closest('.search-area'))
    && !activePanel.value && !shortcutDialog.value && !folderDialogOpen.value) {
    event.preventDefault()
    localSearchMode.value = true
    query.value = ''
    void nextTick(() => searchBar.value?.focusSearch())
    return
  }
  const focusSearchShortcut = event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey
    || event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)
  if (focusSearchShortcut && !editingText && !activePanel.value && !shortcutDialog.value && !folderDialogOpen.value && searchBar.value) {
    event.preventDefault()
    localSearchMode.value = false
    searchBar.value.focusSearch()
    return
  }
  if (event.key === 'ArrowRight' && !editingText && !navigatingComposite && !localSearchMode.value && !minimalMode.value && !shortcutDialog.value && !folderDialogOpen.value && !activePanel.value) movePage(1)
  if (event.key === 'ArrowLeft' && !editingText && !navigatingComposite && !localSearchMode.value && !minimalMode.value && !shortcutDialog.value && !folderDialogOpen.value && !activePanel.value) movePage(-1)
}

function toggleMinimalMode() {
  minimalMode.value = !minimalMode.value
  if (minimalMode.value) void nextTick(() => searchBar.value?.focusSearch())
}

function updateViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

async function scheduleWallpaperRotation() {
  const request = ++wallpaperRotationRequest
  if (wallpaperRotationTimer !== undefined) {
    window.clearTimeout(wallpaperRotationTimer)
    wallpaperRotationTimer = undefined
  }
  const current = preferences.value
  if (current.wallpaperRotation === 'off' || current.customWallpaper.trim()) return

  const { advanceWallpaperRotation, nextWallpaperRotationDelay } = await import('./data/wallpaperRotation')
  if (request !== wallpaperRotationRequest) return
  const latest = preferences.value
  if (latest.wallpaperRotation === 'off' || latest.customWallpaper.trim()) return

  const now = Date.now()
  const nextWallpaper = advanceWallpaperRotation(latest.wallpaper, latest.wallpaperRotation, latest.wallpaperRotationLastAt, now)
  if (nextWallpaper && (nextWallpaper.wallpaper !== latest.wallpaper || nextWallpaper.lastAt !== latest.wallpaperRotationLastAt)) {
    updatePreferences({ wallpaper: nextWallpaper.wallpaper, wallpaperRotationLastAt: nextWallpaper.lastAt })
  }
  const delay = nextWallpaperRotationDelay(latest.wallpaperRotation, preferences.value.wallpaperRotationLastAt, now)
  if (delay !== undefined) wallpaperRotationTimer = window.setTimeout(() => { void scheduleWallpaperRotation() }, delay)
}

function handleWallpaperRotationVisibility() {
  if (document.visibilityState === 'visible') void scheduleWallpaperRotation()
}

function syncFocusTimerInterval() {
  if (focusTimer.value.endsAt === null) {
    if (focusTimerInterval !== undefined) window.clearInterval(focusTimerInterval)
    focusTimerInterval = undefined
  } else if (focusTimerInterval === undefined) {
    focusTimerInterval = window.setInterval(tickFocusTimer, 1000)
  }
}

function handleFocusTimerVisibility() {
  if (document.visibilityState === 'visible') tickFocusTimer()
}

watch(() => focusTimer.value.endsAt, syncFocusTimerInterval, { flush: 'sync' })

function handleStorageWriteError(event: Event) {
  const key = (event as CustomEvent<{ key?: unknown }>).detail?.key
  if (typeof key === 'string') failedStorageWriteKeys.add(key)
  storageError.value = '本地数据未能保存。请检查浏览器存储空间，并先导出备份。'
}

function handleStorageWriteSuccess(event: Event) {
  const key = (event as CustomEvent<{ key?: unknown }>).detail?.key
  if (typeof key !== 'string') return
  failedStorageWriteKeys.delete(key)
  if (failedStorageWriteKeys.size === 0) storageError.value = backupExportError.value
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateViewport)
  window.addEventListener(storageWriteErrorEvent, handleStorageWriteError)
  window.addEventListener(storageWriteSuccessEvent, handleStorageWriteSuccess)
  document.addEventListener('visibilitychange', handleWallpaperRotationVisibility)
  document.addEventListener('visibilitychange', handleFocusTimerVisibility)
  syncFocusTimerInterval()
  void scheduleWallpaperRotation()
  if (typeof window.matchMedia === 'function') {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    updateSystemTheme()
    if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', updateSystemTheme)
    else systemThemeQuery.addListener?.(updateSystemTheme)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener(storageWriteErrorEvent, handleStorageWriteError)
  window.removeEventListener(storageWriteSuccessEvent, handleStorageWriteSuccess)
  document.removeEventListener('visibilitychange', handleWallpaperRotationVisibility)
  document.removeEventListener('visibilitychange', handleFocusTimerVisibility)
  if (focusTimerInterval !== undefined) window.clearInterval(focusTimerInterval)
  focusTimerInterval = undefined
  if (wallpaperRotationTimer !== undefined) window.clearTimeout(wallpaperRotationTimer)
  wallpaperRotationTimer = undefined
  wallpaperRotationRequest += 1
  shortcutSaveRequestId += 1
  shortcutIconUploadRequestId += 1
  if (systemThemeQuery?.removeEventListener) systemThemeQuery.removeEventListener('change', updateSystemTheme)
  else systemThemeQuery?.removeListener?.(updateSystemTheme)
  systemThemeQuery = undefined
})
</script>

<template>
  <main class="home" :class="{ 'theme-dark': effectiveTheme === 'dark', 'home-scrollable': shortHomeScrollEnabled, 'home-with-dock': homeDockItems.length > 0, 'home-minimal': minimalMode }" :style="backgroundStyle" @pointerdown="startHomeSwipe" @pointerup="finishHomeSwipe" @pointercancel="homeTouchStart = undefined" @wheel="handleHomeWheel">
    <a class="skip-link" href="#main-content">跳到快捷入口</a>
    <h1 class="visually-hidden">Infinity 新标签页</h1>
    <div class="background-shade"></div>
    <header class="home-actions">
      <button type="button" class="round-action minimal-mode-toggle" :aria-label="minimalMode ? '退出极简模式' : '进入极简模式'" :aria-pressed="minimalMode" :title="minimalMode ? '退出极简模式' : '进入极简模式'" @click="toggleMinimalMode"><span aria-hidden="true">{{ minimalMode ? '×' : '◉' }}</span></button>
      <button type="button" class="round-action" aria-label="回到首页" @click="goToPage(0)"><House :size="19" /></button>
      <button type="button" class="round-action" aria-label="打开设置" @click="openPanel('settings')"><Menu :size="21" /></button>
    </header>

    <ClockWidget v-if="preferences.showClock" />
    <section id="main-content" class="home-content" :class="{ 'home-content-minimal': minimalMode }" tabindex="-1">
      <HomeWidgetShelf
        v-if="showHomeWidgets && !minimalMode"
        :widget-ids="preferences.homeWidgetIds"
        :widget-sizes="preferences.homeWidgetSizes"
        :context="homeWidgetContext"
        @open="openPanel"
        @remove="removeHomeWidget"
        @reorder="reorderHomeWidgets"
        @resize="resizeHomeWidget"
      />
      <HomeWorkspaceTabs
        v-if="!minimalMode"
        :workspaces="homeWorkspaces"
        :active-id="activeHomeWorkspaceId"
        @select="activeHomeWorkspaceId = $event"
        @create="addHomeWorkspace"
        @rename="renameHomeWorkspace"
        @move="moveHomeWorkspace"
        @remove="requestHomeWorkspaceRemoval"
      />
      <SearchBar
        ref="searchBar"
        v-if="preferences.showSearchBar || localSearchMode || minimalMode"
        v-model="query"
        v-model:engine="preferences.engine"
        v-model:mode="preferences.mode"
        :visible-modes="preferences.visibleSearchModes"
        :custom-engines="customSearchEngines"
        :dark-theme="effectiveTheme === 'dark'"
        :local-search="localSearchMode"
        @search="submitSearch"
        @translate="submitTranslation"
      >
        <template #local-results>
          <div v-if="query.trim()" class="local-search-results" role="listbox" aria-label="快捷入口搜索结果">
            <p v-if="!localSearchMatches.length" class="local-search-empty" role="status">没有匹配的快捷入口</p>
            <button
              v-for="match in localSearchMatches"
              :key="match.item.id"
              type="button"
              role="option"
              class="local-search-result"
              @click="openLocalSearchResult(match.item)"
              @keydown="handleLocalSearchResultKeydown"
            >
              <span class="local-search-result-title">{{ match.folderTitle ? `${match.folderTitle} · ${match.item.title}` : match.item.title }}</span>
              <span v-if="match.item.shortcut" class="local-search-result-url">{{ match.item.shortcut.url }}</span>
            </button>
          </div>
        </template>
      </SearchBar>
      <ShortcutGrid
        v-if="!minimalMode"
        :items="allLauncherItems"
        :dock-item-ids="preferences.dockItemIds"
        :columns="preferences.columns"
        :rows="preferences.rows"
        :icon-size="preferences.iconSize"
        :icon-radius="preferences.iconRadius"
        :show-names="preferences.showNames"
        :current-page="currentPage"
        :transition-direction="pageDirection"
        :transition-effect="preferences.pageTransitionEffect"
        :transition-duration="preferences.pageTransitionMs"
        @open="openItem"
        @edit="editLauncherItem"
        @remove="removeLauncherItem"
        @toggle-dock="toggleDockItem"
        @dock="dockLauncherItem"
        @reorder="reorderItems"
        @move-by-keyboard="moveLauncherItemByKeyboard"
        @swipe="movePage"
      />
      <nav v-if="pageCount > 1 && !minimalMode" class="page-dots" aria-label="快捷入口页码">
        <button type="button" aria-label="上一页" class="page-arrow" @click="movePage(-1)"><ArrowLeft :size="15" /></button>
        <template v-for="item in pageNavigation" :key="item.kind === 'page' ? `page-${item.page}` : item.id">
          <button v-if="item.kind === 'page'" type="button" :aria-label="`第${item.page + 1}页`" :aria-current="item.page === currentPage ? 'page' : undefined" class="page-dot" :class="{ active: item.page === currentPage }" @click="goToPage(item.page)"></button>
          <span v-else class="page-ellipsis" aria-hidden="true">…</span>
        </template>
        <button type="button" aria-label="下一页" class="page-arrow next" @click="movePage(1)"><ArrowLeft :size="15" /></button>
      </nav>
    </section>

    <HomeDock v-if="homeDockItems.length && !minimalMode" :items="homeDockItems" :magnification-enabled="preferences.dockMagnification" :icon-size="preferences.dockIconSize" :icon-gap="preferences.dockIconGap" :glow-strength="preferences.hoverGlow" :dark-theme="effectiveTheme === 'dark'" @open="openItem" @remove="toggleDockItem" />

    <div v-if="storageError" class="storage-error-toast" role="alert">
      <span>{{ storageError }}</span>
      <button class="storage-error-export" type="button" @click="downloadBackup">导出备份</button>
      <button class="storage-error-dismiss" type="button" aria-label="关闭保存提示" @click="storageError = ''"><X :size="15" /></button>
    </div>
    <footer class="home-footer">渝ICP备15002199号-1</footer>

    <div v-if="activePanel" class="panel-backdrop" @click.self="activePanel = null">
      <aside ref="sidePanel" class="side-panel" :class="{ 'notes-panel': activePanel === 'notes' }" aria-modal="true" role="dialog" :aria-label="activePanelPlugin?.title ?? '功能面板'" @keydown="handlePanelKeydown">
        <header class="panel-header">
          <button v-if="activePanel !== 'settings'" class="back-button" type="button" aria-label="返回设置" @click="openPanel('settings')"><ArrowLeft :size="19" /></button>
          <div><h2>{{ activePanelPlugin?.title ?? (panelRegistryError ? '面板加载失败' : '正在加载…') }}</h2><p>{{ activePanelPlugin?.description ?? '' }}</p></div>
          <button class="panel-close" type="button" aria-label="关闭" @click="activePanel = null"><X :size="19" /></button>
        </header>
        <div v-if="panelRegistryError" class="panel-load-error panel-loading" role="alert">
          <p>{{ panelRegistryError }}</p>
          <button class="text-button plugin-load-retry" type="button" @click="loadPanelRegistry">重试加载</button>
        </div>
        <p v-else-if="!activePanelPlugin" class="panel-loading" role="status">正在加载功能面板…</p>
        <component v-else :is="activePanelComponent" v-bind="activePanelProps" v-on="activePanelListeners" />
      </aside>
    </div>

    <FolderDialog
      v-if="folderDialogOpen"
      :folder="activeFolder"
      :shortcuts="folderEditorShortcuts"
      :unavailable-shortcut-ids="unavailableFolderShortcutIds"
      :save-error="folderSaveError"
      :limit-reached="folderLimitReached"
      @close="closeFolderDialog"
      @save="saveFolder"
      @remove="requestFolderRemoval"
      @open-shortcut="openFolderShortcut"
      @open-all-shortcuts="openFolderShortcuts"
    />

    <div v-if="shortcutDialog" class="modal-backdrop" @click.self="shortcutDialog = false">
      <form ref="shortcutDialogElement" class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-dialog-title" @keydown="handleShortcutDialogKeydown" @submit.prevent="saveShortcut">
        <header><div><h2 id="shortcut-dialog-title">{{ editingId ? '编辑快捷入口' : '添加快捷入口' }}</h2><p>名称和网址可以随时修改</p></div><button type="button" aria-label="关闭" @click="shortcutDialog = false"><X :size="19" /></button></header>
        <label>名称<input ref="shortcutTitleInput" v-model="shortcutTitle" required maxlength="80" placeholder="例如：GitHub" :disabled="savingShortcut" /></label>
        <label>所属工作区<select v-model="shortcutWorkspaceId" :disabled="savingShortcut"><option v-for="workspace in homeWorkspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}</option></select></label>
        <p v-if="shortcutLimitReached" class="backup-error" role="status">最多只能保存 500 个快捷入口。</p>
        <BrowserTabImport v-if="canImportBrowserTabs && !savingShortcut" @select="fillShortcutFromBrowserTab" />
        <label>网址<input v-model="shortcutUrl" required maxlength="2048" placeholder="https://example.com" @input="shortcutUrlError = ''" :disabled="savingShortcut" /></label>
        <p v-if="shortcutUrlError" class="backup-error" role="alert">{{ shortcutUrlError }}</p>
        <p v-if="shortcutSaveError" class="backup-error" role="alert">{{ shortcutSaveError }}</p>
        <div class="dialog-row">
          <label>图标文字<input v-model="shortcutMark" maxlength="5" placeholder="自动取名称" :disabled="savingShortcut" /></label>
          <label class="color-field">图标颜色<input v-model="shortcutColor" type="color" :disabled="savingShortcut" /></label>
        </div>
        <label>图标图片地址（可选）<input v-model="shortcutIcon" placeholder="素材文件名、图片网址或 Base64" @input="handleShortcutIconInput" :disabled="savingShortcut" /></label>
        <div class="icon-file-actions">
          <input ref="shortcutIconFile" class="visually-hidden" type="file" tabindex="-1" aria-hidden="true" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="savingShortcut" @change="loadShortcutIconFile" />
          <button class="button-secondary" type="button" :disabled="savingShortcut || loadingShortcutIcon" @click="shortcutIconFile?.click()">{{ loadingShortcutIcon ? '正在处理图片…' : '上传本地图片' }}</button>
          <span>图片会压缩为 Base64 保存在本机，离线可用</span>
        </div>
        <p v-if="loadingShortcutIcon" class="panel-footnote" role="status">正在压缩图片，请稍候再保存。</p>
        <p v-if="shortcutIconError" class="backup-error" role="alert">{{ shortcutIconError }}</p>
        <footer><button class="button-secondary" type="button" @click="shortcutDialog = false">取消</button><button class="button-primary" type="submit" :disabled="savingShortcut || loadingShortcutIcon || shortcutLimitReached">{{ savingShortcut ? '正在转存图标…' : loadingShortcutIcon ? '正在处理图片…' : '保存' }}</button></footer>
      </form>
    </div>

    <ConfirmDialog
      v-if="pendingDestructiveAction"
      :title="pendingDestructiveAction.title"
      :description="pendingDestructiveAction.description"
      :confirm-label="pendingDestructiveAction.confirmLabel"
      @cancel="cancelDestructiveAction"
      @confirm="confirmDestructiveAction"
    />
  </main>
</template>
