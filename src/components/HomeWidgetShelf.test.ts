// @vitest-environment jsdom
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { HomeWidgetContext } from '../plugins/widgetRegistry'
import { homeWidgetPlugins } from '../plugins/widgetRegistry'
import { defaultFocusTimerState } from '../data/focusTimer'
import HomeWidgetShelf from './HomeWidgetShelf.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('home widget shelf plugin activation', () => {
  it('renders a standalone widget title without a fake panel action', async () => {
    const plugins = {
      ...homeWidgetPlugins,
      'todo-summary': {
        title: '独立组件',
        description: '无需单独面板',
        component: defineComponent({ render: () => h('p', '组件内容') }),
        props: () => ({}),
      },
    }
    const context: HomeWidgetContext = { todos: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', focusTimer: defaultFocusTimerState }
    wrapper = mount(HomeWidgetShelf, {
      props: {
        widgetIds: ['todo-summary'],
        widgetSizes: { 'todo-summary': 'standard', 'countdown-summary': 'standard', 'notes-summary': 'standard', 'calendar-summary': 'standard', 'weather-summary': 'standard', 'focus-timer-summary': 'standard' },
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
