// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultFocusTimerState, startFocusTimer } from '../data/focusTimer'
import FocusTimerSummaryWidget from './FocusTimerSummaryWidget.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('FocusTimerSummaryWidget', () => {
  it('shows a live countdown while running and the configured time while paused', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    wrapper = mount(FocusTimerSummaryWidget, { props: { state: startFocusTimer(defaultFocusTimerState, now) } })
    expect(wrapper.get('[role="timer"]').text()).toBe('25:00')

    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.get('[role="timer"]').text()).toBe('24:58')

    await wrapper.setProps({ state: { ...defaultFocusTimerState, remainingMs: 12 * 60_000 } })
    expect(wrapper.get('[role="timer"]').text()).toBe('12:00')
  })
})
