// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TodoSummaryWidget from './TodoSummaryWidget.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('TodoSummaryWidget', () => {
  it('counts all unfinished tasks but previews only the first two in order', () => {
    wrapper = mount(TodoSummaryWidget, {
      props: { items: [
        { id: 'done', title: '已完成', done: true },
        { id: 'first', title: '阅读', done: false },
        { id: 'second', title: '散步', done: false },
        { id: 'third', title: '整理', done: false },
      ] },
    })
    expect(wrapper.get('.home-widget-metric').text()).toBe('还有 3 项待完成')
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['阅读', '散步'])
  })

  it('shows an empty state both with no tasks and with all tasks complete', async () => {
    wrapper = mount(TodoSummaryWidget, { props: { items: [] } })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天没有待办')
    expect(wrapper.find('ul').exists()).toBe(false)
    await wrapper.setProps({ items: [{ id: 'done', title: '已完成', done: true }] })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天没有待办')
    expect(wrapper.get('.home-widget-empty').text()).toContain('添加一项任务')
  })

  it('updates the summary when task state changes', async () => {
    wrapper = mount(TodoSummaryWidget, { props: { items: [{ id: 'task', title: '阅读', done: false }] } })
    await wrapper.setProps({ items: [{ id: 'task', title: '阅读', done: true }] })
    expect(wrapper.find('li').exists()).toBe(false)
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天没有待办')
  })
})
