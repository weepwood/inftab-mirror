// @vitest-environment jsdom
import { defineComponent, h, markRaw } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HomeWidgetContext, HomeWidgetPluginRegistry } from '../plugins/widgetRegistry'
import { homeWidgetPlugins } from '../plugins/widgetRegistry'
import { defaultPreferences } from '../data/defaults'
import { defaultFocusTimerState } from '../data/focusTimer'
import HomeWidgetShelf from './HomeWidgetShelf.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('home widget shelf plugin activation', () => {
  it('limits pointer dragging to an accessible handle and keeps controls outside it', () => {
    const context: HomeWidgetContext = { preferences: defaultPreferences, todos: [], addTodo: vi.fn(), toggleTodo: vi.fn(), habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
    wrapper = mount(HomeWidgetShelf, {
      props: {
        widgetIds: ['todo-summary'],
        widgetSizes: { 'todo-summary': 'standard', 'habits-summary': 'standard', 'countdown-summary': 'standard', 'notes-summary': 'standard', 'calendar-summary': 'standard', 'weather-summary': 'standard', 'focus-timer-summary': 'standard', 'bookmarks-summary': 'standard', 'history-summary': 'standard', 'news-summary': 'standard', 'top-sites-summary': 'standard' },
        context,
      },
    })

    const handle = wrapper.get('.home-widget-grip')
    expect(handle.element.tagName).toBe('BUTTON')
    expect(handle.attributes('draggable')).toBe('true')
    expect(handle.attributes('aria-label')).toBe('拖动待办概览排序')
    expect(wrapper.get('.home-widget-header').attributes('draggable')).toBeUndefined()
    expect(wrapper.get('.home-widget-order').attributes('draggable')).toBeUndefined()
    expect(wrapper.get('.home-widget-remove').attributes('draggable')).toBeUndefined()
  })

  it('renders a standalone widget title without a fake panel action', async () => {
    const plugins = {
      ...homeWidgetPlugins,
      'todo-summary': {
        context: (context: HomeWidgetContext) => ({ todos: context.todos, addTodo: context.addTodo, toggleTodo: context.toggleTodo }),
        title: '独立组件',
        description: '无需单独面板',
        component: markRaw(defineComponent({ render: () => h('p', '组件内容') })),
        props: (context: Pick<HomeWidgetContext, 'todos'>) => ({ items: context.todos }),
      },
    } satisfies HomeWidgetPluginRegistry
    const context: HomeWidgetContext = { preferences: defaultPreferences, todos: [], addTodo: vi.fn(), toggleTodo: vi.fn(), habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
    wrapper = mount(HomeWidgetShelf, {
      props: {
        widgetIds: ['todo-summary'],
        widgetSizes: { 'todo-summary': 'standard', 'habits-summary': 'standard', 'countdown-summary': 'standard', 'notes-summary': 'standard', 'calendar-summary': 'standard', 'weather-summary': 'standard', 'focus-timer-summary': 'standard', 'bookmarks-summary': 'standard', 'history-summary': 'standard', 'news-summary': 'standard', 'top-sites-summary': 'standard' },
        context,
        plugins,
      },
    })

    expect(wrapper.get('.home-widget-title-static').text()).toBe('独立组件')
    expect(wrapper.get('.home-widget-card').text()).toContain('组件内容')
    await wrapper.get('.home-widget-title-static').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
  })
})


it('routes quick task actions through the selected widget registry without opening a panel', async () => {
  const add = vi.fn()
  const toggle = vi.fn()
  const context: HomeWidgetContext = { preferences: defaultPreferences, todos: [], addTodo: vi.fn(), toggleTodo: vi.fn(), habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
  const plugins: HomeWidgetPluginRegistry = {
    ...homeWidgetPlugins,
    'todo-summary': {
      ...homeWidgetPlugins['todo-summary'],
      component: markRaw(defineComponent({
        props: ['items'], emits: ['add', 'toggle'],
        setup: (_props, { emit }) => () => h('div', [
          h('button', { class: 'test-add', onClick: () => emit('add', 'Quick task') }, 'Add'),
          h('button', { class: 'test-toggle', onClick: () => emit('toggle', 'task') }, 'Toggle'),
        ]),
      })),
      listeners: () => ({ add, toggle }),
    },
  }
  wrapper = mount(HomeWidgetShelf, { props: { widgetIds: ['todo-summary'], widgetSizes: defaultPreferences.homeWidgetSizes, context, plugins } })
  await wrapper.get('.test-add').trigger('click')
  await wrapper.get('.test-toggle').trigger('click')
  expect(add).toHaveBeenCalledWith('Quick task')
  expect(toggle).toHaveBeenCalledWith('task')
  expect(context.addTodo).not.toHaveBeenCalled()
  expect(context.toggleTodo).not.toHaveBeenCalled()
  expect(wrapper.emitted('open')).toBeUndefined()
})
