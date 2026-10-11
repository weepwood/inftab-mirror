export type FocusPhase = 'focus' | 'short-break' | 'long-break'

export interface FocusTimerState {
  phase: FocusPhase
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  completedSessions: number
  remainingMs: number
  endsAt: number | null
}

export const defaultFocusTimerState: FocusTimerState = {
  phase: 'focus',
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  completedSessions: 0,
  remainingMs: 25 * 60 * 1000,
  endsAt: null,
}

const millisecondsPerMinute = 60_000

function phaseDuration(state: FocusTimerState, phase = state.phase): number {
  if (phase === 'short-break') return state.shortBreakMinutes * millisecondsPerMinute
  if (phase === 'long-break') return state.longBreakMinutes * millisecondsPerMinute
  return state.focusMinutes * millisecondsPerMinute
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

export function sanitizeFocusTimerState(value: unknown, now = Date.now()): FocusTimerState {
  const raw = isRecord(value) ? value : {}
  const focusMinutes = boundedInteger(raw.focusMinutes, defaultFocusTimerState.focusMinutes, 1, 120)
  const shortBreakMinutes = boundedInteger(raw.shortBreakMinutes, defaultFocusTimerState.shortBreakMinutes, 1, 60)
  const longBreakMinutes = boundedInteger(raw.longBreakMinutes, defaultFocusTimerState.longBreakMinutes, 1, 60)
  const phase: FocusPhase = raw.phase === 'short-break' || raw.phase === 'long-break' ? raw.phase : 'focus'
  const partial: FocusTimerState = {
    phase,
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    completedSessions: boundedInteger(raw.completedSessions, 0, 0, 1_000_000),
    remainingMs: 0,
    endsAt: null,
  }
  const duration = phaseDuration(partial)
  partial.remainingMs = boundedInteger(raw.remainingMs, duration, 0, duration)
  if (typeof raw.endsAt === 'number' && Number.isFinite(raw.endsAt)) {
    partial.endsAt = raw.endsAt <= now ? now : Math.min(raw.endsAt, now + duration)
  }
  return partial
}

export function getFocusTimerRemainingMs(state: FocusTimerState, now: number): number {
  if (state.endsAt === null) return state.remainingMs
  return Math.min(phaseDuration(state), Math.max(0, state.endsAt - now))
}
