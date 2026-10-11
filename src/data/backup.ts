import type { Note, Preferences, Shortcut, TodoItem } from '../types'

export interface WorkspaceBackup {
  format: 'inftab-workspace'
  version: 1
  exportedAt: string
  preferences: Preferences
  shortcuts: Shortcut[]
  launcherOrder: string[]
  todos: TodoItem[]
  notes: Note[]
  activeNoteId: string
  weatherCity: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseWorkspaceBackup(value: unknown): WorkspaceBackup {
  if (!isRecord(value) || value.format !== 'inftab-workspace' || value.version !== 1) {
    throw new Error('这不是受支持的 Inftab 备份文件。')
  }
  const { preferences, shortcuts, launcherOrder, todos, notes } = value
  if (!isRecord(preferences) || !Array.isArray(shortcuts) || !Array.isArray(launcherOrder) || !Array.isArray(todos) || !Array.isArray(notes)) {
    throw new Error('备份文件结构不完整或已损坏。')
  }
  const validPreferences = typeof preferences.engine === 'string'
    && ['google', 'baidu', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360'].includes(preferences.engine)
    && typeof preferences.mode === 'string'
    && ['html', 'photos', 'news', 'videos', 'map'].includes(preferences.mode)
    && (preferences.visibleSearchModes === undefined || (Array.isArray(preferences.visibleSearchModes) && preferences.visibleSearchModes.every((mode) => typeof mode === 'string' && ['html', 'photos', 'news', 'videos', 'map'].includes(mode))))
    && (preferences.showSearchBar === undefined || typeof preferences.showSearchBar === 'boolean')
    && typeof preferences.wallpaper === 'string'
    && typeof preferences.customWallpaper === 'string'
    && typeof preferences.shade === 'number'
    && typeof preferences.iconSize === 'number'
    && typeof preferences.columns === 'number'
    && typeof preferences.showNames === 'boolean'
    && typeof preferences.iconRadius === 'number'
    && (preferences.rows === undefined || typeof preferences.rows === 'number')
    && (preferences.gridGapX === undefined || typeof preferences.gridGapX === 'number')
    && (preferences.gridGapY === undefined || typeof preferences.gridGapY === 'number')
    && (preferences.searchWidth === undefined || typeof preferences.searchWidth === 'number')
    && (preferences.searchHeight === undefined || typeof preferences.searchHeight === 'number')
    && (preferences.gridTopGap === undefined || typeof preferences.gridTopGap === 'number')
    && (preferences.pageTransitionMs === undefined || typeof preferences.pageTransitionMs === 'number')
    && (preferences.pageTransitionEffect === undefined || ['slide', 'particles', 'trails'].includes(String(preferences.pageTransitionEffect)))
    && (preferences.hoverGlow === undefined || typeof preferences.hoverGlow === 'number')
  if (!validPreferences
    || !shortcuts.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.url === 'string' && typeof item.color === 'string' && typeof item.mark === 'string' && (item.icon === undefined || typeof item.icon === 'string'))
    || !todos.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.done === 'boolean')
    || !notes.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.body === 'string' && typeof item.updatedAt === 'number')
    || !launcherOrder.every((item) => typeof item === 'string')) {
    throw new Error('备份中包含无法识别的数据。')
  }
  return {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    preferences: preferences as unknown as Preferences,
    shortcuts: shortcuts as Shortcut[],
    launcherOrder: launcherOrder as string[],
    todos: todos as TodoItem[],
    notes: notes as Note[],
    activeNoteId: typeof value.activeNoteId === 'string' ? value.activeNoteId : '',
    weatherCity: typeof value.weatherCity === 'string' ? value.weatherCity : '上海',
  }
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}
