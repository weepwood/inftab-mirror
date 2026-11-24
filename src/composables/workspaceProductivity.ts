import type { Ref } from 'vue'
import type { TodoItem, Habit, CountdownItem, CountdownRecurrence, Note } from '../types'
import { createLocalId } from '../data/createId'
import { isValidCalendarDate } from '../data/countdown'
import { sanitizeCountdowns } from '../data/sanitize'
import { getLocalDateKey, maxCompletionDatesPerHabit, maxHabits, maxHabitTitleLength } from '../data/habits'
import { truncateCodePoints, truncateCodeUnits } from '../data/text'

export function createProductivityActions({ todos, habits, countdowns, notes, activeNoteId }: {
  todos: Ref<TodoItem[]>
  habits: Ref<Habit[]>
  countdowns: Ref<CountdownItem[]>
  notes: Ref<Note[]>
  activeNoteId: Ref<string>
}) {
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

  return { addTodo, toggleTodo, updateTodo, removeTodo, clearCompletedTodos, addHabit, updateHabit, toggleHabitToday, removeHabit, addCountdown, updateCountdown, removeCountdown, addNote, updateNote, removeNote }
}
