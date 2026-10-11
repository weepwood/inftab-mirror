import { defineAsyncComponent, h, type Component } from 'vue'
import type { CountdownItem, Note, TodoItem } from '../types'
import type { PanelId } from './ids'
import type { HomeWidgetId } from './ids'

export interface HomeWidgetContext {
  todos: TodoItem[]
  countdowns: CountdownItem[]
  notes: Note[]
  activeNoteId: string
}

export interface HomeWidgetPlugin {
  title: string
  description: string
  panel: PanelId
  component: Component
  props: (context: HomeWidgetContext) => Record<string, unknown>
}

const widgetLoadingComponent: Component = {
  render: () => h('p', { class: 'panel-loading', role: 'status' }, '正在加载小组件…'),
}
const widgetErrorComponent: Component = {
  render: () => h('p', { class: 'panel-loading', role: 'alert' }, '小组件加载失败，请刷新页面后重试。'),
}

function lazyWidget(loader: () => Promise<{ default: Component }>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: widgetLoadingComponent,
    errorComponent: widgetErrorComponent,
    delay: 0,
    onError(_error, retry, fail, attempts) {
      if (attempts >= 3) fail()
      else setTimeout(retry, attempts * 250)
    },
  })
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
    props: () => ({}),
  },
} satisfies Record<HomeWidgetId, HomeWidgetPlugin>
