import type { LauncherPanelAction } from './plugins/registry'
import type { HomeWidgetId } from './plugins/ids'

export { availableHomeWidgetIds } from './plugins/ids'
export type { HomeWidgetId } from './plugins/ids'

export type SearchMode = 'html' | 'photos' | 'news' | 'videos' | 'map'
export type EngineId = 'google' | 'baidu' | 'bing' | 'duckduckgo' | 'sogou' | 'yahoo' | '360'
export type SearchEngineSelection = EngineId | `custom:${string}`
export type PageTransitionEffect = 'slide' | 'particles' | 'trails'
export type WallpaperRotation = 'off' | 'hourly' | 'daily'
export type ThemeMode = 'light' | 'dark' | 'system'
export type HomeWidgetSize = 'standard' | 'wide'
export const maxDockItems = 24

export interface CustomSearchEngine {
  id: string
  name: string
  template: string
}

export interface BrowserBookmarkNode {
  id: string
  title: string
  url?: string
  children?: BrowserBookmarkNode[]
}

export interface BookmarkShortcutCandidate {
  title: string
  url: string
}

export interface BookmarkShortcutImportResult {
  added: number
  error?: string
}

export interface Shortcut {
  id: string
  title: string
  url: string
  color: string
  mark: string
  icon?: string
}

export interface ShortcutFolder {
  id: string
  title: string
  shortcutIds: string[]
  color: string
  mark: string
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
}

export interface Habit {
  id: string
  title: string
  completedDates: string[]
}

export type CountdownRecurrence = 'once' | 'yearly'

export interface CountdownItem {
  id: string
  title: string
  date: string
  recurrence: CountdownRecurrence
}

export interface Note {
  id: string
  title: string
  body: string
  updatedAt: number
}

export interface Preferences {
  themeMode: ThemeMode
  hiddenLauncherIds: string[]
  dockItemIds: string[]
  homeWidgetIds: HomeWidgetId[]
  homeWidgetSizes: Record<HomeWidgetId, HomeWidgetSize>
  engine: SearchEngineSelection
  mode: SearchMode
  visibleSearchModes: SearchMode[]
  showSearchBar: boolean
  showClock: boolean
  wallpaper: string
  customWallpaper: string
  wallpaperRotation: WallpaperRotation
  wallpaperRotationLastAt: number
  shade: number
  iconSize: number
  columns: number
  rows: number
  gridGapX: number
  gridGapY: number
  searchWidth: number
  searchHeight: number
  gridTopGap: number
  pageTransitionMs: number
  pageTransitionEffect: PageTransitionEffect
  hoverGlow: number
  showNames: boolean
  iconRadius: number
}

export type LauncherAction = LauncherPanelAction

export interface LauncherItem {
  id: string
  title: string
  action?: LauncherAction
  shortcut?: Shortcut
  folder?: ShortcutFolder
  color: string
  mark: string
  icon?: string
  badge?: number
}
