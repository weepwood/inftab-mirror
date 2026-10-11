import { defaultLauncherOrder, defaultPreferences, launcherItems, wallpaperChoices } from './defaults'
import type { Note, Preferences, SearchMode, Shortcut, TodoItem } from '../types'

const engines = new Set(['google', 'baidu', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360'])
const searchModes = new Set<SearchMode>(['html', 'photos', 'news', 'videos', 'map'])
const transitionEffects = new Set(['slide', 'particles', 'trails'])
const palette = /^#[\da-f]{3,8}$/i

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback
}

export function sanitizePreferences(value: unknown): Preferences {
  const raw = record(value) ? value : {}
  const merged = { ...defaultPreferences, ...raw }
  const visibleSearchModes = Array.isArray(raw.visibleSearchModes)
    ? [...new Set(raw.visibleSearchModes.filter((item): item is SearchMode => typeof item === 'string' && searchModes.has(item as SearchMode))) ]
    : defaultPreferences.visibleSearchModes
  const wallpaper = typeof raw.wallpaper === 'string' && wallpaperChoices.some((choice) => choice.value === raw.wallpaper)
    ? raw.wallpaper
    : defaultPreferences.wallpaper
  const customWallpaperInput = boundedText(raw.customWallpaper, '', 4096)
  const customWallpaper = /^(https?:\/\/|linear-gradient\()/i.test(customWallpaperInput) ? customWallpaperInput : ''

  return {
    engine: typeof merged.engine === 'string' && engines.has(merged.engine) ? merged.engine as Preferences['engine'] : defaultPreferences.engine,
    mode: typeof merged.mode === 'string' && searchModes.has(merged.mode as SearchMode) ? merged.mode as SearchMode : defaultPreferences.mode,
    visibleSearchModes,
    showSearchBar: typeof merged.showSearchBar === 'boolean' ? merged.showSearchBar : defaultPreferences.showSearchBar,
    wallpaper,
    customWallpaper,
    shade: boundedNumber(raw.shade, defaultPreferences.shade, 0, 0.65),
    iconSize: boundedNumber(raw.iconSize, defaultPreferences.iconSize, 32, 160),
    columns: Math.round(boundedNumber(raw.columns, defaultPreferences.columns, 2, 12)),
    rows: Math.round(boundedNumber(raw.rows, defaultPreferences.rows, 1, 8)),
    gridGapX: boundedNumber(raw.gridGapX, defaultPreferences.gridGapX, 0, 80),
    gridGapY: boundedNumber(raw.gridGapY, defaultPreferences.gridGapY, 0, 100),
    searchWidth: boundedNumber(raw.searchWidth, defaultPreferences.searchWidth, 280, 1000),
    searchHeight: boundedNumber(raw.searchHeight, defaultPreferences.searchHeight, 36, 100),
    gridTopGap: boundedNumber(raw.gridTopGap, defaultPreferences.gridTopGap, 0, 180),
    pageTransitionMs: boundedNumber(raw.pageTransitionMs, defaultPreferences.pageTransitionMs, 0, 2000),
    pageTransitionEffect: typeof merged.pageTransitionEffect === 'string' && transitionEffects.has(merged.pageTransitionEffect)
      ? merged.pageTransitionEffect as Preferences['pageTransitionEffect']
      : defaultPreferences.pageTransitionEffect,
    hoverGlow: boundedNumber(raw.hoverGlow, defaultPreferences.hoverGlow, 0, 100),
    showNames: typeof merged.showNames === 'boolean' ? merged.showNames : defaultPreferences.showNames,
    iconRadius: boundedNumber(raw.iconRadius, defaultPreferences.iconRadius, 0, 100),
  }
}

function uniqueRecords<T extends { id: string }>(values: unknown, parse: (value: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(values)) return []
  const result = new Map<string, T>()
  for (const value of values.slice(0, 500)) {
    if (!record(value)) continue
    const item = parse(value)
    if (item && !result.has(item.id)) result.set(item.id, item)
  }
  return [...result.values()]
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function validWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function validIcon(value: unknown): value is string | undefined {
  if (value === undefined || value === '') return true
  return typeof value === 'string'
    && value.length <= 3_000_000
    // Icons bundled with the archived project are often stored as a bare filename
    // (for example `cee009...png`), while uploaded icons may be data URLs.
    && (/^(https?:\/\/|\/|[\w.-]+(?:\/[\w.-]+)*\/?$|data:image\/(png|jpeg|webp|gif);base64,)/i.test(value))
}

export function sanitizeShortcuts(value: unknown): Shortcut[] {
  return uniqueRecords(value, (item) => {
    if (!validId(item.id) || typeof item.title !== 'string' || typeof item.color !== 'string' || !palette.test(item.color)
      || typeof item.mark !== 'string' || !validWebUrl(item.url) || !validIcon(item.icon)) return undefined
    const title = item.title.trim().slice(0, 80)
    if (!title) return undefined
    return {
      id: item.id,
      title,
      url: item.url,
      color: item.color,
      mark: item.mark.trim().slice(0, 12),
      icon: typeof item.icon === 'string' && item.icon ? item.icon : undefined,
    }
  })
}

export function sanitizeTodos(value: unknown): TodoItem[] {
  return uniqueRecords(value, (item) => {
    if (!validId(item.id) || typeof item.title !== 'string' || typeof item.done !== 'boolean') return undefined
    const title = item.title.trim().slice(0, 500)
    return title ? { id: item.id, title, done: item.done } : undefined
  })
}

export function sanitizeNotes(value: unknown): Note[] {
  return uniqueRecords(value, (item) => {
    if (!validId(item.id) || typeof item.title !== 'string' || typeof item.body !== 'string'
      || typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return undefined
    return { id: item.id, title: item.title.slice(0, 500), body: item.body.slice(0, 500_000), updatedAt: Math.max(0, item.updatedAt) }
  })
}

export function sanitizeWeatherCity(value: unknown): string {
  const city = boundedText(value, '上海', 100)
  return city || '上海'
}

export function sanitizeActiveNoteId(value: unknown, notes: Note[]): string {
  return typeof value === 'string' && notes.some((note) => note.id === value) ? value : notes[0]?.id ?? ''
}

export function sanitizeLauncherOrder(value: unknown, shortcuts: Shortcut[]): string[] {
  const allowed = new Set([...launcherItems.map((item) => item.id), ...shortcuts.map((item) => item.id)])
  const order = Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id))) ]
    : []
  for (const id of defaultLauncherOrder) if (allowed.has(id) && !order.includes(id)) order.push(id)
  for (const item of shortcuts) if (!order.includes(item.id)) order.push(item.id)
  return order
}

export function sanitizeStoredValue<T>(value: unknown, fallback: T): T {
  if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T
  if (record(fallback) && record(value)) return { ...fallback, ...value } as T
  return value === undefined || value === null ? fallback : value as T
}
