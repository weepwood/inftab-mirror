// @vitest-environment jsdom
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { HomeWidgetContext, HomeWidgetPluginRegistry } from '../plugins/widgetRegistry'
import { homeWidgetPlugins } from '../plugins/widgetRegistry'
import { defaultFocusTimerState } from '../data/focusTimer'
import HomeWidgetShelf from './HomeWidgetShelf.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('home widget shelf plugin activation', () => {
  it('limits pointer dragging to an accessible handle and keeps controls outside it', () => {
    const context: HomeWidgetContext = { todos: [], habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
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
        context: (context: HomeWidgetContext) => ({ todos: context.todos }),
        title: '独立组件',
        description: '无需单独面板',
        component: defineComponent({ render: () => h('p', '组件内容') }),
        props: (context: Pick<HomeWidgetContext, 'todos'>) => ({ items: context.todos }),
      },
    } satisfies HomeWidgetPluginRegistry
    const context: HomeWidgetContext = { todos: [], habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
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
