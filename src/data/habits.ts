import { isValidCalendarDate } from './countdown'
import type { Habit } from '../types'

export const maxHabits = 100
export const maxHabitTitleLength = 80
export const maxCompletionDatesPerHabit = 3_650

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function sanitizeHabits(value: unknown): Habit[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const result: Habit[] = []
  for (const candidate of value.slice(0, maxHabits)) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue
    const item = candidate as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id)
      || typeof item.title !== 'string' || !Array.isArray(item.completedDates)
      || item.completedDates.length > maxCompletionDatesPerHabit) continue
    const title = item.title.trim().slice(0, maxHabitTitleLength)
    if (!title || !item.completedDates.every((date) => typeof date === 'string' && isValidCalendarDate(date))) continue
    ids.add(item.id)
    result.push({
      id: item.id,
      title,
      completedDates: [...new Set(item.completedDates as string[])],
    })
  }
  return result
}

export function isHabitCompleteOn(habit: Habit, date: string): boolean {
  return habit.completedDates.includes(date)
}
