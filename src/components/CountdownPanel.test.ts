// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CountdownPanel from './CountdownPanel.vue'
import type { CountdownItem } from '../types'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('countdown panel', () => {
  it('refreshes the countdown date when the page becomes visible after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59))
    wrapper = mount(CountdownPanel, {
      props: { items: [{ id: 'tomorrow', title: '明日', date: '2026-10-13', recurrence: 'once' }] },
    })
    expect(wrapper.get('.countdown-remaining').text()).toBe('还有 1 天')

    vi.setSystemTime(new Date(2026, 9, 13, 0, 1))
    document.dispatchEvent(new Event('visibilitychange'))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.countdown-remaining').text()).toBe('今天')
  })

  it('adds a trimmed countdown and resets the form', async () => {
    wrapper = mount(CountdownPanel, { props: { items: [] } })
    await wrapper.get('[aria-label="纪念日名称"]').setValue('  旅行  ')
    await wrapper.get('[aria-label="纪念日日期"]').setValue('2030-02-04')
    await wrapper.get('[aria-label="重复频率"]').setValue('yearly')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('add')?.[0]).toEqual(['旅行', '2030-02-04', 'yearly'])
    expect((wrapper.get('[aria-label="纪念日名称"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[aria-label="纪念日日期"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[aria-label="重复频率"]').element as HTMLSelectElement).value).toBe('once')
  })

  it('edits an existing countdown without adding another item', async () => {
    const item: CountdownItem = { id: 'birthday', title: '生日', date: '2030-02-04', recurrence: 'once' }
    wrapper = mount(CountdownPanel, { props: { items: [item] } })
    await wrapper.get('[aria-label="编辑生日"]').trigger('click')
    await wrapper.get('[aria-label="纪念日名称"]').setValue('家人生日')
    await wrapper.get('[aria-label="纪念日日期"]').setValue('2031-06-10')
    await wrapper.get('[aria-label="重复频率"]').setValue('yearly')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('update')?.[0]).toEqual(['birthday', '家人生日', '2031-06-10', 'yearly'])
    expect(wrapper.emitted('add')).toBeUndefined()
    expect((wrapper.get('[aria-label="纪念日名称"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('button[aria-label="编辑生日"]')).toHaveLength(1)
  })

  it('explains the item limit while still allowing existing entries to be edited', async () => {
    const items = Array.from({ length: 500 }, (_, index): CountdownItem => ({
      id: `countdown-${index}`,
      title: index === 0 ? '重要日期' : `日期 ${index}`,
      date: '2030-02-04',
      recurrence: 'once',
    }))
    wrapper = mount(CountdownPanel, { props: { items } })

    expect(wrapper.get('[role="status"]').text()).toContain('已达到 500 条纪念日上限')
    expect((wrapper.get('[aria-label="纪念日名称"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.get('[aria-label="编辑重要日期"]').trigger('click')
    expect((wrapper.get('[aria-label="纪念日名称"]').element as HTMLInputElement).disabled).toBe(false)
    expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.get('[aria-label="纪念日名称"]').setValue('重要日期已更新')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('update')?.[0]?.[0]).toBe('countdown-0')
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
  })
})
