import { useStoredState } from './useStoredState'
import { toRaw } from 'vue'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts } from '../data/defaults'
import { mergeById, type WorkspaceBackup } from '../data/backup'
import { sanitizeActiveNoteId, sanitizeFolders, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from '../data/sanitize'
import type { Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences, sanitizePreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts, sanitizeShortcuts)
  const folders = useStoredState<ShortcutFolder[]>('inftab.folders.v1', [], (value) => sanitizeFolders(value, shortcuts.value))
  const launcherOrder = useStoredState<string[]>('inftab.launcher-order.v1', defaultLauncherOrder, (value) => sanitizeLauncherOrder(value, shortcuts.value, folders.value))
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [], sanitizeTodos)
  const notes = useStoredState<Note[]>('inftab.notes.v1', [], sanitizeNotes)
  const activeNoteId = useStoredState<string>('inftab.active-note.v1', '', (value) => sanitizeActiveNoteId(value, notes.value))
  let previousWeatherCity = '上海'
  try {
    previousWeatherCity = localStorage.getItem('inftab.weather-city') ?? previousWeatherCity
  } catch {
    // Fall back to the default city when browser storage is unavailable.
  }
  const weatherCity = useStoredState<string>('inftab.weather-city.v1', previousWeatherCity, sanitizeWeatherCity)

  const defaultShortcutById = new Map(defaultShortcuts.map((shortcut) => [shortcut.id, shortcut]))
  shortcuts.value = shortcuts.value.map((shortcut) => {
    const defaults = defaultShortcutById.get(shortcut.id)
    return defaults ? { ...defaults, ...shortcut, icon: shortcut.icon ?? defaults.icon } : shortcut
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
    Object.assign(preferences.value, update)
  }

  function resetPreferences() {
    Object.assign(preferences.value, defaultPreferences)
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
      notes: structuredClone(toRaw(notes.value)),
      activeNoteId: activeNoteId.value,
      weatherCity: weatherCity.value,
    }
  }

  function restoreBackup(backup: WorkspaceBackup, mode: 'merge' | 'replace') {
    const importedShortcuts = sanitizeShortcuts(backup.shortcuts)
    const importedFolders = sanitizeFolders(backup.folders, importedShortcuts)
    const importedTodos = sanitizeTodos(backup.todos)
    const importedNotes = sanitizeNotes(backup.notes)
    if (mode === 'replace') {
      preferences.value = sanitizePreferences(backup.preferences)
      shortcuts.value = importedShortcuts
      folders.value = importedFolders
      launcherOrder.value = sanitizeLauncherOrder(backup.launcherOrder, importedShortcuts, importedFolders)
      todos.value = importedTodos
      notes.value = importedNotes
      activeNoteId.value = sanitizeActiveNoteId(backup.activeNoteId, importedNotes)
      weatherCity.value = sanitizeWeatherCity(backup.weatherCity)
      return
    }
    preferences.value = sanitizePreferences({ ...preferences.value, ...backup.preferences })
    shortcuts.value = sanitizeShortcuts(mergeById(shortcuts.value, importedShortcuts))
    folders.value = sanitizeFolders(mergeById(folders.value, importedFolders), shortcuts.value)
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...backup.launcherOrder], shortcuts.value, folders.value)
    todos.value = sanitizeTodos(mergeById(todos.value, importedTodos))
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
    notes,
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
    addNote,
    updateNote,
    removeNote,
    updatePreferences,
    resetPreferences,
    createBackup,
    restoreBackup,
  }
}
