import { describe, expect, it } from 'vitest'
import { getCalendarDays, toLocalDateKey } from './calendar'

describe('calendar grid', () => {
  it('creates a Monday-first six-week grid with local date keys', () => {
    const days = getCalendarDays(2026, 9)

    expect(days).toHaveLength(42)
    expect(days[0]?.date.getDay()).toBe(1)
    expect(days[0]?.dateKey).toBe(toLocalDateKey(days[0]!.date))
    expect(days.find((day) => day.dateKey === '2026-10-01')?.inCurrentMonth).toBe(true)
    expect(days.find((day) => day.dateKey === '2026-11-01')?.inCurrentMonth).toBe(false)
  })

  it('handles leap years and normalizes a month that rolls into the next year', () => {
    expect(getCalendarDays(2024, 1).filter((day) => day.inCurrentMonth).map((day) => day.day)).toHaveLength(29)
    expect(getCalendarDays(2025, 1).filter((day) => day.inCurrentMonth).map((day) => day.day)).toHaveLength(28)
    expect(getCalendarDays(2026, 12).find((day) => day.inCurrentMonth)?.dateKey).toBe('2027-01-01')
  })

  it('does not shift selected day keys through UTC conversion', () => {
    expect(toLocalDateKey(new Date(2024, 1, 29, 23, 45))).toBe('2024-02-29')
  })
})
