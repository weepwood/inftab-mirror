<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { ArrowLeft, House, Menu, Plus, Search, X } from '@lucide/vue'
import { lazyPluginComponent, retryAsyncLoad } from './plugins/asyncComponent'
import { useHomeLayout } from './composables/useHomeLayout'
import { getOverlayFocusable, trapOverlayTab, isComposingKey } from './composables/overlayFocus'
import { useHomeNavigation } from './composables/useHomeNavigation'
import { useLocalWorkspace } from './composables/useLocalWorkspace'
import { storageWriteErrorEvent, storageWriteSuccessEvent } from './composables/useStoredState'
import type { LayoutEditorDraft } from './data/layoutEditor'
import { applyCustomTheme } from './data/customTheme'
import { resolveWorkspaceLayout } from './data/workspaceLayout'
import { launcherItems } from './data/defaults'
import { buildSearchUrl } from './data/search'
import { getPageNavigation } from './data/pagination'
import { createLocalId } from './data/createId'
import { truncateCodePoints } from './data/text'
import type { LauncherSearchMatch } from './data/launcherSearch'
import { launcherPanelRoutes, shortcutPanelRoutes } from './plugins/routes'
import type { PanelId, PanelPluginContext } from './plugins/registry'
import { maxDockItems, type HomeWidgetId, type HomeWidgetSize, type LauncherItem, type Shortcut, type ShortcutFolder } from './types'

type Panel = PanelId | null
const lazyHome = (loader: Parameters<typeof lazyPluginComponent>[0], name: string, retry = false) => lazyPluginComponent(loader, '正在加载' + name + '…', name + (retry ? '暂时无法加载，请重试。' : '暂时无法加载。'))

const SearchBar = defineAsyncComponent({
  loader: () => retryAsyncLoad(() => import('./components/SearchBar.vue')),
  errorComponent: { render: () => h('button', { type: 'button', class: 'plugin-page-reload', onClick: () => location.reload() }, '搜索加载失败，重新加载页面') },
})
const ClockWidget = lazyHome(() => import('./components/ClockWidget.vue'), '时钟')
const LauncherSearchResults = lazyHome(() => import('./components/LauncherSearchResults.vue'), '入口查找', true)
const ShortcutGrid = lazyHome(() => import('./components/ShortcutGrid.vue'), '快捷入口', true)
const HomeWidgetShelf = lazyHome(() => import('./components/HomeWidgetShelf.vue'), '首页组件')
const HomeDock = lazyHome(() => import('./components/HomeDock.vue'), '常驻 Dock')
const FolderDialog = lazyHome(() => import('./components/FolderDialog.vue'), '文件夹', true)
const ConfirmDialog = lazyHome(() => import('./components/ConfirmDialog.vue'), '确认对话框', true)
const ShortcutEditor = lazyHome(() => import('./components/ShortcutEditor.vue'), '快捷入口表单', true)
const CommandPalette = lazyHome(() => import('./components/CommandPalette.vue'), '命令面板')
const HomeLayoutEditor = lazyHome(() => import('./components/HomeLayoutEditor.vue'), '布局编辑器')
const HomeWorkspaceTabs = lazyHome(() => import('./components/HomeWorkspaceTabs.vue'), '工作区')

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
  saveWorkspaceLayout,
  saveHomeLayout,
  applyShortcutBatch,
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
watch(() => preferences.value.themePalette, (palette) => { document.documentElement.dataset.themePalette = palette }, { immediate: true })
watch(() => preferences.value.customTheme, theme => applyCustomTheme(document.documentElement, theme), { immediate: true })
const commandPaletteOpen = ref(false)
const layoutEditorOpen = ref(false)
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
const shortcutDialogElement = ref<HTMLDialogElement>()
const folderDialogOpen = ref(false)
const activeFolder = ref<ShortcutFolder>()
const folderSaveError = ref('')
const shortcutDialog = ref(false)
let shortcutDialogReturnFocusTarget: HTMLElement | undefined
const shortcutDraft = ref<Partial<Shortcut>>()
const shortcutWorkspaceId = ref('default')
const shortcutSaveError = ref('')
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
// Keep the saved desktop grid preference while giving touch targets room on phones.
const activeHomeWorkspace = computed(() => homeWorkspaces.value.find((workspace) => workspace.id === activeHomeWorkspaceId.value) ?? homeWorkspaces.value[0]!)
const layoutPreferences = computed(() => ({ ...preferences.value, ...resolveWorkspaceLayout(preferences.value, activeHomeWorkspace.value?.layout) }))
const layoutColumns = computed(() => Math.min(layoutPreferences.value.columns, viewport.value.width <= 480 ? 4 : viewport.value.width <= 780 ? 5 : 12))
const pageSize = computed(() => layoutColumns.value * layoutPreferences.value.rows)
const activeHomeWorkspaceItemIds = computed(() => new Set(activeHomeWorkspace.value?.itemIds ?? []))
const shortcutLimitReached = computed(() => !shortcutDraft.value?.id && shortcuts.value.length >= 500)
const folderLimitReached = computed(() => !activeFolder.value && folders.value.length >= 500)
let wallpaperRotationTimer: number | undefined
let wallpaperRotationRequest = 0
let focusTimerInterval: number | undefined
const pendingTodoCount = computed(() => todos.value.filter(todo => !todo.done).length)
const builtinLauncherItems = launcherItems.map(item => ({ ...item, icon: item.icon ? `${baseUrl}inftab-icons/${item.icon}` : undefined }))
const shortcutLauncherItems = computed<LauncherItem[]>(() => shortcuts.value.map(shortcut => ({
  id: shortcut.id, title: shortcut.title, color: shortcut.color, mark: shortcut.mark,
  icon: shortcut.icon ? (/^(https?:|data:|\/)/i.test(shortcut.icon) ? shortcut.icon : `${baseUrl}inftab-icons/${shortcut.icon}`) : undefined,
  shortcut,
})))
const folderLauncherItems = computed<LauncherItem[]>(() => folders.value.map(folder => ({
  id: folder.id, title: folder.title, color: folder.color, mark: folder.mark, folder,
})))
const orderedLauncherItems = computed<LauncherItem[]>(() => {
  const order = new Map(launcherOrder.value.map((id, index) => [id, index]))
  return [...builtinLauncherItems, ...shortcutLauncherItems.value, ...folderLauncherItems.value]
    .sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
})
const availableLauncherItems = computed(() => orderedLauncherItems.value.map(item => item.id === 'todos'
  ? { ...item, badge: pendingTodoCount.value || undefined } : item))
