import { isRecord, isValidRecordId } from './validation'
import { isValidCalendarDate } from './countdown'
import { truncateCodePoints } from './text'
import type { Habit } from '../types'

export { toLocalDateKey as getLocalDateKey } from './localDate'

export const maxHabits = 100
export const maxHabitTitleLength = 80
export const maxCompletionDatesPerHabit = 3_650

export function sanitizeHabits(value: unknown): Habit[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const result: Habit[] = []
  for (const candidate of value.slice(0, maxHabits)) {
    if (!isRecord(candidate)) continue
    const item = candidate
    if (!isValidRecordId(item.id) || ids.has(item.id)
      || typeof item.title !== 'string' || !Array.isArray(item.completedDates)
      || item.completedDates.length > maxCompletionDatesPerHabit) continue
    const title = truncateCodePoints(item.title.trim(), maxHabitTitleLength)
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
