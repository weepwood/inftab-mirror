import { useStoredState } from './useStoredState'
import { defaultPreferences, defaultShortcuts } from '../data/defaults'
import type { Note, Preferences, Shortcut, TodoItem } from '../types'

export function useLocalWorkspace() {
  const preferences = useStoredState<Preferences>('inftab.preferences.v1', defaultPreferences)
  const shortcuts = useStoredState<Shortcut[]>('inftab.shortcuts.v1', defaultShortcuts)
  const todos = useStoredState<TodoItem[]>('inftab.todos.v1', [])
  const notes = useStoredState<Note[]>('inftab.notes.v1', [])
  const activeNoteId = useStoredState<string>('inftab.active-note.v1', '')

  function saveShortcut(shortcut: Shortcut) {
    const exists = shortcuts.value.some((item) => item.id === shortcut.id)
    shortcuts.value = exists
      ? shortcuts.value.map((item) => item.id === shortcut.id ? shortcut : item)
      : [...shortcuts.value, shortcut]
  }

  function removeShortcut(id: string) {
    shortcuts.value = shortcuts.value.filter((shortcut) => shortcut.id !== id)
  }

  function reorderShortcuts(sourceId: string, targetId: string) {
    const next = [...shortcuts.value]
    const sourceIndex = next.findIndex((shortcut) => shortcut.id === sourceId)
    const targetIndex = next.findIndex((shortcut) => shortcut.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = next.splice(sourceIndex, 1)
    if (!source) return
    next.splice(next.findIndex((shortcut) => shortcut.id === targetId), 0, source)
    shortcuts.value = next
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
    todos,
    notes,
    activeNoteId,
    saveShortcut,
    removeShortcut,
    reorderShortcuts,
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
