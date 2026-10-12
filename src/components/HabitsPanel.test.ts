// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Habit } from '../types'
import HabitsPanel from './HabitsPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('habits panel', () => {
  it('adds a trimmed habit and resets the form', async () => {
    wrapper = mount(HabitsPanel, { props: { items: [] } })
    await wrapper.get('[aria-label="添加一个习惯"]').setValue('  喝水  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('add')?.[0]).toEqual(['喝水'])
    expect((wrapper.get('[aria-label="添加一个习惯"]').element as HTMLInputElement).value).toBe('')
  })

  it('checks in today, renames a habit, and requests confirmed removal', async () => {
    const item: Habit = { id: 'walk', title: '散步', completedDates: [] }
    wrapper = mount(HabitsPanel, { props: { items: [item] } })

    await wrapper.get('[aria-label="完成散步今日打卡"]').trigger('click')
    expect(wrapper.emitted('toggleToday')?.[0]).toEqual(['walk'])
    await wrapper.get('[aria-label="编辑散步"]').trigger('click')
    await wrapper.get('[aria-label="编辑习惯名称"]').setValue('饭后散步')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('update')?.[0]).toEqual(['walk', '饭后散步'])
    await wrapper.get('[aria-label="删除散步"]').trigger('click')
    expect(wrapper.emitted('remove')?.[0]).toEqual(['walk'])
  })
})
