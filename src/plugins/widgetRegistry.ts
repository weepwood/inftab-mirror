import type { Component } from 'vue'
import type { CountdownItem, Note, TodoItem } from '../types'
import type { FocusTimerState } from '../data/focusTimer'
import type { PanelId } from './ids'
import type { HomeWidgetId } from './ids'
import { lazyPluginComponent } from './asyncComponent'

export interface HomeWidgetContext {
  todos: TodoItem[]
  countdowns: CountdownItem[]
  notes: Note[]
  activeNoteId: string
  weatherCity: string
  focusTimer: FocusTimerState
}

type NoProps = Record<string, never>

export interface HomeWidgetPropsById {
  'todo-summary': { items: TodoItem[] }
  'countdown-summary': { items: CountdownItem[] }
  'notes-summary': { notes: Note[]; activeId: string }
  'calendar-summary': NoProps
  'weather-summary': { city: string }
  'focus-timer-summary': { state: FocusTimerState }
  'bookmarks-summary': NoProps
  'history-summary': NoProps
}

export type HomeWidgetPlugin<Id extends HomeWidgetId = HomeWidgetId> = {
  title: string
  description: string
  panel?: PanelId
  component: Component
  props: (context: HomeWidgetContext) => HomeWidgetPropsById[Id]
}

export type HomeWidgetPluginRegistry = { [Id in HomeWidgetId]: HomeWidgetPlugin<Id> }

function lazyWidget(loader: () => Promise<{ default: Component }>) {
  return lazyPluginComponent(loader, '正在加载小组件…', '小组件加载失败，请重试。')
}

export const homeWidgetPlugins = {
  'todo-summary': {
    title: '待办概览',
    description: '显示未完成事项和最近任务',
    panel: 'todos',
    component: lazyWidget(() => import('../components/TodoSummaryWidget.vue')),
    props: (context) => ({ items: context.todos }),
  },
  'countdown-summary': {
    title: '倒计时',
    description: '显示最近的纪念日或重要日期',
    panel: 'countdowns',
    component: lazyWidget(() => import('../components/CountdownSummaryWidget.vue')),
    props: (context) => ({ items: context.countdowns }),
  },
  'notes-summary': {
    title: '便签',
    description: '在首页预览最近编辑的笔记',
    panel: 'notes',
    component: lazyWidget(() => import('../components/NotesSummaryWidget.vue')),
    props: (context) => ({ notes: context.notes, activeId: context.activeNoteId }),
  },
  'calendar-summary': {
    title: '月历',
    description: '在首页查看本月日期和今天',
    panel: 'calendar',
    component: lazyWidget(() => import('../components/CalendarSummaryWidget.vue')),
    props: (_context) => ({}),
  },
  'weather-summary': {
    title: '天气',
    description: '在首页查看当前城市天气',
    panel: 'weather',
    component: lazyWidget(() => import('../components/WeatherSummaryWidget.vue')),
    props: (context) => ({ city: context.weatherCity }),
  },
  'focus-timer-summary': {
    title: '专注计时',
    description: '在首页查看专注或休息计时状态',
    panel: 'focus-timer',
    component: lazyWidget(() => import('../components/FocusTimerSummaryWidget.vue')),
    props: (context) => ({ state: context.focusTimer }),
  },
  'bookmarks-summary': {
    title: '书签概览',
    description: '在首页快速打开浏览器书签中的前几项',
    panel: 'bookmarks',
    component: lazyWidget(() => import('../components/BookmarksSummaryWidget.vue')),
    props: (_context) => ({}),
  },
  'history-summary': {
    title: '最近访问',
    description: '在首页快速打开最近访问的网页',
    panel: 'history',
    component: lazyWidget(() => import('../components/HistorySummaryWidget.vue')),
    props: (_context) => ({}),
  },
} satisfies HomeWidgetPluginRegistry
