import { getFocusTimerRemainingMs, type FocusTimerState } from './focusTimerState'

export { defaultFocusTimerState, getFocusTimerRemainingMs, sanitizeFocusTimerState } from './focusTimerState'
export type { FocusPhase, FocusTimerState } from './focusTimerState'

const millisecondsPerMinute = 60_000

function phaseDuration(state: FocusTimerState, phase = state.phase): number {
  if (phase === 'short-break') return state.shortBreakMinutes * millisecondsPerMinute
  if (phase === 'long-break') return state.longBreakMinutes * millisecondsPerMinute
  return state.focusMinutes * millisecondsPerMinute
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

function nextPhase(state: FocusTimerState): FocusTimerState {
  if (state.phase === 'focus') {
    const completedSessions = state.completedSessions + 1
    const phase = completedSessions % 4 === 0 ? 'long-break' : 'short-break'
    return { ...state, phase, completedSessions, remainingMs: phaseDuration(state, phase), endsAt: null }
  }
  return { ...state, phase: 'focus', remainingMs: phaseDuration(state, 'focus'), endsAt: null }
}

export function advanceFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  return state.endsAt !== null && now >= state.endsAt ? nextPhase(state) : state
}

export function startFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  const current = advanceFocusTimer(state, now)
  if (current.endsAt !== null) return current
  const ready = current.remainingMs > 0 ? current : nextPhase(current)
  return { ...ready, endsAt: now + ready.remainingMs }
}

export function pauseFocusTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (state.endsAt === null) return state
  return { ...state, remainingMs: getFocusTimerRemainingMs(state, now), endsAt: null }
}

export function resetFocusTimer(state: FocusTimerState): FocusTimerState {
  return { ...state, phase: 'focus', remainingMs: phaseDuration(state, 'focus'), endsAt: null }
}

export function setFocusDuration(state: FocusTimerState, minutes: number): FocusTimerState {
  const focusMinutes = boundedInteger(minutes, state.focusMinutes, 1, 120)
  const remainingMs = state.phase === 'focus' && state.endsAt === null
    ? focusMinutes * millisecondsPerMinute
    : state.remainingMs
  return { ...state, focusMinutes, remainingMs }
}
