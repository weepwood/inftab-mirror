import { describe, expect, it } from 'vitest'
import { daysUntilCountdown, formatCountdown, isValidCalendarDate } from './countdown'

describe('countdown date handling', () => {
  it('rejects impossible calendar dates and accepts leap days', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(isValidCalendarDate('2025-02-29')).toBe(false)
    expect(isValidCalendarDate('2025-13-01')).toBe(false)
    expect(isValidCalendarDate('2025-2-01')).toBe(false)
  })

  it('counts fixed dates down and keeps past dates visible as elapsed time', () => {
    const now = new Date(2026, 9, 12, 12)
    const future = { id: 'future', title: 'Trip', date: '2026-10-15', recurrence: 'once' as const }
    const past = { id: 'past', title: 'Launch', date: '2026-10-10', recurrence: 'once' as const }

    expect(daysUntilCountdown(future, now)).toBe(3)
    expect(formatCountdown(future, now)).toBe('还有 3 天')
    expect(daysUntilCountdown(past, now)).toBe(-2)
    expect(formatCountdown(past, now)).toBe('已过去 2 天')
  })

  it('rolls annual dates forward and handles leap anniversaries consistently', () => {
    const now = new Date(2025, 2, 1, 12)
    const birthday = { id: 'birthday', title: 'Birthday', date: '2000-02-29', recurrence: 'yearly' as const }
    const today = { ...birthday, date: '2020-03-01' }
    const futureYearly = { id: 'future', title: 'Future event', date: '2030-04-01', recurrence: 'yearly' as const }
    const futureOnce = { ...futureYearly, recurrence: 'once' as const }

    expect(daysUntilCountdown(birthday, now)).toBe(364)
    expect(daysUntilCountdown(today, now)).toBe(0)
    expect(formatCountdown(today, now)).toBe('今天')
    expect(daysUntilCountdown(futureYearly, now)).toBe(daysUntilCountdown(futureOnce, now))
  })
})
