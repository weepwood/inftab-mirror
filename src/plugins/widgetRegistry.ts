import { defineAsyncComponent, h, type Component } from 'vue'
import type { CountdownItem, HomeWidgetId, TodoItem } from '../types'
import type { PanelId } from './registry'

export interface HomeWidgetContext {
  todos: TodoItem[]
  countdowns: CountdownItem[]
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
} satisfies Record<HomeWidgetId, HomeWidgetPlugin>
