import type { Note, Preferences, Shortcut, TodoItem } from '../types'
import { sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from './sanitize'

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

const maxItems = 500

function validateArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`备份中的${label}数量无效（最多 ${maxItems} 项）。`)
  }
}

export function parseWorkspaceBackup(value: unknown): WorkspaceBackup {
  if (!isRecord(value) || value.format !== 'inftab-workspace' || value.version !== 1) {
    throw new Error('这不是受支持的 Inftab 备份文件。')
  }
  if (!isRecord(value.preferences)) throw new Error('备份文件缺少有效的页面设置。')
  validateArray(value.shortcuts, '快捷入口')
  validateArray(value.launcherOrder, '入口排序')
  validateArray(value.todos, '待办事项')
  validateArray(value.notes, '笔记')
  if (!value.launcherOrder.every((id) => typeof id === 'string' && id.length <= 128)) {
    throw new Error('备份中的入口排序包含无效数据。')
  }

  const shortcuts = sanitizeShortcuts(value.shortcuts)
  const todos = sanitizeTodos(value.todos)
  const notes = sanitizeNotes(value.notes)
  if (shortcuts.length !== value.shortcuts.length || todos.length !== value.todos.length || notes.length !== value.notes.length) {
    throw new Error('备份中包含重复或无法识别的数据，请检查文件后重试。')
  }
  if (value.preferences.engine !== undefined && !['google', 'baidu', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360'].includes(String(value.preferences.engine))) {
    throw new Error('备份中的搜索引擎无法识别。')
  }
  if (value.preferences.mode !== undefined && !['html', 'photos', 'news', 'videos', 'map'].includes(String(value.preferences.mode))) {
    throw new Error('备份中的搜索类型无法识别。')
  }
  if (value.preferences.pageTransitionEffect !== undefined && !['slide', 'particles', 'trails'].includes(String(value.preferences.pageTransitionEffect))) {
    throw new Error('备份中的翻页效果无法识别。')
  }

  return {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt.slice(0, 100) : '',
    preferences: sanitizePreferences(value.preferences),
    shortcuts,
    launcherOrder: value.launcherOrder as string[],
    todos,
    notes,
    activeNoteId: typeof value.activeNoteId === 'string' ? value.activeNoteId.slice(0, 128) : '',
    weatherCity: sanitizeWeatherCity(value.weatherCity),
  }
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}
