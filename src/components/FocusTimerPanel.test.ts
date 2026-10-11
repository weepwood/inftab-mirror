// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
  it('polls only while the timer is running', async () => {
    vi.useFakeTimers()
    const setInterval = vi.spyOn(window, 'setInterval')
    const clearInterval = vi.spyOn(window, 'clearInterval')
    wrapper = mount(FocusTimerPanel)

    expect(setInterval).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="开始计时"]').trigger('click')
    expect(setInterval).toHaveBeenCalledTimes(1)

    await wrapper.get('[aria-label="暂停计时"]').trigger('click')
    expect(clearInterval).toHaveBeenCalledTimes(1)
  })

  it('stops polling when another tab pauses the timer', async () => {
    vi.useFakeTimers()
    const clearInterval = vi.spyOn(window, 'clearInterval')
    wrapper = mount(FocusTimerPanel)
    await wrapper.get('[aria-label="开始计时"]').trigger('click')

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.focus-timer.v1',
      newValue: JSON.stringify({
        phase: 'focus', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
        completedSessions: 0, remainingMs: 24 * 60_000, endsAt: null,
      }),
    }))
    await nextTick()

    expect(wrapper.find('[aria-label="开始计时"]').exists()).toBe(true)
    expect(wrapper.get('[role="timer"]').text()).toBe('24:00')
    expect(clearInterval).toHaveBeenCalledOnce()
  })

  it('recalibrates the countdown when the page becomes visible', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    wrapper = mount(FocusTimerPanel)
    await wrapper.get('[aria-label="开始计时"]').trigger('click')
    vi.setSystemTime(now + 65_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()

    expect(wrapper.get('[role="timer"]').text()).toBe('23:55')
  })

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
