import type { PanelId } from './ids'

export const launcherPanelRoutes = {
  weather: 'weather',
  todos: 'todos',
  habits: 'habits',
  'focus-timer': 'focus-timer',
  notes: 'notes',
  countdowns: 'countdowns',
  settings: 'settings',
  wallpaper: 'settings',
  bookmarks: 'bookmarks',
  history: 'history',
  calculator: 'calculator',
  calendar: 'calendar',
} as const satisfies Record<string, PanelId>

export type LauncherPanelAction = keyof typeof launcherPanelRoutes

export const shortcutPanelRoutes: Readonly<Record<string, PanelId>> = {
  wallpapers: 'settings',
}
