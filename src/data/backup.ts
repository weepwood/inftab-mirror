import type { Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'
import { sanitizeActiveNoteId, sanitizeFolders, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from './sanitize'

export interface WorkspaceBackup {
  format: 'inftab-workspace'
  version: 1
  exportedAt: string
  preferences: Preferences
  shortcuts: Shortcut[]
  folders: ShortcutFolder[]
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
  const rawFolders = value.folders ?? []
  validateArray(rawFolders, '文件夹')
  validateArray(value.launcherOrder, '入口排序')
  validateArray(value.todos, '待办事项')
  validateArray(value.notes, '笔记')
  const rawPreferences = value.preferences
  const requiredPreferenceTypes: Record<string, (item: unknown) => boolean> = {
    engine: (item) => typeof item === 'string',
    mode: (item) => typeof item === 'string',
    wallpaper: (item) => typeof item === 'string',
    customWallpaper: (item) => typeof item === 'string',
    shade: (item) => typeof item === 'number' && Number.isFinite(item),
    iconSize: (item) => typeof item === 'number' && Number.isFinite(item),
    columns: (item) => typeof item === 'number' && Number.isFinite(item),
    showNames: (item) => typeof item === 'boolean',
    iconRadius: (item) => typeof item === 'number' && Number.isFinite(item),
  }
  if (Object.entries(requiredPreferenceTypes).some(([key, valid]) => !valid(rawPreferences[key]))) {
    throw new Error('备份文件结构不完整或已损坏。')
  }
  const optionalPreferenceTypes: Record<string, (item: unknown) => boolean> = {
    visibleSearchModes: (item) => Array.isArray(item) && item.every((mode) => ['html', 'photos', 'news', 'videos', 'map'].includes(String(mode))),
    showSearchBar: (item) => typeof item === 'boolean',
    rows: (item) => typeof item === 'number' && Number.isFinite(item),
    gridGapX: (item) => typeof item === 'number' && Number.isFinite(item),
    gridGapY: (item) => typeof item === 'number' && Number.isFinite(item),
    searchWidth: (item) => typeof item === 'number' && Number.isFinite(item),
    searchHeight: (item) => typeof item === 'number' && Number.isFinite(item),
    gridTopGap: (item) => typeof item === 'number' && Number.isFinite(item),
    pageTransitionMs: (item) => typeof item === 'number' && Number.isFinite(item),
    pageTransitionEffect: (item) => ['slide', 'particles', 'trails'].includes(String(item)),
    hoverGlow: (item) => typeof item === 'number' && Number.isFinite(item),
  }
  if (Object.entries(optionalPreferenceTypes).some(([key, valid]) => rawPreferences[key] !== undefined && !valid(rawPreferences[key]))) {
    throw new Error('备份文件中的页面设置无法识别。')
  }
  if (!value.launcherOrder.every((id) => typeof id === 'string' && id.length <= 128)) {
    throw new Error('备份中的入口排序包含无效数据。')
  }

  const shortcuts = sanitizeShortcuts(value.shortcuts)
  const folders = sanitizeFolders(rawFolders, shortcuts)
  const todos = sanitizeTodos(value.todos)
  const notes = sanitizeNotes(value.notes)
  if (shortcuts.length !== value.shortcuts.length || folders.length !== rawFolders.length || todos.length !== value.todos.length || notes.length !== value.notes.length) {
    throw new Error('备份中包含重复或无法识别的数据，请检查文件后重试。')
  }
  if (!['google', 'baidu', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360'].includes(String(value.preferences.engine))) {
    throw new Error('备份中的搜索引擎无法识别。')
  }
  if (!['html', 'photos', 'news', 'videos', 'map'].includes(String(value.preferences.mode))) {
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
    folders,
    launcherOrder: sanitizeLauncherOrder(value.launcherOrder, shortcuts, folders),
    todos,
    notes,
    activeNoteId: sanitizeActiveNoteId(typeof value.activeNoteId === 'string' ? value.activeNoteId.slice(0, 128) : '', notes),
    weatherCity: sanitizeWeatherCity(value.weatherCity),
  }
}

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
}
