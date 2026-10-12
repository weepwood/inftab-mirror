// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CountdownSummaryWidget from './CountdownSummaryWidget.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('CountdownSummaryWidget', () => {
  it('updates the local-day countdown immediately when the browser window regains focus', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 0))
    wrapper = mount(CountdownSummaryWidget, {
      props: { items: [{ id: 'launch', title: '发布日', date: '2026-10-13', recurrence: 'once' }] },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('还有 1 天')

    vi.setSystemTime(new Date(2026, 9, 13, 0, 0, 0))
    window.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('就在今天')
  })
})
