// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarPanel from './CalendarPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('CalendarPanel', () => {
  it('navigates months and selects a date without changing the system date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 1, 15, 12))
    wrapper = mount(CalendarPanel)

    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2024年2月')
    expect(wrapper.findAll('.calendar-day')).toHaveLength(42)
    expect(wrapper.get('.calendar-day[aria-current="date"]').text()).toBe('15')

    await wrapper.get('[aria-label="下个月"]').trigger('click')
    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2024年3月')
    const firstOfMarch = wrapper.get('.calendar-day[aria-label^="2024年3月1日"]')
    await firstOfMarch.trigger('click')
    expect(firstOfMarch.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.calendar-selected').text()).toContain('2024年3月1日')
    expect(new Date().getDate()).toBe(15)
  })

  it('moves to an adjacent month when an outside-month day is selected and returns to today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 12))
    wrapper = mount(CalendarPanel)

    const nextMonthDay = wrapper.get('.calendar-day[aria-label^="2026年11月1日"]')
    await nextMonthDay.trigger('click')
    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2026年11月')
    expect(wrapper.get('.calendar-selected').text()).toContain('2026年11月1日')

    await wrapper.get('.calendar-today').trigger('click')
    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2026年10月')
    expect(wrapper.get('.calendar-day[aria-current="date"]').attributes('aria-pressed')).toBe('true')
  })

  it('advances the followed date at local midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 59))
    wrapper = mount(CalendarPanel)

    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2026年10月')
    expect(wrapper.get('.calendar-day[aria-current="date"]').text()).toBe('31')
    await vi.advanceTimersByTimeAsync(1_100)

    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2026年11月')
    expect(wrapper.get('.calendar-day[aria-current="date"]').text()).toBe('1')
    expect(wrapper.get('.calendar-day[aria-current="date"]').attributes('aria-pressed')).toBe('true')
  })

  it('keeps a manually browsed month when the local date changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 59))
    wrapper = mount(CalendarPanel)
    await wrapper.get('[aria-label="上个月"]').trigger('click')
    await vi.advanceTimersByTimeAsync(1_100)

    expect(wrapper.get('.calendar-month-nav h3').text()).toContain('2026年9月')
  })
})
