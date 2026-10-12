import type { Component } from 'vue'
import type { CountdownItem, Habit, Note, TodoItem } from '../types'
import type { FocusTimerState } from '../data/focusTimer'
import type { PanelId } from './ids'
import type { HomeWidgetId } from './ids'
import { lazyPluginComponent } from './asyncComponent'

export interface HomeWidgetContext {
  todos: TodoItem[]
  habits: Habit[]
  countdowns: CountdownItem[]
  notes: Note[]
  activeNoteId: string
  weatherCity: string
  focusTimer: FocusTimerState
}

type NoProps = Record<string, never>
type NoContext = Record<string, never>

export interface HomeWidgetContextById {
  'todo-summary': Pick<HomeWidgetContext, 'todos'>
  'habits-summary': Pick<HomeWidgetContext, 'habits'>
  'countdown-summary': Pick<HomeWidgetContext, 'countdowns'>
  'notes-summary': Pick<HomeWidgetContext, 'notes' | 'activeNoteId'>
  'calendar-summary': NoContext
  'weather-summary': Pick<HomeWidgetContext, 'weatherCity'>
  'focus-timer-summary': Pick<HomeWidgetContext, 'focusTimer'>
  'bookmarks-summary': NoContext
  'history-summary': NoContext
  'news-summary': NoContext
}

export interface HomeWidgetPropsById {
  'todo-summary': { items: TodoItem[] }
  'habits-summary': { items: Habit[] }
  'countdown-summary': { items: CountdownItem[] }
  'notes-summary': { notes: Note[]; activeId: string }
  'calendar-summary': NoProps
  'weather-summary': { city: string }
  'focus-timer-summary': { state: FocusTimerState }
  'bookmarks-summary': NoProps
  'history-summary': NoProps
  'news-summary': NoProps
}

export type HomeWidgetPlugin<Id extends HomeWidgetId = HomeWidgetId> = {
  title: string
  description: string
  panel?: PanelId
  component: Component
  props: (context: HomeWidgetContextById[Id]) => HomeWidgetPropsById[Id]
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
  'habits-summary': {
    title: '习惯打卡',
    description: '查看今天已完成的习惯',
    panel: 'habits',
    component: lazyWidget(() => import('../components/HabitsSummaryWidget.vue')),
    props: (context) => ({ items: context.habits }),
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
  'news-summary': {
    title: '热门资讯',
    description: '查看 Hacker News 热门技术资讯；启用后按需联网',
    component: lazyWidget(() => import('../components/NewsSummaryWidget.vue')),
    props: (_context) => ({}),
  },
} satisfies HomeWidgetPluginRegistry

type HomeWidgetContextAdapterRegistry = {
  [Id in HomeWidgetId]: (context: HomeWidgetContext) => HomeWidgetContextById[Id]
}

const homeWidgetContextAdapters = {
  'todo-summary': (context) => ({ todos: context.todos }),
  'habits-summary': (context) => ({ habits: context.habits }),
  'countdown-summary': (context) => ({ countdowns: context.countdowns }),
  'notes-summary': (context) => ({ notes: context.notes, activeNoteId: context.activeNoteId }),
  'calendar-summary': () => ({}),
  'weather-summary': (context) => ({ weatherCity: context.weatherCity }),
  'focus-timer-summary': (context) => ({ focusTimer: context.focusTimer }),
  'bookmarks-summary': () => ({}),
  'history-summary': () => ({}),
  'news-summary': () => ({}),
} satisfies HomeWidgetContextAdapterRegistry

export function getHomeWidgetContextForPlugin<Id extends HomeWidgetId>(id: Id, context: HomeWidgetContext): HomeWidgetContextById[Id] {
  return homeWidgetContextAdapters[id](context) as HomeWidgetContextById[Id]
}

export function getHomeWidgetProps<Id extends HomeWidgetId>(
  id: Id,
  context: HomeWidgetContext,
  plugins: HomeWidgetPluginRegistry = homeWidgetPlugins,
): HomeWidgetPropsById[Id] {
  const plugin = plugins[id] as HomeWidgetPlugin<Id>
  const pluginContext = getHomeWidgetContextForPlugin(id, context)
  return plugin.props(pluginContext)
}
