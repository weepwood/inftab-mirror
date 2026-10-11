export type SearchMode = 'html' | 'photos' | 'news' | 'videos' | 'map'
export type EngineId = 'google' | 'baidu' | 'bing' | 'duckduckgo' | 'sogou' | 'yahoo' | '360'

export interface Shortcut {
  id: string
  title: string
  url: string
  color: string
  mark: string
  icon?: string
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
}

export interface Note {
  id: string
  title: string
  body: string
  updatedAt: number
}

export interface Preferences {
  engine: EngineId
  mode: SearchMode
  wallpaper: string
  customWallpaper: string
  shade: number
  iconSize: number
  columns: number
  showNames: boolean
  iconRadius: number
}

export type LauncherAction = 'weather' | 'todos' | 'notes' | 'settings' | 'wallpaper'

export interface LauncherItem {
  id: string
  title: string
  action?: LauncherAction
  shortcut?: Shortcut
  color: string
  mark: string
  icon?: string
  badge?: number
}
