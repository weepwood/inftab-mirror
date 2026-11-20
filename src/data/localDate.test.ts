import { afterEach, describe, expect, it, vi } from 'vitest'
import { toLocalDateKey } from './localDate'

afterEach(() => vi.useRealTimers())

describe('local calendar date keys', () => {
  it('pads single-digit months, days, and years', () => {
    const date = new Date(0)
    date.setFullYear(99, 0, 2)
    expect(toLocalDateKey(date)).toBe('0099-01-02')
  })

  it('preserves local dates at both ends of the day', () => {
    expect(toLocalDateKey(new Date(2024, 1, 29, 0, 1))).toBe('2024-02-29')
    expect(toLocalDateKey(new Date(2024, 1, 29, 23, 59))).toBe('2024-02-29')
  })

  it('defaults to the current local day on every call', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59))
    expect(toLocalDateKey()).toBe('2026-11-20')
    vi.setSystemTime(new Date(2026, 10, 21, 0, 1))
    expect(toLocalDateKey()).toBe('2026-11-21')
  })
})
