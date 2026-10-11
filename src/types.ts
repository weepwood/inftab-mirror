import type { LauncherPanelAction } from './plugins/registry'

export type SearchMode = 'html' | 'photos' | 'news' | 'videos' | 'map'
export type EngineId = 'google' | 'baidu' | 'bing' | 'duckduckgo' | 'sogou' | 'yahoo' | '360'
export type SearchEngineSelection = EngineId | `custom:${string}`
export type PageTransitionEffect = 'slide' | 'particles' | 'trails'

export interface CustomSearchEngine {
  id: string
  name: string
  template: string
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
  engine: SearchEngineSelection
  mode: SearchMode
  visibleSearchModes: SearchMode[]
  showSearchBar: boolean
  showClock: boolean
  wallpaper: string
  customWallpaper: string
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
