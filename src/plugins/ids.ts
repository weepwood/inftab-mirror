export const availablePanelIds = [
  'bookmarks',
  'history',
  'calculator',
  'calendar',
  'settings',
  'todos',
  'focus-timer',
  'notes',
  'countdowns',
  'weather',
] as const

export type PanelId = typeof availablePanelIds[number]

export const availableHomeWidgetIds = ['todo-summary', 'countdown-summary', 'notes-summary', 'calendar-summary', 'weather-summary'] as const

export type HomeWidgetId = typeof availableHomeWidgetIds[number]
