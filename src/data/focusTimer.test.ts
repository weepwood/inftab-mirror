import { describe, expect, it } from 'vitest'
import {
  advanceFocusTimer,
  defaultFocusTimerState,
  getFocusTimerRemainingMs,
  pauseFocusTimer,
  sanitizeFocusTimerState,
  setFocusDuration,
  startFocusTimer,
} from './focusTimer'

describe('focus timer state', () => {
  it('starts and pauses using wall-clock deadlines', () => {
    const now = 1_800_000_000_000
    const started = startFocusTimer(defaultFocusTimerState, now)
    expect(started.endsAt).toBe(now + 25 * 60_000)

    const paused = pauseFocusTimer(started, now + 60_000)
    expect(paused.endsAt).toBeNull()
    expect(paused.remainingMs).toBe(24 * 60_000)
    expect(getFocusTimerRemainingMs(paused, now + 90_000)).toBe(24 * 60_000)
  })

  it('moves through a short break and schedules a long break every fourth session', () => {
    const now = 1_800_000_000_000
    const started = startFocusTimer(defaultFocusTimerState, now)
    const shortBreak = advanceFocusTimer(started, started.endsAt!)
    expect(shortBreak).toMatchObject({ phase: 'short-break', completedSessions: 1, remainingMs: 5 * 60_000, endsAt: null })

    const afterThree = { ...defaultFocusTimerState, completedSessions: 3, endsAt: now }
    expect(advanceFocusTimer(afterThree, now).phase).toBe('long-break')
  })

  it('sanitizes corrupted values and clamps an unreasonably distant deadline', () => {
    const now = 1_800_000_000_000
    const state = sanitizeFocusTimerState({
      phase: 'unknown', focusMinutes: 0, remainingMs: Number.POSITIVE_INFINITY,
      completedSessions: -1, endsAt: now + 99 * 24 * 60 * 60 * 1000,
    }, now)
    expect(state).toEqual({
      ...defaultFocusTimerState,
      focusMinutes: 1,
      remainingMs: 60_000,
      endsAt: now + 60_000,
    })
  })

  it('updates the paused focus duration without changing a break timer', () => {
    expect(setFocusDuration(defaultFocusTimerState, 50)).toMatchObject({ focusMinutes: 50, remainingMs: 50 * 60_000 })
    const breakTimer = { ...defaultFocusTimerState, phase: 'short-break' as const, remainingMs: 3 * 60_000 }
    expect(setFocusDuration(breakTimer, 50)).toMatchObject({ focusMinutes: 50, remainingMs: 3 * 60_000 })
  })
})
