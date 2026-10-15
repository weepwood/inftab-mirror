import { useStoredState } from './useStoredState'
import { computed, watch } from 'vue'
import { watchDeferredReference } from './watchDeferredReference'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts, launcherItems } from '../data/defaults'
import type { WorkspaceBackup } from '../data/backup'
import { mergeById } from '../data/mergeById'
import { isValidCalendarDate } from '../data/countdown'
import { isValidLauncherColor, sanitizeActiveNoteId, sanitizeCountdowns, sanitizeCustomSearchEngines, sanitizeFolders, sanitizeHabits, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from '../data/sanitize'
import { isValidCustomSearchTemplate } from '../data/search'
import { defaultFocusTimerState, sanitizeFocusTimerState } from '../data/focusTimerState'
import { defaultHomeWorkspace, defaultHomeWorkspaceId, maxHomeWorkspaceNameLength, maxHomeWorkspaces, sanitizeActiveHomeWorkspaceId, sanitizeHomeWorkspaces, type HomeWorkspace } from '../data/homeWorkspaces'
import type { CountdownItem, CountdownRecurrence, CustomSearchEngine, Habit, Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'
import { getLocalDateKey, maxCompletionDatesPerHabit, maxHabits, maxHabitTitleLength } from '../data/habits'
import { createLocalId } from '../data/createId'
import { truncateCodePoints, truncateCodeUnits } from '../data/text'

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

  function mergeHomeWorkspaceChanges(
    current: HomeWorkspace[],
    previous: HomeWorkspace[],
    external: HomeWorkspace[],
    mergeDefault: (current: HomeWorkspace[], previous: HomeWorkspace[], external: HomeWorkspace[]) => HomeWorkspace[],
  ) {
    const merged = mergeDefault(current, previous, external)
    const builtInIds = new Set(builtInLauncherIds)
    const getOwners = (workspaces: HomeWorkspace[]) => {
      const owners = new Map<string, string>()
      for (const workspace of workspaces) {
        for (const itemId of workspace.itemIds) {
          if (!builtInIds.has(itemId) && !owners.has(itemId)) owners.set(itemId, workspace.id)
        }
      }
      return owners
    }
    const previousOwners = getOwners(previous)
    const currentOwners = getOwners(current)
    const externalOwners = getOwners(external)
    const allItemIds = new Set([...previousOwners.keys(), ...currentOwners.keys(), ...externalOwners.keys()])
    const ownerByItem = new Map<string, string | undefined>()

    for (const itemId of allItemIds) {
      const previousOwner = previousOwners.get(itemId)
      const currentOwner = currentOwners.get(itemId)
      const externalOwner = externalOwners.get(itemId)
      const localChanged = currentOwner !== previousOwner
      const externalChanged = externalOwner !== previousOwner
      ownerByItem.set(itemId, externalChanged ? externalOwner : localChanged ? currentOwner : previousOwner)
    }

    const mergedWorkspaceIds = new Set(merged.map((workspace) => workspace.id))
    for (const [itemId, ownerId] of ownerByItem) {
      if (ownerId && !mergedWorkspaceIds.has(ownerId)) ownerByItem.set(itemId, defaultHomeWorkspaceId)
    }
    const resolvedItemsByWorkspace = new Map<string, string[]>()
    for (const [itemId, ownerId] of ownerByItem) {
      if (!ownerId || !mergedWorkspaceIds.has(ownerId)) continue
      const resolvedItems = resolvedItemsByWorkspace.get(ownerId) ?? []
      resolvedItems.push(itemId)
      resolvedItemsByWorkspace.set(ownerId, resolvedItems)
    }

    return merged.map((workspace) => ({
      ...workspace,
      itemIds: [
        ...workspace.itemIds.filter((itemId) => !ownerByItem.has(itemId)),
        ...(resolvedItemsByWorkspace.get(workspace.id) ?? []),
      ],
    }))
  }

  const homeWorkspaces = useStoredState<HomeWorkspace[]>(
    'inftab.home-workspaces.v1',
    [defaultHomeWorkspace([...launcherOrder.value, ...shortcuts.value.map((item) => item.id), ...folders.value.map((item) => item.id)])],
    (value) => sanitizeHomeWorkspaces(value, launcherOrder.value, builtInLauncherIds),
    {
      clearFallback: [defaultHomeWorkspace(defaultLauncherOrder)],
      resolveConcurrentChanges: mergeHomeWorkspaceChanges,
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
    previousWeatherCity = localStorage.getItem('inftab.weather-city') ?? previousWeatherCity
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

  const defaultShortcutById = new Map(defaultShortcuts.map((shortcut) => [shortcut.id, shortcut]))
  const outdatedDefaultIcons: Record<string, string> = {
    lunwenmao: 'ebd5cc9193de437e76de2ca1abd2121.png',
    fox: '24f02a8178e623d22dc563857bf32f8.png',
    infinitytab: 'bc545d7b32d3c84c3041ca092fb2689.png',
  }
  const outdatedDefaultUrls: Record<string, string> = {
    fox: 'https://www.google.com/',
    games: 'https://inftab.com/',
    infinitytab: 'https://inftab.com/',
  }
  shortcuts.value = shortcuts.value.map((shortcut) => {
    const defaults = defaultShortcutById.get(shortcut.id)
    const outdatedIcon = outdatedDefaultIcons[shortcut.id]
    const icon = shortcut.icon === outdatedIcon ? defaults?.icon : shortcut.icon ?? defaults?.icon
    const url = shortcut.url === outdatedDefaultUrls[shortcut.id] ? defaults?.url ?? shortcut.url : shortcut.url
    return defaults ? { ...defaults, ...shortcut, icon, url } : shortcut
  })

  function updateWorkspaceLauncherMembership(id: string, workspaceId: string) {
    if (!homeWorkspaces.value.some((workspace) => workspace.id === workspaceId)) return false
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.id === workspaceId
        ? [...new Set([...workspace.itemIds, id])]
        : workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    return true
  }

  function createHomeWorkspace(name: string): string | undefined {
    if (homeWorkspaces.value.length >= maxHomeWorkspaces) return undefined
    const cleanName = truncateCodePoints(name.trim(), maxHomeWorkspaceNameLength)
    if (!cleanName || homeWorkspaces.value.some((workspace) => workspace.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return undefined
    const id = createLocalId()
    homeWorkspaces.value = [...homeWorkspaces.value, { id, name: cleanName, itemIds: [...builtInLauncherIds] }]
    activeHomeWorkspaceId.value = id
    return id
  }

  function renameHomeWorkspace(id: string, name: string): boolean {
    const cleanName = truncateCodePoints(name.trim(), maxHomeWorkspaceNameLength)
    if (!cleanName || homeWorkspaces.value.some((workspace) => workspace.id !== id && workspace.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return false
    const exists = homeWorkspaces.value.some((workspace) => workspace.id === id)
    if (!exists) return false
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => workspace.id === id ? { ...workspace, name: cleanName } : workspace)
    return true
  }

  function moveHomeWorkspace(id: string, direction: -1 | 1): boolean {
    const index = homeWorkspaces.value.findIndex((workspace) => workspace.id === id)
    const nextIndex = index + direction
    if (index <= 0 || nextIndex <= 0 || nextIndex >= homeWorkspaces.value.length) return false
    const next = [...homeWorkspaces.value]
    const [workspace] = next.splice(index, 1)
    if (!workspace) return false
    next.splice(nextIndex, 0, workspace)
    homeWorkspaces.value = next
    return true
  }

  function removeHomeWorkspace(id: string): boolean {
    if (id === defaultHomeWorkspaceId || !homeWorkspaces.value.some((workspace) => workspace.id === id)) return false
    const removed = homeWorkspaces.value.find((workspace) => workspace.id === id)!
    const defaultItems = removed.itemIds.filter((itemId) => !builtInLauncherIds.includes(itemId))
    homeWorkspaces.value = homeWorkspaces.value
      .filter((workspace) => workspace.id !== id)
      .map((workspace) => workspace.id === defaultHomeWorkspaceId
        ? { ...workspace, itemIds: [...new Set([...workspace.itemIds, ...defaultItems])] }
        : workspace)
    if (activeHomeWorkspaceId.value === id) activeHomeWorkspaceId.value = defaultHomeWorkspaceId
    return true
  }

  function saveShortcut(shortcut: Shortcut, workspaceId = activeHomeWorkspaceId.value): boolean {
    if (!homeWorkspaces.value.some((workspace) => workspace.id === workspaceId)
      || folders.value.some((folder) => folder.id === shortcut.id)
      || !isValidLauncherColor(shortcut.color)) return false
    const exists = shortcuts.value.some((item) => item.id === shortcut.id)
    const next = exists
      ? shortcuts.value.map((item) => item.id === shortcut.id ? shortcut : item)
      : [...shortcuts.value, shortcut]
    const sanitized = sanitizeShortcuts(next)
    if (!sanitized.some((item) => item.id === shortcut.id)) return false
    shortcuts.value = sanitized
    if (!exists && !launcherOrder.value.includes(shortcut.id)) launcherOrder.value = [...launcherOrder.value, shortcut.id]
    updateWorkspaceLauncherMembership(shortcut.id, workspaceId)
    return true
  }

  function addShortcuts(items: Shortcut[], workspaceId = activeHomeWorkspaceId.value): boolean {
    if (!items.length || !homeWorkspaces.value.some((workspace) => workspace.id === workspaceId)
      || shortcuts.value.length + items.length > 500) return false
    const existingLauncherIds = new Set([
      ...shortcuts.value.map((item) => item.id),
      ...folders.value.map((item) => item.id),
      ...builtInLauncherIds,
    ])
    const incomingIds = new Set<string>()
    for (const item of items) {
      if (existingLauncherIds.has(item.id) || incomingIds.has(item.id)) return false
      incomingIds.add(item.id)
    }
    const next = sanitizeShortcuts([...shortcuts.value, ...items])
    if (next.length !== shortcuts.value.length + items.length) return false

    shortcuts.value = next
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...items.map((item) => item.id)], shortcuts.value, folders.value)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, itemIds: [...new Set([...workspace.itemIds, ...items.map((item) => item.id)])] }
      : workspace)
    return true
  }

  function removeShortcut(id: string) {
    shortcuts.value = shortcuts.value.filter((shortcut) => shortcut.id !== id)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    folders.value = sanitizeFolders(folders.value.map((folder) => ({
      ...folder,
      shortcutIds: folder.shortcutIds.filter((shortcutId) => shortcutId !== id),
    })), shortcuts.value)
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
    preferences.value = sanitizePreferences({ ...preferences.value, dockItemIds: preferences.value.dockItemIds.filter((itemId) => itemId !== id) })
  }

  function saveFolder(folder: ShortcutFolder, workspaceId = activeHomeWorkspaceId.value): boolean {
    if (!homeWorkspaces.value.some((workspace) => workspace.id === workspaceId) || !isValidLauncherColor(folder.color)) return false
    const exists = folders.value.some((item) => item.id === folder.id)
    const next = exists
      ? folders.value.map((item) => item.id === folder.id ? folder : item)
      : [...folders.value, folder]
    const sanitized = sanitizeFolders(next, shortcuts.value)
    if (!sanitized.some((item) => item.id === folder.id)) return false
    folders.value = sanitized
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...(exists ? [] : [folder.id])], shortcuts.value, folders.value)
    updateWorkspaceLauncherMembership(folder.id, workspaceId)
    return true
  }

  function removeFolder(id: string) {
    folders.value = folders.value.filter((folder) => folder.id !== id)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
    preferences.value = sanitizePreferences({ ...preferences.value, dockItemIds: preferences.value.dockItemIds.filter((itemId) => itemId !== id) })
  }

  function setVisibleLauncherOrder(visibleOrder: string[]) {
    const visibleIds = new Set(visibleOrder)
    const next = [...launcherOrder.value]
    const existingIds = new Set(next)
    for (const id of visibleOrder) {
      if (!existingIds.has(id)) {
        next.push(id)
        existingIds.add(id)
      }
    }
    let visibleIndex = 0
    for (let index = 0; index < next.length; index += 1) {
      if (visibleIds.has(next[index]!)) {
        next[index] = visibleOrder[visibleIndex++]!
      }
    }
    launcherOrder.value = next
  }

  function reorderLauncherItems(sourceId: string, targetId: string, currentIds: string[]) {
    const visibleOrder = [...currentIds]
    const sourceIndex = visibleOrder.indexOf(sourceId)
    const targetIndex = visibleOrder.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = visibleOrder.splice(sourceIndex, 1)
    if (!source) return
    visibleOrder.splice(visibleOrder.indexOf(targetId), 0, source)

    setVisibleLauncherOrder(visibleOrder)
  }

  function addTodo(title: string) {
    const cleanTitle = truncateCodePoints(title.trim(), 500)
    if (!cleanTitle || todos.value.length >= 500) return
    todos.value = [{ id: createLocalId(), title: cleanTitle, done: false }, ...todos.value]
  }

  function toggleTodo(id: string) {
    todos.value = todos.value.map((item) => item.id === id ? { ...item, done: !item.done } : item)
  }

  function updateTodo(id: string, title: string) {
    const nextTitle = truncateCodePoints(title.trim(), 500)
    if (!nextTitle) return
    todos.value = todos.value.map((item) => item.id === id ? { ...item, title: nextTitle } : item)
  }

  function removeTodo(id: string) {
    todos.value = todos.value.filter((item) => item.id !== id)
  }

  function clearCompletedTodos() {
    todos.value = todos.value.filter((item) => !item.done)
  }

  function addHabit(title: string) {
    const cleanTitle = truncateCodePoints(title.trim(), maxHabitTitleLength)
    if (!cleanTitle || habits.value.length >= maxHabits) return
    habits.value = [{ id: createLocalId(), title: cleanTitle, completedDates: [] }, ...habits.value]
  }

  function updateHabit(id: string, title: string) {
    const cleanTitle = truncateCodePoints(title.trim(), maxHabitTitleLength)
    if (!cleanTitle) return
    habits.value = habits.value.map((habit) => habit.id === id ? { ...habit, title: cleanTitle } : habit)
  }

  function toggleHabitToday(id: string) {
    const today = getLocalDateKey()
    habits.value = habits.value.map((habit) => {
      if (habit.id !== id) return habit
      return {
        ...habit,
        completedDates: habit.completedDates.includes(today)
          ? habit.completedDates.filter((date) => date !== today)
          : [...habit.completedDates, today].sort().slice(-maxCompletionDatesPerHabit),
      }
    })
  }

  function removeHabit(id: string) {
    habits.value = habits.value.filter((habit) => habit.id !== id)
  }

  function addCountdown(title: string, date: string, recurrence: CountdownRecurrence) {
    const cleanTitle = truncateCodePoints(title.trim(), 80)
    if (!cleanTitle || !isValidCalendarDate(date) || (recurrence !== 'once' && recurrence !== 'yearly')) return
    const next = sanitizeCountdowns([{ id: createLocalId(), title: cleanTitle, date, recurrence }, ...countdowns.value])
    if (next.length > countdowns.value.length) countdowns.value = next
  }

  function updateCountdown(id: string, title: string, date: string, recurrence: CountdownRecurrence) {
    const cleanTitle = truncateCodePoints(title.trim(), 80)
    if (!cleanTitle || !isValidCalendarDate(date) || (recurrence !== 'once' && recurrence !== 'yearly')) return
    countdowns.value = sanitizeCountdowns(countdowns.value.map((item) => item.id === id
      ? { ...item, title: cleanTitle, date, recurrence }
      : item))
  }

  function removeCountdown(id: string) {
    countdowns.value = countdowns.value.filter((item) => item.id !== id)
  }

  function addNote() {
    if (notes.value.length >= 500) return
    const note: Note = { id: createLocalId(), title: '', body: '', updatedAt: Date.now() }
    notes.value = [note, ...notes.value]
    activeNoteId.value = note.id
  }

  function updateNote(id: string, field: 'title' | 'body', value: string) {
    const boundedValue = field === 'title' ? truncateCodePoints(value, 500) : truncateCodeUnits(value, 500_000)
    notes.value = notes.value.map((note) => note.id === id ? { ...note, [field]: boundedValue, updatedAt: Date.now() } : note)
  }

  function removeNote(id: string) {
    notes.value = notes.value.filter((note) => note.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = notes.value[0]?.id ?? ''
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

  function createBackup(): WorkspaceBackup {
    const snapshot: WorkspaceBackup = {
      format: 'inftab-workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: preferences.value,
      shortcuts: shortcuts.value,
      folders: folders.value,
      launcherOrder: [...launcherOrder.value],
      todos: todos.value,
      habits: habits.value,
      countdowns: countdowns.value,
      notes: notes.value,
      customSearchEngines: customSearchEngines.value,
      focusTimer: focusTimer.value,
      activeNoteId: activeNoteId.value,
      weatherCity: weatherCity.value,
      homeWorkspaces: homeWorkspaces.value,
      activeHomeWorkspaceId: activeHomeWorkspaceId.value,
    }
    return JSON.parse(JSON.stringify(snapshot)) as WorkspaceBackup
  }

  function restoreBackup(backup: WorkspaceBackup, mode: 'merge' | 'replace'): string | undefined {
    if (backup.homeWorkspaces && backup.homeWorkspaces.length > maxHomeWorkspaces) {
      return `导入失败：主页工作区超过数量上限（最多 ${maxHomeWorkspaces} 组），未导入任何数据。`
    }
    const importedShortcuts = sanitizeShortcuts(backup.shortcuts)
    const importedFolders = sanitizeFolders(backup.folders, importedShortcuts)
    const importedTodos = sanitizeTodos(backup.todos)
    const importedHabits = sanitizeHabits(backup.habits ?? [])
    const importedCountdowns = sanitizeCountdowns(backup.countdowns)
    const importedNotes = sanitizeNotes(backup.notes)
    const importedCustomSearchEngines = sanitizeCustomSearchEngines(backup.customSearchEngines ?? [])
    if (mode === 'replace') {
      customSearchEngines.value = importedCustomSearchEngines
      shortcuts.value = importedShortcuts
      folders.value = importedFolders
      launcherOrder.value = sanitizeLauncherOrder(backup.launcherOrder, importedShortcuts, importedFolders)
      todos.value = importedTodos
      habits.value = importedHabits
      countdowns.value = importedCountdowns
      notes.value = importedNotes
      activeNoteId.value = sanitizeActiveNoteId(backup.activeNoteId, importedNotes)
      weatherCity.value = sanitizeWeatherCity(backup.weatherCity)
      focusTimer.value = backup.focusTimer ? sanitizeFocusTimerState(backup.focusTimer) : structuredClone(defaultFocusTimerState)
      preferences.value = sanitizePreferences(backup.preferences)
      const allowedWorkspaceItemIds = new Set([
        ...builtInLauncherIds,
        ...importedShortcuts.map((item) => item.id),
        ...importedFolders.map((item) => item.id),
      ])
      homeWorkspaces.value = sanitizeHomeWorkspaces(
        backup.homeWorkspaces ?? [defaultHomeWorkspace(backup.launcherOrder)],
        backup.launcherOrder,
        builtInLauncherIds,
        allowedWorkspaceItemIds,
      )
      activeHomeWorkspaceId.value = sanitizeActiveHomeWorkspaceId(backup.activeHomeWorkspaceId, homeWorkspaces.value)
      if (preferences.value.engine.startsWith('custom:')
        && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
        preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
      }
      return undefined
    }
    const existingFolderIds = new Set(folders.value.map((folder) => folder.id))
    const existingShortcutIds = new Set(shortcuts.value.map((shortcut) => shortcut.id))
    const hasCrossTypeIdConflict = importedShortcuts.some((shortcut) => existingFolderIds.has(shortcut.id))
      || importedFolders.some((folder) => existingShortcutIds.has(folder.id))
    if (hasCrossTypeIdConflict) {
      return '合并失败：导入内容与现有文件夹或快捷入口使用了相同的入口 ID，未导入任何数据。请修改备份中的冲突 ID 后重试。'
    }
    const mergeLimits = [
      { label: '快捷入口', current: shortcuts.value, incoming: importedShortcuts, limit: 500 },
      { label: '文件夹', current: folders.value, incoming: importedFolders, limit: 500 },
      { label: '待办事项', current: todos.value, incoming: importedTodos, limit: 500 },
      { label: '习惯', current: habits.value, incoming: importedHabits, limit: maxHabits },
      { label: '纪念日', current: countdowns.value, incoming: importedCountdowns, limit: 500 },
      { label: '笔记', current: notes.value, incoming: importedNotes, limit: 500 },
      { label: '自定义搜索引擎', current: customSearchEngines.value, incoming: importedCustomSearchEngines, limit: 20 },
    ]
    const overLimitSections = mergeLimits.flatMap(({ label, current, incoming, limit }) => {
      const currentIds = new Set(current.map((item) => item.id))
      const newIds = new Set(incoming.map((item) => item.id).filter((id) => !currentIds.has(id)))
      return current.length + newIds.size > limit ? [label] : []
    })
    if (overLimitSections.length) {
      return `合并失败：${overLimitSections.join('、')}将超过数量上限，未导入任何数据。请先整理现有内容，或选择覆盖导入。`
    }
    const mergedShortcutItems = sanitizeShortcuts(mergeById(shortcuts.value, importedShortcuts))
    const mergedFolderItems = sanitizeFolders(mergeById(folders.value, importedFolders), mergedShortcutItems)
    const allowedWorkspaceItemIds = new Set([
      ...builtInLauncherIds,
      ...mergedShortcutItems.map((item) => item.id),
      ...mergedFolderItems.map((item) => item.id),
    ])
    const incomingWorkspaces = sanitizeHomeWorkspaces(
      backup.homeWorkspaces ?? [defaultHomeWorkspace(backup.launcherOrder)],
      backup.launcherOrder,
      builtInLauncherIds,
      allowedWorkspaceItemIds,
    )
    const mergedWorkspaceIds = new Set([
      ...homeWorkspaces.value.map((workspace) => workspace.id),
      ...incomingWorkspaces.map((workspace) => workspace.id),
    ])
    if (mergedWorkspaceIds.size > maxHomeWorkspaces) {
      return `合并失败：主页工作区将超过数量上限（最多 ${maxHomeWorkspaces} 组），未导入任何数据。`
    }
    customSearchEngines.value = sanitizeCustomSearchEngines(mergeById(customSearchEngines.value, importedCustomSearchEngines))
    shortcuts.value = mergedShortcutItems
    folders.value = mergedFolderItems
    const incomingWorkspaceById = new Map(incomingWorkspaces.map((workspace) => [workspace.id, workspace]))
    const existingWorkspaceIds = new Set(homeWorkspaces.value.map((workspace) => workspace.id))
    const mergedWorkspaces = homeWorkspaces.value.map((existing) => {
      const incoming = incomingWorkspaceById.get(existing.id)
      return incoming
        ? { ...incoming, itemIds: [...new Set([...existing.itemIds, ...incoming.itemIds])] }
        : existing
    })
    for (const incoming of incomingWorkspaces) {
      if (!existingWorkspaceIds.has(incoming.id)) mergedWorkspaces.push(incoming)
    }
    const importedActiveWorkspaceId = incomingWorkspaceById.has(backup.activeHomeWorkspaceId ?? '')
      ? backup.activeHomeWorkspaceId
      : activeHomeWorkspaceId.value
    homeWorkspaces.value = sanitizeHomeWorkspaces(mergedWorkspaces, launcherOrder.value, builtInLauncherIds, allowedWorkspaceItemIds)
    activeHomeWorkspaceId.value = sanitizeActiveHomeWorkspaceId(importedActiveWorkspaceId, homeWorkspaces.value)
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...backup.launcherOrder], shortcuts.value, folders.value)
    todos.value = sanitizeTodos(mergeById(todos.value, importedTodos))
    habits.value = sanitizeHabits(mergeById(habits.value, importedHabits))
    countdowns.value = sanitizeCountdowns(mergeById(countdowns.value, importedCountdowns))
    notes.value = sanitizeNotes(mergeById(notes.value, importedNotes))
    preferences.value = sanitizePreferences({ ...preferences.value, ...backup.preferences })
    if (preferences.value.engine.startsWith('custom:')
      && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
      preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
    }
    const preferredNoteId = backup.notes.some((note) => note.id === backup.activeNoteId) ? backup.activeNoteId : activeNoteId.value
    activeNoteId.value = sanitizeActiveNoteId(preferredNoteId, notes.value)
    weatherCity.value = sanitizeWeatherCity(backup.weatherCity || weatherCity.value)
    if (backup.focusTimer) focusTimer.value = sanitizeFocusTimerState(backup.focusTimer)
    return undefined
  }

  return {
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
