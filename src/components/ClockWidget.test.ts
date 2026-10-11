// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ClockWidget from './ClockWidget.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('ClockWidget', () => {
  it('refreshes its local time and date while mounted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 8, 5, 0))
    wrapper = mount(ClockWidget, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('time').text()).toContain('08:05')
    expect(wrapper.get('.clock-date').text()).not.toBe('')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.get('time').text()).toContain('08:06')
  })
})
