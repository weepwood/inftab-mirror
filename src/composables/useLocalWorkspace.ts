import { useStoredState } from './useStoredState'
import { defaultLauncherOrder, defaultPreferences, defaultShortcuts } from '../data/defaults'
import type { Note, Preferences, Shortcut, TodoItem } from '../types'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts)
  const launcherOrder = useStoredState<string[]>('inftab.launcher-order.v1', defaultLauncherOrder)
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [])
  const notes = useStoredState<Note[]>('inftab.notes.v1', [])
  const activeNoteId = useStoredState<string>('inftab.active-note.v1', '')

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

  function removeTodo(id: string) {
    todos.value = todos.value.filter((item) => item.id !== id)
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

  return {
    preferences,
    shortcuts,
    launcherOrder,
    todos,
    notes,
    activeNoteId,
    saveShortcut,
    removeShortcut,
    reorderLauncherItems,
    addTodo,
    toggleTodo,
    removeTodo,
    addNote,
    updateNote,
    removeNote,
    updatePreferences,
    resetPreferences,
  }
}
