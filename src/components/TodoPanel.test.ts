// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { TodoItem } from '../types'
import TodoPanel from './TodoPanel.vue'

let wrapper: VueWrapper | undefined
const openItem: TodoItem = { id: 'read', title: '阅读', done: false }
const doneItem: TodoItem = { id: 'walk', title: '散步', done: true }

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('TodoPanel', () => {
  it('shows the empty state and ignores whitespace-only tasks', async () => {
    wrapper = mount(TodoPanel, { props: { items: [] } })
    expect(wrapper.get('.empty-state').text()).toContain('还没有待办事项')
    await wrapper.get('[aria-label="添加一项待办"]').setValue('   ')
    await wrapper.get('.inline-add').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('adds a trimmed task and clears the draft', async () => {
    wrapper = mount(TodoPanel, { props: { items: [] } })
    const input = wrapper.get<HTMLInputElement>('[aria-label="添加一项待办"]')
    await input.setValue('  阅读  ')
    await wrapper.get('.inline-add').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['阅读']])
    expect(input.element.value).toBe('')
    expect(input.attributes('maxlength')).toBe('500')
  })

  it('edits an existing task without mutating its props', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem] } })
    await wrapper.get('button[aria-label="编辑待办"]').trigger('click')
    const input = wrapper.get<HTMLInputElement>('input[aria-label="编辑待办"]')
    expect(input.element.value).toBe('阅读')
    await input.setValue('  阅读一章  ')
    await wrapper.get('.todo-edit-form').trigger('submit')
    expect(wrapper.emitted('update')).toEqual([['read', '阅读一章']])
    expect(wrapper.find('.todo-edit-form').exists()).toBe(false)
    expect(openItem.title).toBe('阅读')
  })

  it('discards blank edits and cancels on Escape without submitting', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem] } })
    await wrapper.get('button[aria-label="编辑待办"]').trigger('click')
    await wrapper.get('input[aria-label="编辑待办"]').setValue('   ')
    await wrapper.get('.todo-edit-form').trigger('submit')
    expect(wrapper.emitted('update')).toBeUndefined()
    expect(wrapper.get('.todo-list').text()).toContain('阅读')

    await wrapper.get('button[aria-label="编辑待办"]').trigger('click')
    await wrapper.get('input[aria-label="编辑待办"]').setValue('不保存')
    await wrapper.get('input[aria-label="编辑待办"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.todo-edit-form').exists()).toBe(false)
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('forwards toggle and removal events with the correct task ID', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem, doneItem] } })
    const rows = wrapper.findAll('.todo-list li')
    expect(rows[1]!.classes()).toContain('done')
    expect(wrapper.get('.todo-footer').text()).toContain('1 项待完成')
    await rows[0]!.get('[aria-label="标记为完成"]').trigger('click')
    await rows[1]!.get('[aria-label="标记为未完成"]').trigger('click')
    await rows[1]!.get('[aria-label="删除待办"]').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['read'], ['walk']])
    expect(wrapper.emitted('remove')).toEqual([['walk']])
  })

  it('only offers clearing completed tasks when at least one is complete', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem] } })
    expect(wrapper.find('.todo-footer button').exists()).toBe(false)
    await wrapper.setProps({ items: [openItem, doneItem] })
    await wrapper.get('.todo-footer button').trigger('click')
    expect(wrapper.emitted('clearCompleted')).toEqual([[]])
  })

  it('disables adding at the storage limit and re-enables it after removal', async () => {
    const items = Array.from({ length: 500 }, (_, index) => ({ ...openItem, id: `task-${index}` }))
    wrapper = mount(TodoPanel, { props: { items } })
    expect(wrapper.get<HTMLInputElement>('.inline-add input').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('.inline-add button').element.disabled).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('500 项上限')
    await wrapper.setProps({ items: items.slice(1) })
    expect(wrapper.get<HTMLInputElement>('.inline-add input').element.disabled).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
