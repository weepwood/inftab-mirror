import { describe, expect, it } from 'vitest'
import { getLocalDateKey, isHabitCompleteOn, maxCompletionDatesPerHabit, maxHabits, sanitizeHabits } from './habits'

describe('habit data', () => {
  it('uses the local calendar date for daily check-ins', () => {
    expect(getLocalDateKey(new Date(2026, 9, 12))).toBe('2026-10-12')
    expect(isHabitCompleteOn({ id: 'walk', title: '散步', completedDates: ['2026-10-12'] }, '2026-10-12')).toBe(true)
  })

  it('trims titles, deduplicates check-in dates, and rejects malformed records', () => {
    expect(sanitizeHabits([
      { id: 'read', title: ' 阅读 ', completedDates: ['2026-10-12', '2026-10-12'] },
      { id: 'bad', title: '无效日期', completedDates: ['2026-02-30'] },
      { id: 'empty', title: '   ', completedDates: [] },
      { id: 'read', title: '重复 ID', completedDates: [] },
    ])).toEqual([{ id: 'read', title: '阅读', completedDates: ['2026-10-12'] }])
  })

  it('bounds the number and length of habits and completion history', () => {
    const values = Array.from({ length: maxHabits + 5 }, (_, index) => ({
      id: `habit-${index}`,
      title: 'x'.repeat(100),
      completedDates: [],
    }))
    const sanitized = sanitizeHabits(values)
    expect(sanitized).toHaveLength(maxHabits)
    expect(sanitized[0]?.title).toHaveLength(80)
    expect(sanitizeHabits([{ id: 'too-many-dates', title: 'Too many', completedDates: Array(maxCompletionDatesPerHabit + 1).fill('2026-10-12') }])).toEqual([])
  })
})