const launcherById = computed(() => new Map(availableLauncherItems.value.map(item => [item.id, item])))
const hiddenLauncherIds = computed(() => new Set(preferences.value.hiddenLauncherIds))
const folderedShortcutIds = computed(() => new Set(folders.value.flatMap((folder) => folder.shortcutIds)))
const allLauncherItems = computed(() => availableLauncherItems.value.filter((item) => activeHomeWorkspaceItemIds.value.has(item.id)
  && !hiddenLauncherIds.value.has(item.id)
  && (!item.shortcut || !folderedShortcutIds.value.has(item.id))))
const folderPreviewItems = computed(() => availableLauncherItems.value.filter((item) => item.shortcut))
const homeDockItems = computed(() => preferences.value.dockItemIds.flatMap((id) => {
  if (!activeHomeWorkspaceItemIds.value.has(id)) return []
  const item = launcherById.value.get(id)
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
let panelReturnFocusTarget: HTMLElement | undefined
let systemThemeQuery: MediaQueryList | undefined
function updateSystemTheme(event?: MediaQueryListEvent) {
  systemPrefersDark.value = event?.matches ?? systemThemeQuery?.matches ?? false
}
function importBookmarks(items: import('./types').BookmarkShortcutCandidate[]) {
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
    shortcutDraft.value = { title, url }
  },
  importBookmarks,
  workspaceTools: { shortcuts: shortcuts.value, workspaces: homeWorkspaces.value, activeId: activeHomeWorkspaceId.value, getBackup: createBackup, restore: restoreBackup, batch: applyShortcutBatch, importBookmarks },
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
const homeWidgetContext = computed(() => ({ preferences: preferences.value, todos: todos.value, addTodo, toggleTodo, habits: habits.value, countdowns: countdowns.value, notes: notes.value, activeNoteId: activeNoteId.value, weatherCity: weatherCity.value, focusTimer: focusTimer.value }))
const { showHomeWidgets, shortHomeScrollEnabled, backgroundStyle } = useHomeLayout({ preferences: layoutPreferences, viewport, layoutColumns, allLauncherItems, homeDockItems, pageCount, minimalMode, localSearchMode })
const overlayOpen = computed(() => Boolean(activePanel.value || shortcutDialog.value || folderDialogOpen.value || commandPaletteOpen.value || layoutEditorOpen.value || pendingDestructiveAction.value))
const { wheelOffset, movePage, goToPage, startHomeSwipe, finishHomeSwipe, handleHomeWheel, cancelHomeSwipe } = useHomeNavigation({ currentPage, pageDirection, pageCount, minimalMode, shortHomeScrollEnabled, overlayOpen })
watch(overlayOpen, (open) => { if (open) cancelHomeSwipe() }, { flush: 'sync' })

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
  if (sidePanel.value) getOverlayFocusable(sidePanel.value)[0]?.focus()
})
watch(shortcutDialog, async (isOpen) => {
  if (isOpen) {
    shortcutDialogElement.value?.showModal()
    return
  }
  const target = shortcutDialogReturnFocusTarget
  shortcutDialogReturnFocusTarget = undefined
  await nextTick()
  if (target?.isConnected) target.focus()
}, { flush: 'post' })

function handlePanelKeydown(event: KeyboardEvent) {
  if (isComposingKey(event)) { event.stopPropagation(); return }
  trapOverlayTab(event, sidePanel.value)
}

function openWebUrl(url: string, newTab: boolean, event?: MouseEvent) {
  if (newTab || event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.button === 1) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else window.location.assign(url)
}

function submitSearch() {
  if (localSearchMode.value) {
    document.querySelector<HTMLButtonElement>('.local-search-result')?.click()
    return
  }
  const destination = buildSearchUrl(preferences.value.engine, preferences.value.mode, query.value, customSearchEngines.value)
  if (destination) openWebUrl(destination, preferences.value.openSearchInNewTab)
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

function setLocalSearch(enabled: boolean) {
  localSearchMode.value = enabled
  query.value = ''
  void nextTick(() => {
    if (searchBar.value) searchBar.value.focusSearch()
    else document.querySelector<HTMLButtonElement>('.home-search-toggle')?.focus()
  })
}

function openLocalSearchResult(match: LauncherSearchMatch, event?: MouseEvent) {
  activeHomeWorkspaceId.value = match.workspaceId
  localSearchMode.value = false
  query.value = ''
  document.querySelector<HTMLButtonElement>('.home-search-toggle')?.focus()
  openItem(match.item, event)
}

function createFromSearch(folder = false) {
  localSearchMode.value = false
  query.value = ''
  document.querySelector<HTMLButtonElement>('.home-search-toggle')?.focus()
  if (folder) openFolderEditor()
  else openShortcutDialog()
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

function openItem(item: LauncherItem, event?: MouseEvent) {
  if (item.folder) openFolder(item.folder)
  else if (item.action) openPanel(launcherPanelRoutes[item.action])
  else if (item.shortcut) {
    const panel = shortcutPanelRoutes[item.shortcut.id]
    if (panel) openPanel(panel)
    else openWebUrl(item.shortcut.url, preferences.value.openShortcutsInNewTab, event)
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

function addHomeWorkspace(name: string): boolean {
  return Boolean(createHomeWorkspace(name))
}

function requestHomeWorkspaceRemoval(id: string) {
  const workspace = homeWorkspaces.value.find((item) => item.id === id)
  if (!workspace) return
  requestDestructiveAction(
    '删除工作区？',
    `“${workspace.name}”中的快捷入口和文件夹会移回“${homeWorkspaces.value.find((item) => item.id === 'default')?.name ?? '主页'}”，不会被删除。`,
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

async function confirmDestructiveAction() {
  const action = pendingDestructiveAction.value
  const previousTarget = destructiveActionFocusTarget
  pendingDestructiveAction.value = undefined
  destructiveActionFocusTarget = undefined
  action?.run()
  await nextTick()
  const target = previousTarget?.isConnected ? previousTarget
    : sidePanel.value?.querySelector<HTMLButtonElement>('.panel-close')
      ?? document.querySelector<HTMLButtonElement>('.home-search-toggle')
  target?.focus()
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

function dockLauncherItem(id: string, targetId?: string, after = false) {
  const dockItemIds = preferences.value.dockItemIds
  const alreadyDocked = dockItemIds.includes(id)
  if (id === targetId || (!alreadyDocked && dockItemIds.length >= maxDockItems)) return
  const next = dockItemIds.filter((itemId) => itemId !== id)
  const targetIndex = targetId ? next.indexOf(targetId) : -1
  if (targetIndex >= 0) next.splice(targetIndex + Number(after), 0, id)
  else if (!alreadyDocked || targetId) next.push(id)
  if (next.length !== dockItemIds.length || next.some((itemId, index) => itemId !== dockItemIds[index])) {
    updatePreferences({ dockItemIds: next })
  }
}

function openFolderShortcut(shortcut: Shortcut, event?: MouseEvent) {
  openWebUrl(shortcut.url, preferences.value.openShortcutsInNewTab, event)
}

function openFolderShortcuts(items: Shortcut[]) {
  for (const shortcut of items) window.open(shortcut.url, '_blank', 'noopener,noreferrer')
}

function openShortcutDialog(item?: LauncherItem) {
  shortcutDialogReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  shortcutDraft.value = item?.shortcut
  shortcutWorkspaceId.value = item?.shortcut
    ? homeWorkspaces.value.find((workspace) => workspace.itemIds.includes(item.shortcut!.id))?.id ?? activeHomeWorkspaceId.value
    : activeHomeWorkspaceId.value
  shortcutSaveError.value = ''
  shortcutDialog.value = true
}

function handleShortcutDialogKeydown(event: KeyboardEvent) {
  if (isComposingKey(event)) { event.stopPropagation(); return }
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    shortcutDialog.value = false
    return
  }
  trapOverlayTab(event, shortcutDialogElement.value)
}

function saveShortcut(shortcut: Shortcut, workspaceId: string) {
  if (!saveShortcutData(shortcut, workspaceId)) {
    shortcutSaveError.value = '最多只能保存 500 个快捷入口，可先删除不用的入口。'
    return
  }
  shortcutSaveError.value = ''
  shortcutDialog.value = false
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

async function downloadBackup() {
  try {
    const { downloadWorkspaceBackup } = await retryAsyncLoad(() => import('./data/downloadBackup'))
    downloadWorkspaceBackup(createBackup())
    backupExportError.value = ''
    storageError.value = ''
  } catch (error) {
    backupExportError.value = error instanceof Error ? `导出失败：${error.message}` : '导出失败，请稍后重试。'
    storageError.value = backupExportError.value
  }
}

function applyWorkspaceBackup(backup: Parameters<typeof restoreBackup>[0], mode: 'merge' | 'replace') {
  if (!window.indexedDB) { backupExportError.value = restoreBackup(backup, mode) ?? ''; return }
  const snapshot = createBackup()
  const expected = JSON.stringify({ ...snapshot, exportedAt: '' })
  void import('./data/backupHistory').then(async module => {
    await module.captureHistory(snapshot, 'before-change')
    if (JSON.stringify({ ...createBackup(), exportedAt: '' }) !== expected) throw new Error('备份期间数据已变化，请重新导入。')
    backupExportError.value = restoreBackup(backup, mode) ?? ''
  }).catch(error => { backupExportError.value = '导入已停止：' + (error instanceof Error ? error.message : '无法保存恢复点。') })
}

function openLayoutEditor() {
  if (!overlayOpen.value) layoutEditorOpen.value = true
}
function applyHomeLayout(draft: LayoutEditorDraft) {
  const error = saveHomeLayout(draft)
  if (!error) layoutEditorOpen.value = false
  return error
}

function openCommandPalette() {
  if (!overlayOpen.value) commandPaletteOpen.value = true
}

async function runCommand(id: string) {
  commandPaletteOpen.value = false
  await nextTick()
  if (id === 'find') setLocalSearch(true)
  else if (id === 'add') openShortcutDialog()
  else if (id === 'layout') openLayoutEditor()
  else if (id === 'minimal') toggleMinimalMode()
  else if (id === 'light' || id === 'dark' || id === 'system') updatePreferences({ themeMode: id })
  else if (id === 'home') goToPage(0)
  else if (id.startsWith('panel:')) openPanel(id.slice(6) as PanelId)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || isComposingKey(event) || pendingDestructiveAction.value) return
  if (layoutEditorOpen.value) {
    if (event.key === 'Escape') layoutEditorOpen.value = false
    return
  }
  if (commandPaletteOpen.value) {
    if (event.key === 'Escape') commandPaletteOpen.value = false
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p' && !activePanel.value && !shortcutDialog.value && !folderDialogOpen.value) {
    event.preventDefault()
    openCommandPalette()
    return
  }
  if (event.key === 'Escape') {
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
    if (localSearchMode.value) {
      setLocalSearch(false)
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
    setLocalSearch(true)
    return
  }
  const focusSearchShortcut = event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey
    || event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)
  if (focusSearchShortcut && !editingText && !activePanel.value && !shortcutDialog.value && !folderDialogOpen.value) {
    event.preventDefault()
    if (searchBar.value) searchBar.value.focusSearch()
    else setLocalSearch(true)
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

let historyTimer: ReturnType<typeof setTimeout> | undefined
let historyDisposed = false
onMounted(() => {
  if (window.indexedDB) historyTimer = setTimeout(() => { void import('./data/backupHistory').then(module => {
    if (!historyDisposed) return module.captureDailyHistory(() => historyDisposed ? undefined : createBackup())
  }).catch(() => undefined) }, 2000)
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
  historyDisposed = true
  if (historyTimer !== undefined) clearTimeout(historyTimer)
  applyCustomTheme(document.documentElement)
  delete document.documentElement.dataset.themePalette
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
  if (systemThemeQuery?.removeEventListener) systemThemeQuery.removeEventListener('change', updateSystemTheme)
  else systemThemeQuery?.removeListener?.(updateSystemTheme)
  systemThemeQuery = undefined
})
</script>

<template>
  <main class="home" :class="{ 'theme-dark': effectiveTheme === 'dark', 'home-scrollable': !minimalMode && (showHomeWidgets || shortHomeScrollEnabled), 'home-with-dock': homeDockItems.length > 0, 'home-minimal': minimalMode }" :style="backgroundStyle" @pointerdown="startHomeSwipe" @pointerup="finishHomeSwipe" @pointercancel="cancelHomeSwipe()" @wheel="handleHomeWheel">
    <a class="skip-link" href="#main-content">跳到快捷入口</a>
    <h1 class="visually-hidden">Infinity 新标签页</h1>
    <div class="background-shade"></div>
    <div class="home-brand" aria-label="Infinity 新标签页"><span class="brand-mark" aria-hidden="true">∞</span><span class="brand-word">infinity</span><span class="brand-label">新标签页</span></div>
    <header class="home-actions">
      <button type="button" class="round-action home-command-toggle" aria-label="打开命令面板" title="命令面板（Ctrl/⌘+Shift+P）" @click="openCommandPalette"><span aria-hidden="true">⌘</span></button>
      <button v-if="!minimalMode" type="button" class="round-action home-create-shortcut" aria-label="新建快捷入口" title="新建快捷入口" @click="openShortcutDialog()"><Plus :size="19" /></button>
      <button type="button" class="round-action home-search-toggle" aria-label="查找快捷入口" title="查找快捷入口（Ctrl/⌘+F）" :aria-pressed="localSearchMode" @click="setLocalSearch(!localSearchMode)"><Search :size="18" /></button>
      <button type="button" class="round-action minimal-mode-toggle" :aria-label="minimalMode ? '退出极简模式' : '进入极简模式'" :aria-pressed="minimalMode" :title="minimalMode ? '退出极简模式' : '进入极简模式'" @click="toggleMinimalMode"><X v-if="minimalMode" :size="18" /><span v-else class="minimal-mode-symbol" aria-hidden="true"></span></button>
      <button type="button" class="round-action" aria-label="回到首页" title="回到首页" @click="goToPage(0)"><House :size="19" /></button>
      <button type="button" class="round-action" aria-label="打开设置" title="打开设置" @click="openPanel('settings')"><Menu :size="21" /></button>
    </header>

    <section id="main-content" class="home-content" :class="{ 'home-content-minimal': minimalMode }" tabindex="-1">
      <ClockWidget v-if="preferences.showClock" />
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
        :create-workspace="addHomeWorkspace"
        :rename-workspace="renameHomeWorkspace"
        :global-layout="preferences"
        :save-layout="saveWorkspaceLayout"
        @move="moveHomeWorkspace"
        @remove="requestHomeWorkspaceRemoval"
        @edit-home-layout="openLayoutEditor"
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
        :autofocus="minimalMode || localSearchMode"
        @exit-local-search="setLocalSearch(false)"
        @search="submitSearch"
        @translate="submitTranslation"
      >
        <template #local-results>
          <LauncherSearchResults
            v-if="localSearchMode"
            :query="query"
            :items="availableLauncherItems"
            :folders="folders"
            :workspaces="homeWorkspaces"
            :active-workspace-id="activeHomeWorkspaceId"
            :hidden-item-ids="preferences.hiddenLauncherIds"
            @open="openLocalSearchResult"
            @focus-search="searchBar?.focusSearch()"
            @add-shortcut="createFromSearch()"
            @add-folder="createFromSearch(true)"
          />
        </template>
      </SearchBar>
      <ShortcutGrid
        v-if="!minimalMode"
        :items="allLauncherItems"
        :folder-shortcuts="folderPreviewItems"
        :dock-item-ids="preferences.dockItemIds"
        :columns="layoutColumns"
        :rows="layoutPreferences.rows"
        :icon-size="layoutPreferences.iconSize"
        :icon-radius="layoutPreferences.iconRadius"
        :show-names="layoutPreferences.showNames"
        :current-page="currentPage"
        :transition-direction="pageDirection"
        :wheel-offset="wheelOffset"
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
      <nav v-if="pageCount > 1 && !minimalMode" class="page-dots" aria-label="快捷入口页码" title="点击圆点或使用左右方向键、滑动切换">
        <template v-for="item in pageNavigation" :key="item.kind === 'page' ? `page-${item.page}` : item.id">
          <button v-if="item.kind === 'page'" type="button" :aria-label="`第${item.page + 1}页`" :aria-current="item.page === currentPage ? 'page' : undefined" class="page-dot" :class="{ active: item.page === currentPage }" @click="goToPage(item.page)"></button>
          <span v-else class="page-ellipsis" aria-hidden="true">…</span>
        </template>
      </nav>
    </section>

    <HomeDock v-if="homeDockItems.length && !minimalMode" :items="homeDockItems" :magnification-enabled="preferences.dockMagnification" :icon-size="preferences.dockFollowLauncherSize ? layoutPreferences.iconSize : preferences.dockIconSize" :icon-gap="preferences.dockIconGap" :dark-theme="effectiveTheme === 'dark'" :auto-hide="preferences.dockAutoHide" @reorder="dockLauncherItem" @open="openItem" @remove="toggleDockItem" />

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

    <HomeLayoutEditor v-if="layoutEditorOpen" :workspace="activeHomeWorkspace" :preferences="preferences" :save="applyHomeLayout" @close="layoutEditorOpen = false" />
    <CommandPalette v-if="commandPaletteOpen" @close="commandPaletteOpen = false" @run="runCommand" />

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

    <dialog v-if="shortcutDialog" ref="shortcutDialogElement" class="shortcut-dialog shortcut-editor" closedby="any" aria-labelledby="shortcut-dialog-title" aria-describedby="shortcut-dialog-description" @cancel.prevent="shortcutDialog = false" @keydown="handleShortcutDialogKeydown">
      <header><div><h2 id="shortcut-dialog-title">{{ shortcutDraft?.id ? '编辑快捷入口' : '添加快捷入口' }}</h2><p id="shortcut-dialog-description">名称和网址为必填项</p></div><button type="button" aria-label="关闭" @click="shortcutDialog = false"><X :size="19" /></button></header>
      <ShortcutEditor :shortcut="shortcutDraft" :initial-workspace-id="shortcutWorkspaceId" :workspaces="homeWorkspaces" :limit-reached="shortcutLimitReached" :save-error="shortcutSaveError" @save="saveShortcut" @close="shortcutDialog = false" />
    </dialog>

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
