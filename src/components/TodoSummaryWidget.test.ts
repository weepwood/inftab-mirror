// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TodoSummaryWidget from './TodoSummaryWidget.vue'
import type { TodoItem } from '../types'

let wrapper: VueWrapper<InstanceType<typeof TodoSummaryWidget>> | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function interactive(items: TodoItem[]) {
  wrapper = mount(TodoSummaryWidget, {
    attachTo: document.body,
    props: { items, onToggle: (id: string) => {
      void wrapper!.setProps({ items: wrapper!.props('items').map((item) => item.id === id ? { ...item, done: !item.done } : item) })
    } },
  })
  return wrapper
}

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

  it('distinguishes an empty day from all tasks complete', async () => {
    wrapper = mount(TodoSummaryWidget, { props: { items: [] } })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天没有待办')
    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.get('.home-widget-empty').text()).toContain('添加一项任务')
    await wrapper.setProps({ items: [{ id: 'done', title: '已完成', done: true }] })
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天的待办都完成了')
  })

  it('updates the summary when task state changes', async () => {
    wrapper = mount(TodoSummaryWidget, { props: { items: [{ id: 'task', title: '阅读', done: false }] } })
    await wrapper.setProps({ items: [{ id: 'task', title: '阅读', done: true }] })
    expect(wrapper.find('li').exists()).toBe(false)
    expect(wrapper.get('.home-widget-metric').text()).toBe('今天的待办都完成了')
  })

  it('adds a trimmed task and keeps focus ready for another quick entry', async () => {
    wrapper = mount(TodoSummaryWidget, { attachTo: document.body, props: { items: [] } })
    const input = wrapper.get('input[aria-label="快速添加待办"]')
    expect(input.attributes('maxlength')).toBe('500')
    await input.setValue('  安排明天  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['安排明天']])
    expect(input.element).toHaveProperty('value', '')
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.get('[role="status"]').text()).toContain('已添加待办')
  })

  it('keeps blank drafts local and enforces the existing 500-task limit', async () => {
    wrapper = mount(TodoSummaryWidget, { props: { items: [] } })
    await wrapper.get('form input').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
    await wrapper.setProps({ items: Array.from({ length: 500 }, (_, index) => ({ id: String(index), title: 'Task', done: false })) })
    expect(wrapper.get('form input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form button').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('completes tasks directly, hands focus to the next task, and can undo the last completion', async () => {
    const view = interactive([{ id: 'one', title: '阅读', done: false }, { id: 'two', title: '散步', done: false }])
    const first = view.get<HTMLInputElement>('[data-todo-id="one"]')
    first.element.focus()
    await first.setValue(true)
    await flushPromises()
    expect(view.emitted('toggle')).toEqual([['one']])
    expect(document.activeElement).toBe(view.get('[data-todo-id="two"]').element)
    await view.get<HTMLInputElement>('[data-todo-id="two"]').setValue(true)
    await flushPromises()
    expect(view.get('.home-widget-metric').text()).toBe('今天的待办都完成了')
    expect(document.activeElement).toBe(view.get('.widget-todo-undo button').element)
    await view.get('.widget-todo-undo button').trigger('click')
    await flushPromises()
    expect(view.emitted('toggle')).toEqual([['one'], ['two'], ['two']])
    expect(view.find('.widget-todo-undo').exists()).toBe(false)
    expect(document.activeElement).toBe(view.get('[data-todo-id="two"]').element)
  })

  it.each(['removed', 'reopened'])('does not undo a task that another tab has already %s', async (change) => {
    const view = interactive([{ id: 'one', title: '阅读', done: false }])
    await view.get<HTMLInputElement>('[data-todo-id="one"]').setValue(true)
    await flushPromises()
    expect(view.find('.widget-todo-undo').exists()).toBe(true)
    await view.setProps({ items: change === 'removed' ? [] : [{ id: 'one', title: '阅读', done: false }] })
    expect(view.find('.widget-todo-undo').exists()).toBe(false)
    await view.setProps({ items: [{ id: 'one', title: '阅读', done: true }] })
    expect(view.find('.widget-todo-undo').exists()).toBe(false)
    expect(view.emitted('toggle')).toEqual([['one']])
  })

  it('does not add a task when Enter confirms an IME candidate', async () => {
    vi.useFakeTimers()
    wrapper = mount(TodoSummaryWidget, { props: { items: [] } })
    const input = wrapper.get('form input')
    await input.setValue('安排明天')
    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await input.trigger('compositionend')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
    expect(input.element).toHaveProperty('value', '安排明天')
    await vi.advanceTimersByTimeAsync(1)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['安排明天']])
  })
})
