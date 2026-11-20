// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HabitsSummaryWidget from './HabitsSummaryWidget.vue'

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 20, 12))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('HabitsSummaryWidget', () => {
  it('counts today’s check-ins and previews at most three incomplete habits', () => {
    wrapper = mount(HabitsSummaryWidget, {
      props: { items: [
        { id: 'done', title: '已完成', completedDates: ['2026-11-20'] },
        { id: 'first', title: '阅读', completedDates: ['2026-11-19'] },
        { id: 'second', title: '散步', completedDates: [] },
        { id: 'third', title: '喝水', completedDates: [] },
        { id: 'fourth', title: '整理', completedDates: [] },
      ] },
    })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 1 / 5 个习惯')
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['阅读', '散步', '喝水'])
  })

  it('distinguishes the empty state from completing all habits', async () => {
    wrapper = mount(HabitsSummaryWidget, { props: { items: [] } })
    expect(wrapper.get('.home-widget-empty').text()).toContain('小目标')
    await wrapper.setProps({ items: [{ id: 'walk', title: '散步', completedDates: ['2026-11-20'] }] })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 1 / 1 个习惯')
    expect(wrapper.get('.home-widget-empty').text()).toBe('今天的习惯全部完成。')
  })

  it('refreshes the local day across midnight without remounting', async () => {
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 30))
    wrapper = mount(HabitsSummaryWidget, { props: { items: [{ id: 'walk', title: '散步', completedDates: ['2026-11-20'] }] } })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 1 / 1 个习惯')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 0 / 1 个习惯')
    expect(wrapper.get('li').text()).toBe('散步')
  })

  it('recalibrates on window focus and when a background tab becomes visible', async () => {
    wrapper = mount(HabitsSummaryWidget, { props: { items: [{ id: 'walk', title: '散步', completedDates: ['2026-11-20'] }] } })
    vi.setSystemTime(new Date(2026, 10, 21, 12))
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 0 / 1 个习惯')

    vi.setSystemTime(new Date(2026, 10, 20, 12))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 0 / 1 个习惯')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天完成 1 / 1 个习惯')
  })

  it('cleans up its timer and browser listeners on unmount', () => {
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    wrapper = mount(HabitsSummaryWidget, { props: { items: [] } })
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
