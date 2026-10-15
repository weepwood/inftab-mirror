import type { HomeWidgetId } from '../types'

export interface HomeWidgetPreset {
  title: string
  widgetIds: readonly HomeWidgetId[]
}

export const homeWidgetPresets = [
  {
    title: '轻量速览',
    widgetIds: ['calendar-summary', 'todo-summary', 'notes-summary'],
  },
  {
    title: '日常效率',
    widgetIds: ['todo-summary', 'habits-summary', 'focus-timer-summary', 'countdown-summary', 'notes-summary'],
  },
  {
    title: '浏览发现',
    widgetIds: ['calendar-summary', 'news-summary', 'weather-summary', 'bookmarks-summary', 'history-summary', 'top-sites-summary'],
  },
] as const satisfies readonly HomeWidgetPreset[]
