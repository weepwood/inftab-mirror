import { useStoredState } from './useStoredState'
import { toRaw } from 'vue'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts } from '../data/defaults'
import { mergeById, type WorkspaceBackup } from '../data/backup'
import type { Note, Preferences, Shortcut, TodoItem } from '../types'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts)
  const launcherOrder = useStoredState<string[]>('inftab.launcher-order.v1', defaultLauncherOrder)
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [])
  const notes = useStoredState<Note[]>('inftab.notes.v1', [])
  const activeNoteId = useStoredState<string>('inftab.active-note.v1', '')
  let previousWeatherCity = '上海'
  try {
    previousWeatherCity = localStorage.getItem('inftab.weather-city') ?? previousWeatherCity
  } catch {
    // Fall back to the default city when browser storage is unavailable.
  }
  const weatherCity = useStoredState<string>('inftab.weather-city.v1', previousWeatherCity)

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
    launcherOrder.value = launcherOrder.value.filter((itemId) => itemId !== id)
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
      launcherOrder: [...launcherOrder.value],
      todos: structuredClone(toRaw(todos.value)),
      notes: structuredClone(toRaw(notes.value)),
      activeNoteId: activeNoteId.value,
      weatherCity: weatherCity.value,
    }
  }

  function restoreBackup(backup: WorkspaceBackup, mode: 'merge' | 'replace') {
    if (mode === 'replace') {
      preferences.value = { ...defaultPreferences, ...backup.preferences }
      shortcuts.value = structuredClone(backup.shortcuts)
      launcherOrder.value = [...backup.launcherOrder]
      todos.value = structuredClone(backup.todos)
      notes.value = structuredClone(backup.notes)
      activeNoteId.value = backup.activeNoteId
      weatherCity.value = backup.weatherCity
      return
    }
    preferences.value = { ...preferences.value, ...backup.preferences }
    shortcuts.value = mergeById(shortcuts.value, backup.shortcuts)
    launcherOrder.value = [...new Set([...launcherOrder.value, ...backup.launcherOrder])]
    todos.value = mergeById(todos.value, backup.todos)
    notes.value = mergeById(notes.value, backup.notes)
    if (backup.notes.some((note) => note.id === backup.activeNoteId)) activeNoteId.value = backup.activeNoteId
    weatherCity.value = backup.weatherCity || weatherCity.value
  }

  return {
    preferences,
    shortcuts,
    launcherOrder,
    todos,
    notes,
    activeNoteId,
    weatherCity,
    saveShortcut,
    removeShortcut,
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
