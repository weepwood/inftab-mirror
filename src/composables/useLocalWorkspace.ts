import type { ShortcutBatch } from '../data/workspaceTools'
import { useStoredState } from './useStoredState'
import { computed, watch } from 'vue'
import { watchDeferredReference } from './watchDeferredReference'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts, launcherItems } from '../data/defaults'
import { sanitizeWorkspaceLayout, type WorkspaceLayoutOverrides } from '../data/workspaceLayout'
import { createProductivityActions } from './workspaceProductivity'
import { createLauncherActions } from './workspaceLauncher'
import { createBackupActions } from './workspaceBackup'
import { mergeHomeWorkspaceChanges } from '../data/workspaceOwnership'
import { migrateLegacyShortcuts } from '../data/legacyShortcutMigration'
import { localStorageAdapter } from '../data/storageAdapter'
import { sanitizeActiveNoteId, sanitizeCountdowns, sanitizeCustomSearchEngines, sanitizeFolders, sanitizeHabits, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from '../data/sanitize'
import { isValidCustomSearchTemplate } from '../data/search'
import { defaultFocusTimerState, sanitizeFocusTimerState } from '../data/focusTimerState'
import { defaultHomeWorkspace, defaultHomeWorkspaceId, sanitizeActiveHomeWorkspaceId, sanitizeHomeWorkspaces, type HomeWorkspace } from '../data/homeWorkspaces'
import type { CountdownItem, CustomSearchEngine, Habit, Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'
import { createLocalId } from '../data/createId'
import { truncateCodePoints } from '../data/text'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences, sanitizePreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts, sanitizeShortcuts)
  const folders = useStoredState<ShortcutFolder[]>(
    'inftab.folders.v1',
    [],
    (value) => sanitizeFolders(value, shortcuts.value, { preserveUnknownShortcuts: true }),
  )
  const launcherOrder = useStoredState<string[]>('inftab.launcher-order.v1', defaultLauncherOrder, (value) => sanitizeLauncherOrder(value, shortcuts.value, folders.value))
  const builtInLauncherIds = launcherItems.map((item) => item.id)

  const homeWorkspaces = useStoredState<HomeWorkspace[]>(
    'inftab.home-workspaces.v1',
    [defaultHomeWorkspace([...launcherOrder.value, ...shortcuts.value.map((item) => item.id), ...folders.value.map((item) => item.id)])],
    (value) => sanitizeHomeWorkspaces(value, launcherOrder.value, builtInLauncherIds),
    {
      clearFallback: [defaultHomeWorkspace(defaultLauncherOrder)],
      resolveConcurrentChanges: (current, previous, external, mergeDefault) => mergeHomeWorkspaceChanges(builtInLauncherIds, current, previous, external, mergeDefault),
    },
  )
  const activeHomeWorkspaceId = useStoredState<string>(
    'inftab.active-home-workspace.v1',
    defaultHomeWorkspaceId,
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : defaultHomeWorkspaceId,
  )
  const initialActiveHomeWorkspaceId = sanitizeActiveHomeWorkspaceId(activeHomeWorkspaceId.value, homeWorkspaces.value)
  if (initialActiveHomeWorkspaceId !== activeHomeWorkspaceId.value) activeHomeWorkspaceId.value = initialActiveHomeWorkspaceId
  const reconcileActiveHomeWorkspace = watchDeferredReference(
    activeHomeWorkspaceId,
    (id) => homeWorkspaces.value.some((workspace) => workspace.id === id),
    () => sanitizeActiveHomeWorkspaceId(activeHomeWorkspaceId.value, homeWorkspaces.value),
  )
  watch(homeWorkspaces, reconcileActiveHomeWorkspace, { flush: 'sync' })
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [], sanitizeTodos)
  const habits = useStoredState<Habit[]>('inftab.habits.v1', [], sanitizeHabits)
  const countdowns = useStoredState<CountdownItem[]>('inftab.countdowns.v1', [], sanitizeCountdowns)
  const notes = useStoredState<Note[]>('inftab.notes.v1', [], sanitizeNotes)
  const customSearchEngines = useStoredState<CustomSearchEngine[]>('inftab.custom-search-engines.v1', [], sanitizeCustomSearchEngines)
  const activeNoteId = useStoredState<string>(
    'inftab.active-note.v1',
    '',
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : '',
  )
  const initialActiveNoteId = sanitizeActiveNoteId(activeNoteId.value, notes.value)
  if (initialActiveNoteId !== activeNoteId.value) activeNoteId.value = initialActiveNoteId
  const reconcileActiveNote = watchDeferredReference(
    activeNoteId,
    (id) => notes.value.some((note) => note.id === id) || (!id && notes.value.length === 0),
    () => sanitizeActiveNoteId(activeNoteId.value, notes.value),
  )
  watch(notes, reconcileActiveNote, { flush: 'sync' })
  let previousWeatherCity = '上海'
  try {
    previousWeatherCity = localStorageAdapter.read('inftab.weather-city') ?? previousWeatherCity
  } catch {
    // Fall back to the default city when browser storage is unavailable.
  }
  const weatherCity = useStoredState<string>('inftab.weather-city.v1', previousWeatherCity, sanitizeWeatherCity)
  const focusTimer = useStoredState('inftab.focus-timer.v1', defaultFocusTimerState, sanitizeFocusTimerState, { mergeConcurrentChanges: false })

  let focusTimerActionQueue = Promise.resolve()
  function enqueueFocusTimerAction(action: (helpers: typeof import('../data/focusTimer')) => void) {
    const nextAction = focusTimerActionQueue.then(async () => {
      const helpers = await import('../data/focusTimer')
      action(helpers)
    })
    focusTimerActionQueue = nextAction.catch(() => undefined)
    return nextAction
  }

  function startFocusTimer() {
    return enqueueFocusTimerAction(({ startFocusTimer: start }) => {
      focusTimer.value = start(focusTimer.value, Date.now())
    })
  }

  function pauseFocusTimer() {
    return enqueueFocusTimerAction(({ pauseFocusTimer: pause }) => {
      focusTimer.value = pause(focusTimer.value, Date.now())
    })
  }

  function resetFocusTimer() {
    return enqueueFocusTimerAction(({ resetFocusTimer: reset }) => {
      focusTimer.value = reset(focusTimer.value)
    })
  }

  function setFocusDuration(minutes: number) {
    return enqueueFocusTimerAction(({ setFocusDuration: updateDuration }) => {
      focusTimer.value = updateDuration(focusTimer.value, minutes)
    })
  }

  function tickFocusTimer(now = Date.now()) {
    return enqueueFocusTimerAction(({ advanceFocusTimer }) => {
      focusTimer.value = advanceFocusTimer(focusTimer.value, now)
    })
  }

  watch([shortcuts, folders], ([currentShortcuts, currentFolders], [previousShortcuts]) => {
    const cleanFolders = sanitizeFolders(currentFolders, currentShortcuts, {
      preserveUnknownShortcuts: currentShortcuts === previousShortcuts,
    })
    if (JSON.stringify(cleanFolders) !== JSON.stringify(folders.value)) folders.value = cleanFolders

    const cleanLauncherOrder = sanitizeLauncherOrder(launcherOrder.value, shortcuts.value, folders.value)
    if (JSON.stringify(cleanLauncherOrder) !== JSON.stringify(launcherOrder.value)) launcherOrder.value = cleanLauncherOrder

    const validDockIds = new Set([
      ...launcherItems.filter((item) => item.action && item.id !== 'settings').map((item) => item.id),
      ...shortcuts.value.map((shortcut) => shortcut.id),
      ...folders.value.map((folder) => folder.id),
    ])
    const dockItemIds = preferences.value.dockItemIds.filter((id) => validDockIds.has(id))
    if (dockItemIds.length !== preferences.value.dockItemIds.length) {
      preferences.value = sanitizePreferences({ ...preferences.value, dockItemIds })
    }
  }, { flush: 'sync', immediate: true })

  const selectedSearchEngine = computed({
    get: () => preferences.value.engine,
    set: (engine: Preferences['engine']) => {
      preferences.value = sanitizePreferences({ ...preferences.value, engine })
    },
  })
  const isSearchEngineAvailable = (engine: string) => !engine.startsWith('custom:')
    || customSearchEngines.value.some((item) => 'custom:' + item.id === engine)
  if (!isSearchEngineAvailable(selectedSearchEngine.value)) {
    selectedSearchEngine.value = defaultPreferences.engine
  }
  const reconcileSelectedSearchEngine = watchDeferredReference(
    selectedSearchEngine,
    isSearchEngineAvailable,
    () => defaultPreferences.engine,
  )
  watch(customSearchEngines, reconcileSelectedSearchEngine, { flush: 'sync' })

  shortcuts.value = migrateLegacyShortcuts(shortcuts.value)

  const { createHomeWorkspace, renameHomeWorkspace, moveHomeWorkspace, removeHomeWorkspace, saveShortcut, addShortcuts, removeShortcut, saveFolder, removeFolder, setVisibleLauncherOrder, reorderLauncherItems } = createLauncherActions({ preferences, shortcuts, folders, launcherOrder, homeWorkspaces, activeHomeWorkspaceId, builtInLauncherIds })

  const { addTodo, toggleTodo, updateTodo, removeTodo, clearCompletedTodos, addHabit, updateHabit, toggleHabitToday, removeHabit, addCountdown, updateCountdown, removeCountdown, addNote, updateNote, removeNote } = createProductivityActions({ todos, habits, countdowns, notes, activeNoteId })

  function saveWorkspaceLayout(id: string, layout?: WorkspaceLayoutOverrides): boolean {
    if (!homeWorkspaces.value.some(workspace => workspace.id === id)) return false
    const clean = sanitizeWorkspaceLayout(layout)
    if (layout !== undefined && !clean) return false
    homeWorkspaces.value = homeWorkspaces.value.map(workspace => {
      if (workspace.id !== id) return workspace
      const { layout: _previous, ...rest } = workspace
      return clean ? { ...rest, layout: clean } : rest
    })
    return true
  }

  function updatePreferences(update: Partial<Preferences>) {
    preferences.value = sanitizePreferences({ ...preferences.value, ...update })
  }

  function addCustomSearchEngine(name: string, template: string) {
    const cleanName = truncateCodePoints(name.trim(), 40)
    const cleanTemplate = template.trim()
    if (!cleanName || !isValidCustomSearchTemplate(cleanTemplate) || customSearchEngines.value.length >= 20) return
    const engine: CustomSearchEngine = { id: createLocalId(), name: cleanName, template: cleanTemplate }
    customSearchEngines.value = [...customSearchEngines.value, engine]
    preferences.value = sanitizePreferences({ ...preferences.value, engine: 'custom:' + engine.id })
  }

  function removeCustomSearchEngine(id: string) {
    customSearchEngines.value = customSearchEngines.value.filter((engine) => engine.id !== id)
    if (preferences.value.engine === 'custom:' + id) {
      preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
    }
  }

  function resetPreferences() {
    preferences.value = sanitizePreferences(defaultPreferences)
  }

  const { createBackup, restoreBackup } = createBackupActions({ preferences, shortcuts, folders, launcherOrder, homeWorkspaces, activeHomeWorkspaceId, builtInLauncherIds, todos, habits, countdowns, notes, customSearchEngines, focusTimer, activeNoteId, weatherCity })

  async function applyShortcutBatch(action: ShortcutBatch): Promise<string | undefined> {
    try {
      const { planShortcutBatch } = await import('../data/shortcutBatch')
      const next = planShortcutBatch(createBackup(), action)
      if (action.kind !== 'move') shortcuts.value = next.shortcuts
      if (action.kind === 'move' || action.kind === 'delete') {
        folders.value = next.folders
        homeWorkspaces.value = next.homeWorkspaces!
      }
      if (action.kind === 'delete') {
        launcherOrder.value = next.launcherOrder
        preferences.value = next.preferences
      }
      return undefined
    } catch (error) { return error instanceof Error ? error.message : '批量操作失败。' }
  }

  return {
    applyShortcutBatch,
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
    customSearchEngines,
    activeNoteId,
    weatherCity,
    focusTimer,
    saveShortcut,
    addShortcuts,
    removeShortcut,
    saveFolder,
    removeFolder,
    createHomeWorkspace,
    renameHomeWorkspace,
    moveHomeWorkspace,
    removeHomeWorkspace,
    reorderLauncherItems,
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
  }
}
