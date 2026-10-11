import { useStoredState } from './useStoredState'
import { toRaw, watch } from 'vue'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts } from '../data/defaults'
import { mergeById, type WorkspaceBackup } from '../data/backup'
import { isValidCalendarDate } from '../data/countdown'
import { sanitizeActiveNoteId, sanitizeCountdowns, sanitizeCustomSearchEngines, sanitizeFolders, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from '../data/sanitize'
import { isValidCustomSearchTemplate } from '../data/search'
import type { CountdownItem, CountdownRecurrence, CustomSearchEngine, Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences, sanitizePreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts, sanitizeShortcuts)
  const folders = useStoredState<ShortcutFolder[]>('inftab.folders.v1', [], (value) => sanitizeFolders(value, shortcuts.value))
  const launcherOrder = useStoredState<string[]>('inftab.launcher-order.v1', defaultLauncherOrder, (value) => sanitizeLauncherOrder(value, shortcuts.value, folders.value))
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [], sanitizeTodos)
  const countdowns = useStoredState<CountdownItem[]>('inftab.countdowns.v1', [], sanitizeCountdowns)
  const notes = useStoredState<Note[]>('inftab.notes.v1', [], sanitizeNotes)
  const customSearchEngines = useStoredState<CustomSearchEngine[]>('inftab.custom-search-engines.v1', [], sanitizeCustomSearchEngines)
  const activeNoteId = useStoredState<string>('inftab.active-note.v1', '', (value) => sanitizeActiveNoteId(value, notes.value))
  let previousWeatherCity = '上海'
  try {
    previousWeatherCity = localStorage.getItem('inftab.weather-city') ?? previousWeatherCity
  } catch {
    // Fall back to the default city when browser storage is unavailable.
  }
  const weatherCity = useStoredState<string>('inftab.weather-city.v1', previousWeatherCity, sanitizeWeatherCity)

  if (preferences.value.engine.startsWith('custom:')
    && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
    preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
  }
  watch(customSearchEngines, () => {
    if (preferences.value.engine.startsWith('custom:')
      && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
      preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
    }
  }, { flush: 'sync' })

  const defaultShortcutById = new Map(defaultShortcuts.map((shortcut) => [shortcut.id, shortcut]))
  const outdatedDefaultIcons: Record<string, string> = {
    lunwenmao: 'ebd5cc9193de437e76de2ca1abd2121.png',
    fox: '24f02a8178e623d22dc563857bf32f8.png',
    infinitytab: 'bc545d7b32d3c84c3041ca092fb2689.png',
  }
  shortcuts.value = shortcuts.value.map((shortcut) => {
    const defaults = defaultShortcutById.get(shortcut.id)
    const outdatedIcon = outdatedDefaultIcons[shortcut.id]
    const icon = shortcut.icon === outdatedIcon ? defaults?.icon : shortcut.icon ?? defaults?.icon
    return defaults ? { ...defaults, ...shortcut, icon } : shortcut
  })

  function saveShortcut(shortcut: Shortcut) {
    const exists = shortcuts.value.some((item) => item.id === shortcut.id)
    shortcuts.value = exists
      ? shortcuts.value.map((item) => item.id === shortcut.id ? shortcut : item)
      : [...shortcuts.value, shortcut]
    if (!exists) launcherOrder.value = [...launcherOrder.value, shortcut.id]
  }

  function removeShortcut(id: string) {
    shortcuts.value = shortcuts.value.filter((shortcut) => shortcut.id !== id)
    folders.value = sanitizeFolders(folders.value.map((folder) => ({
      ...folder,
      shortcutIds: folder.shortcutIds.filter((shortcutId) => shortcutId !== id),
    })), shortcuts.value)
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
  }

  function saveFolder(folder: ShortcutFolder) {
    const exists = folders.value.some((item) => item.id === folder.id)
    const next = exists
      ? folders.value.map((item) => item.id === folder.id ? folder : item)
      : [...folders.value, folder]
    folders.value = sanitizeFolders(next, shortcuts.value)
    if (!folders.value.some((item) => item.id === folder.id)) return
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...(exists ? [] : [folder.id])], shortcuts.value, folders.value)
  }

  function removeFolder(id: string) {
    folders.value = folders.value.filter((folder) => folder.id !== id)
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
  }

  function reorderLauncherItems(sourceId: string, targetId: string, currentIds: string[]) {
    const next = [...currentIds]
    const sourceIndex = next.indexOf(sourceId)
    const targetIndex = next.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = next.splice(sourceIndex, 1)
    if (!source) return
    next.splice(next.indexOf(targetId), 0, source)
    launcherOrder.value = next
  }

  function addTodo(title: string) {
    todos.value = [{ id: crypto.randomUUID(), title, done: false }, ...todos.value]
  }

  function toggleTodo(id: string) {
    todos.value = todos.value.map((item) => item.id === id ? { ...item, done: !item.done } : item)
  }

  function updateTodo(id: string, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) return
    todos.value = todos.value.map((item) => item.id === id ? { ...item, title: nextTitle } : item)
  }

  function removeTodo(id: string) {
    todos.value = todos.value.filter((item) => item.id !== id)
  }

  function clearCompletedTodos() {
    todos.value = todos.value.filter((item) => !item.done)
  }

  function addCountdown(title: string, date: string, recurrence: CountdownRecurrence) {
    const cleanTitle = title.trim().slice(0, 80)
    if (!cleanTitle || !isValidCalendarDate(date) || (recurrence !== 'once' && recurrence !== 'yearly')) return
    const next = sanitizeCountdowns([{ id: crypto.randomUUID(), title: cleanTitle, date, recurrence }, ...countdowns.value])
    if (next.length > countdowns.value.length) countdowns.value = next
  }

  function updateCountdown(id: string, title: string, date: string, recurrence: CountdownRecurrence) {
    const cleanTitle = title.trim().slice(0, 80)
    if (!cleanTitle || !isValidCalendarDate(date) || (recurrence !== 'once' && recurrence !== 'yearly')) return
    countdowns.value = sanitizeCountdowns(countdowns.value.map((item) => item.id === id
      ? { ...item, title: cleanTitle, date, recurrence }
      : item))
  }

  function removeCountdown(id: string) {
    countdowns.value = countdowns.value.filter((item) => item.id !== id)
  }

  function addNote() {
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', updatedAt: Date.now() }
    notes.value = [note, ...notes.value]
    activeNoteId.value = note.id
  }

  function updateNote(id: string, field: 'title' | 'body', value: string) {
    notes.value = notes.value.map((note) => note.id === id ? { ...note, [field]: value, updatedAt: Date.now() } : note)
  }

  function removeNote(id: string) {
    notes.value = notes.value.filter((note) => note.id !== id)
    if (activeNoteId.value === id) activeNoteId.value = notes.value[0]?.id ?? ''
  }

  function updatePreferences(update: Partial<Preferences>) {
    preferences.value = sanitizePreferences({ ...preferences.value, ...update })
  }

  function addCustomSearchEngine(name: string, template: string) {
    const cleanName = name.trim().slice(0, 40)
    const cleanTemplate = template.trim()
    if (!cleanName || !isValidCustomSearchTemplate(cleanTemplate) || customSearchEngines.value.length >= 20) return
    const engine: CustomSearchEngine = { id: crypto.randomUUID(), name: cleanName, template: cleanTemplate }
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
    return {
      format: 'inftab-workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: structuredClone(toRaw(preferences.value)),
      shortcuts: structuredClone(toRaw(shortcuts.value)),
      folders: structuredClone(toRaw(folders.value)),
      launcherOrder: [...launcherOrder.value],
      todos: structuredClone(toRaw(todos.value)),
      countdowns: structuredClone(toRaw(countdowns.value)),
      notes: structuredClone(toRaw(notes.value)),
      customSearchEngines: structuredClone(toRaw(customSearchEngines.value)),
      activeNoteId: activeNoteId.value,
      weatherCity: weatherCity.value,
    }
  }

  function restoreBackup(backup: WorkspaceBackup, mode: 'merge' | 'replace') {
    const importedShortcuts = sanitizeShortcuts(backup.shortcuts)
    const importedFolders = sanitizeFolders(backup.folders, importedShortcuts)
    const importedTodos = sanitizeTodos(backup.todos)
    const importedCountdowns = sanitizeCountdowns(backup.countdowns)
    const importedNotes = sanitizeNotes(backup.notes)
    const importedCustomSearchEngines = sanitizeCustomSearchEngines(backup.customSearchEngines ?? [])
    if (mode === 'replace') {
      customSearchEngines.value = importedCustomSearchEngines
      preferences.value = sanitizePreferences(backup.preferences)
      if (preferences.value.engine.startsWith('custom:')
        && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
        preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
      }
      shortcuts.value = importedShortcuts
      folders.value = importedFolders
      launcherOrder.value = sanitizeLauncherOrder(backup.launcherOrder, importedShortcuts, importedFolders)
      todos.value = importedTodos
      countdowns.value = importedCountdowns
      notes.value = importedNotes
      activeNoteId.value = sanitizeActiveNoteId(backup.activeNoteId, importedNotes)
      weatherCity.value = sanitizeWeatherCity(backup.weatherCity)
      return
    }
    customSearchEngines.value = sanitizeCustomSearchEngines(mergeById(customSearchEngines.value, importedCustomSearchEngines))
    preferences.value = sanitizePreferences({ ...preferences.value, ...backup.preferences })
    if (preferences.value.engine.startsWith('custom:')
      && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
      preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
    }
    shortcuts.value = sanitizeShortcuts(mergeById(shortcuts.value, importedShortcuts))
    folders.value = sanitizeFolders(mergeById(folders.value, importedFolders), shortcuts.value)
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...backup.launcherOrder], shortcuts.value, folders.value)
    todos.value = sanitizeTodos(mergeById(todos.value, importedTodos))
    countdowns.value = sanitizeCountdowns(mergeById(countdowns.value, importedCountdowns))
    notes.value = sanitizeNotes(mergeById(notes.value, importedNotes))
    const preferredNoteId = backup.notes.some((note) => note.id === backup.activeNoteId) ? backup.activeNoteId : activeNoteId.value
    activeNoteId.value = sanitizeActiveNoteId(preferredNoteId, notes.value)
    weatherCity.value = sanitizeWeatherCity(backup.weatherCity || weatherCity.value)
  }

  return {
    preferences,
    shortcuts,
    folders,
    launcherOrder,
    todos,
    countdowns,
    notes,
    customSearchEngines,
    activeNoteId,
    weatherCity,
    saveShortcut,
    removeShortcut,
    saveFolder,
    removeFolder,
    reorderLauncherItems,
    addTodo,
    toggleTodo,
    updateTodo,
    removeTodo,
    clearCompletedTodos,
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
  }
}
