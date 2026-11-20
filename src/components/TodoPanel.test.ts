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
  document.body.innerHTML = ''
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


describe('TodoPanel filtering and focus', () => {
  it('combines status and trimmed case-insensitive search without modifying the tasks', async () => {
    const items = [openItem, doneItem, { id: 'release', title: 'Review Release', done: false }]
    wrapper = mount(TodoPanel, { props: { items } })
    const filters = wrapper.findAll('.collection-filters button')
    expect(filters.map((button) => button.text())).toEqual(['全部3', '待完成2', '已完成1'])

    await wrapper.get('[aria-label="查找待办"]').setValue('  REVIEW  ')
    expect(wrapper.findAll('.todo-list li').map((row) => row.text())).toEqual(['Review Release'])
    await filters[2]!.trigger('click')
    expect(wrapper.find('.todo-list').exists()).toBe(false)
    expect(wrapper.get('.collection-empty').text()).toContain('没有符合条件')
    expect(wrapper.get('.todo-footer').text()).toContain('显示 0 项')
    // Clearing completed always applies to the whole list, not just matches.
    await wrapper.get('.todo-footer .text-button').trigger('click')
    expect(wrapper.emitted('clearCompleted')).toEqual([[]])

    await wrapper.get('.collection-empty button').trigger('click')
    expect(wrapper.findAll('.todo-list li')).toHaveLength(3)
    expect(filters[0]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('[aria-label="查找待办"]').element.value).toBe('')
    expect(items).toEqual([openItem, doneItem, { id: 'release', title: 'Review Release', done: false }])
  })

  it('updates filtered tasks and counts when completion changes in the parent', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem, doneItem] } })
    await wrapper.findAll('.collection-filters button')[1]!.trigger('click')
    expect(wrapper.findAll('.todo-list li')).toHaveLength(1)
    expect(wrapper.get('.todo-check').attributes('aria-pressed')).toBe('false')

    await wrapper.setProps({ items: [{ ...openItem, done: true }, doneItem] })
    expect(wrapper.find('.todo-list').exists()).toBe(false)
    expect(wrapper.get('.todo-footer').text()).toContain('0 项待完成')
    await wrapper.findAll('.collection-filters button')[2]!.trigger('click')
    expect(wrapper.findAll('.todo-list li')).toHaveLength(2)
    expect(wrapper.findAll('.todo-check').every((button) => button.attributes('aria-pressed') === 'true')).toBe(true)
  })

  it('makes a new task visible even when adding from a filtered completed list', async () => {
    wrapper = mount(TodoPanel, { attachTo: document.body, props: { items: [doneItem] } })
    await wrapper.findAll('.collection-filters button')[2]!.trigger('click')
    await wrapper.get('[aria-label="查找待办"]').setValue('散步')
    const draft = wrapper.get<HTMLInputElement>('[aria-label="添加一项待办"]')
    await draft.setValue('  新任务  ')
    await wrapper.get('.inline-add').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['新任务']])
    await wrapper.setProps({ items: [{ id: 'new', title: '新任务', done: false }, doneItem] })

    expect(wrapper.get('.todo-list').text()).toBe('新任务')
    expect(wrapper.findAll('.collection-filters button')[1]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('[aria-label="查找待办"]').element.value).toBe('')
    expect(document.activeElement).toBe(draft.element)
  })

  it('selects the edit text and returns focus to the edit trigger when cancelled', async () => {
    wrapper = mount(TodoPanel, { attachTo: document.body, props: { items: [openItem] } })
    const trigger = wrapper.get('.todo-edit-trigger')
    await trigger.trigger('click')
    const input = wrapper.get<HTMLInputElement>('[aria-label="编辑待办"]')
    expect(document.activeElement).toBe(input.element)
    expect(input.element.selectionStart).toBe(0)
    expect(input.element.selectionEnd).toBe(openItem.title.length)

    await input.setValue('不要保存')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('.todo-edit-trigger').element)
  })

  it('returns focus to add when a saved edit no longer matches the search', async () => {
    wrapper = mount(TodoPanel, {
      attachTo: document.body,
      props: {
        items: [openItem],
        onUpdate: (_id: string, title: string) => { void wrapper!.setProps({ items: [{ ...openItem, title }] }) },
      },
    })
    await wrapper.get('[aria-label="查找待办"]').setValue('阅读')
    await wrapper.get('.todo-edit-trigger').trigger('click')
    await wrapper.get('[aria-label="编辑待办"]').setValue('写作')
    await wrapper.get('.todo-edit-form').trigger('submit')

    expect(wrapper.emitted('update')).toEqual([['read', '写作']])
    expect(wrapper.find('.todo-list').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[aria-label="添加一项待办"]').element)
  })

  it('moves focus to the next visible task or add field when a toggle leaves the active filter', async () => {
    let items: TodoItem[] = [openItem, { id: 'write', title: '写作', done: false }]
    wrapper = mount(TodoPanel, {
      attachTo: document.body,
      props: {
        items,
        onToggle: (id: string) => {
          items = items.map((item) => item.id === id ? { ...item, done: !item.done } : item)
          void wrapper!.setProps({ items })
        },
      },
    })
    await wrapper.findAll('.collection-filters button')[1]!.trigger('click')
    const first = wrapper.findAll<HTMLButtonElement>('.todo-check')[0]!
    first.element.focus()
    await first.trigger('click')
    expect(wrapper.findAll('.todo-list li')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('.todo-check').element)
    await wrapper.get('.todo-check').trigger('click')
    expect(wrapper.find('.todo-list').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[aria-label="添加一项待办"]').element)
  })

  it('clears a search on the first Escape and lets an empty-search Escape reach the panel', async () => {
    wrapper = mount(TodoPanel, { props: { items: [openItem] } })
    let bubbled = 0
    wrapper.element.addEventListener('keydown', () => { bubbled += 1 })
    const search = wrapper.get('[aria-label="查找待办"]')
    await search.setValue('没有结果')
    await search.trigger('keydown', { key: 'Escape' })
    expect(wrapper.findAll('.todo-list li')).toHaveLength(1)
    expect(bubbled).toBe(0)
    await search.trigger('keydown', { key: 'Escape' })
    expect(bubbled).toBe(1)
  })
})
