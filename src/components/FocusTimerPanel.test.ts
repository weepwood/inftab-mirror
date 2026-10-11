// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { defaultFocusTimerState, startFocusTimer } from '../data/focusTimer'
import FocusTimerPanel from './FocusTimerPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('FocusTimerPanel', () => {
  it('emits timer actions and only polls while a timer is running', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const setInterval = vi.spyOn(window, 'setInterval')
    const clearInterval = vi.spyOn(window, 'clearInterval')
    wrapper = mount(FocusTimerPanel, { props: { state: defaultFocusTimerState } })

    expect(setInterval).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="开始计时"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)

    await wrapper.setProps({ state: startFocusTimer(defaultFocusTimerState, Date.now()) })
    expect(setInterval).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[role="timer"]').text()).toBe('24:59')

    await wrapper.setProps({ state: { ...defaultFocusTimerState, remainingMs: 24 * 60_000 } })
    expect(clearInterval).toHaveBeenCalledOnce()
  })

  it('recalculates from the wall-clock deadline when the page becomes visible', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    wrapper = mount(FocusTimerPanel, { props: { state: startFocusTimer(defaultFocusTimerState, now) } })
    vi.setSystemTime(now + 65_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()

    expect(wrapper.get('[role="timer"]').text()).toBe('23:55')
  })
})
