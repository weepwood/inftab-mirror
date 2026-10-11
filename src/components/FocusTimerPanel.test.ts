// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FocusTimerPanel from './FocusTimerPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  localStorage.clear()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('FocusTimerPanel', () => {
  it('keeps the countdown running across panel unmount and remount', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    wrapper = mount(FocusTimerPanel)
    await wrapper.get('[aria-label="开始计时"]').trigger('click')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.get('[role="timer"]').text()).toBe('24:00')
    wrapper.unmount()
    wrapper = undefined

    const saved = JSON.parse(localStorage.getItem('inftab.focus-timer.v1') ?? '{}') as { endsAt?: number }
    expect(saved.endsAt).toBe(now + 25 * 60_000)
    vi.setSystemTime(now + 65_000)
    wrapper = mount(FocusTimerPanel)
    await flushPromises()
    expect(wrapper.get('[role="timer"]').text()).toBe('23:55')
  })

  it('moves to a paused short break when a work session expires', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    localStorage.setItem('inftab.focus-timer.v1', JSON.stringify({
      phase: 'focus', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
      completedSessions: 0, remainingMs: 1_000, endsAt: now + 1_000,
    }))
    wrapper = mount(FocusTimerPanel)
    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    window.dispatchEvent(new Event('pagehide'))

    expect(wrapper.get('.focus-timer-phase').text()).toBe('短暂休息')
    expect(wrapper.get('[role="timer"]').text()).toBe('05:00')
    expect(JSON.parse(localStorage.getItem('inftab.focus-timer.v1') ?? '{}')).toMatchObject({
      phase: 'short-break', completedSessions: 1, endsAt: null,
    })
  })
})
