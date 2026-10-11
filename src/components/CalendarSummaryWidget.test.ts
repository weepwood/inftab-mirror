// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarSummaryWidget from './CalendarSummaryWidget.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('calendar summary widget', () => {
  it('shows a Monday-first month grid and marks today accessibly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 12))
    wrapper = mount(CalendarSummaryWidget)

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toContain('2026年10月')
    expect(wrapper.findAll('.home-widget-calendar-day')).toHaveLength(42)
    expect(wrapper.get('[aria-current="date"]').attributes('datetime')).toBe('2026-10-12')
    expect(wrapper.findAll('[aria-label="2026年10月12日星期一"]')).toHaveLength(1)
  })

  it('refreshes the marked date when the tab becomes visible after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59))
    wrapper = mount(CalendarSummaryWidget)
    vi.setSystemTime(new Date(2026, 9, 13, 0, 1))

    document.dispatchEvent(new Event('visibilitychange'))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[aria-current="date"]').attributes('datetime')).toBe('2026-10-13')
  })
})
