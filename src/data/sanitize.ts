import { defaultLauncherOrder, defaultPreferences, launcherItems, wallpaperChoices } from './defaults'
import { maxWallpaperDataUrlLength } from './imageLimits'
import { isValidCalendarDate } from './countdown'
import { isValidCustomSearchTemplate } from './search'
import { normalizeWebUrl } from './urls'
import { availableHomeWidgetIds, maxDockItems, type CountdownItem, type CustomSearchEngine, type HomeWidgetId, type Note, type Preferences, type SearchMode, type Shortcut, type ShortcutFolder, type TodoItem } from '../types'

const engines = new Set(['google', 'baidu', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360'])
const searchModes = new Set<SearchMode>(['html', 'photos', 'news', 'videos', 'map'])
const transitionEffects = new Set(['slide', 'particles', 'trails'])
const customEngineId = /^[\w-]{1,128}$/
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
  const manageableLauncherIds = new Set(launcherItems.filter((item) => item.action && item.id !== 'settings').map((item) => item.id))
  const hiddenLauncherIds = Array.isArray(raw.hiddenLauncherIds)
    ? [...new Set(raw.hiddenLauncherIds.filter((item): item is string => typeof item === 'string' && manageableLauncherIds.has(item)))]
    : [...defaultPreferences.hiddenLauncherIds]
  const dockItemIds = Array.isArray(raw.dockItemIds)
    ? [...new Set(raw.dockItemIds.filter(validId))].slice(0, maxDockItems)
    : [...defaultPreferences.dockItemIds]
  const homeWidgetIds = Array.isArray(raw.homeWidgetIds)
    ? [...new Set(raw.homeWidgetIds.filter((item): item is HomeWidgetId => typeof item === 'string' && availableHomeWidgetIds.includes(item as HomeWidgetId)))]
    : [...defaultPreferences.homeWidgetIds]
  const visibleSearchModes = Array.isArray(raw.visibleSearchModes)
    ? [...new Set(raw.visibleSearchModes.filter((item): item is SearchMode => typeof item === 'string' && searchModes.has(item as SearchMode))) ]
    : [...defaultPreferences.visibleSearchModes]
  const wallpaper = typeof raw.wallpaper === 'string' && wallpaperChoices.some((choice) => choice.value === raw.wallpaper)
    ? raw.wallpaper
    : defaultPreferences.wallpaper
  const customWallpaperInput = typeof raw.customWallpaper === 'string' && raw.customWallpaper.length <= maxWallpaperDataUrlLength
    ? raw.customWallpaper.trim()
    : ''
  const customWallpaper = /^(https?:\/\/|linear-gradient\()/i.test(customWallpaperInput)
    || /^data:image\/(webp|png|jpeg);base64,[a-z\d+/]+={0,2}$/i.test(customWallpaperInput)
    ? customWallpaperInput
    : ''

  return {
    themeMode: merged.themeMode === 'light' || merged.themeMode === 'dark' || merged.themeMode === 'system'
      ? merged.themeMode
      : defaultPreferences.themeMode,
    hiddenLauncherIds,
    dockItemIds,
    homeWidgetIds,
    engine: typeof merged.engine === 'string' && (engines.has(merged.engine) || /^custom:[\w-]{1,128}$/.test(merged.engine))
      ? merged.engine as Preferences['engine']
      : defaultPreferences.engine,
    mode: typeof merged.mode === 'string' && searchModes.has(merged.mode as SearchMode) ? merged.mode as SearchMode : defaultPreferences.mode,
    visibleSearchModes,
    showSearchBar: typeof merged.showSearchBar === 'boolean' ? merged.showSearchBar : defaultPreferences.showSearchBar,
    showClock: typeof merged.showClock === 'boolean' ? merged.showClock : defaultPreferences.showClock,
    wallpaper,
    customWallpaper,
    wallpaperRotation: merged.wallpaperRotation === 'hourly' || merged.wallpaperRotation === 'daily'
      ? merged.wallpaperRotation
      : 'off',
    wallpaperRotationLastAt: Math.min(Date.now(), boundedNumber(raw.wallpaperRotationLastAt, defaultPreferences.wallpaperRotationLastAt, 0, Number.MAX_SAFE_INTEGER)),
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

export function sanitizeCustomSearchEngines(value: unknown): CustomSearchEngine[] {
  if (!Array.isArray(value)) return []
  const result = new Map<string, CustomSearchEngine>()
  for (const candidate of value.slice(0, 20)) {
    if (!record(candidate) || typeof candidate.id !== 'string' || !customEngineId.test(candidate.id)
      || typeof candidate.name !== 'string' || typeof candidate.template !== 'string') continue
    const name = candidate.name.trim().slice(0, 40)
    const template = candidate.template.trim()
    if (!name || !isValidCustomSearchTemplate(template) || result.has(candidate.id)) continue
    result.set(candidate.id, { id: candidate.id, name, template })
  }
  return [...result.values()]
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
    const url = normalizeWebUrl(item.url)
    if (!validId(item.id) || typeof item.title !== 'string' || typeof item.color !== 'string' || !palette.test(item.color)
      || typeof item.mark !== 'string' || !url || !validIcon(item.icon)) return undefined
    const title = item.title.trim().slice(0, 80)
    if (!title) return undefined
    return {
      id: item.id,
      title,
      url,
      color: item.color,
      mark: item.mark.trim().slice(0, 12),
      icon: typeof item.icon === 'string' && item.icon ? item.icon : undefined,
    }
  })
}

export function sanitizeFolders(value: unknown, shortcuts: Shortcut[]): ShortcutFolder[] {
  const shortcutIds = new Set(shortcuts.map((shortcut) => shortcut.id))
  const reservedIds = new Set(launcherItems.map((item) => item.id))
  const seenFolderIds = new Set<string>()
  const claimedShortcutIds = new Set<string>()
  const result: ShortcutFolder[] = []
  if (!Array.isArray(value)) return result
  for (const candidate of value.slice(0, 500)) {
    if (!record(candidate)) continue
    const item = candidate
    if (!validId(item.id) || seenFolderIds.has(item.id) || reservedIds.has(item.id) || shortcutIds.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.color !== 'string' || !palette.test(item.color)
      || typeof item.mark !== 'string' || !Array.isArray(item.shortcutIds) || item.shortcutIds.length > 500
      || !item.shortcutIds.every((id) => typeof id === 'string' && id.length <= 128)) continue
    const members = item.shortcutIds.filter((id): id is string => shortcutIds.has(id) && !claimedShortcutIds.has(id))
    seenFolderIds.add(item.id)
    members.forEach((id) => claimedShortcutIds.add(id))
    result.push({
      id: item.id,
      title: item.title.trim().slice(0, 80),
      color: item.color,
      mark: item.mark.trim().slice(0, 12),
      shortcutIds: [...new Set(members)],
    })
  }
  return result
}

export function sanitizeTodos(value: unknown): TodoItem[] {
  return uniqueRecords(value, (item) => {
    if (!validId(item.id) || typeof item.title !== 'string' || typeof item.done !== 'boolean') return undefined
    const title = item.title.trim().slice(0, 500)
    return title ? { id: item.id, title, done: item.done } : undefined
  })
}

export function sanitizeCountdowns(value: unknown): CountdownItem[] {
  return uniqueRecords(value, (item) => {
    if (!validId(item.id) || typeof item.title !== 'string' || !isValidCalendarDate(item.date)
      || (item.recurrence !== 'once' && item.recurrence !== 'yearly')) return undefined
    const title = item.title.trim().slice(0, 80)
    return title ? { id: item.id, title, date: item.date, recurrence: item.recurrence } : undefined
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

export function sanitizeLauncherOrder(value: unknown, shortcuts: Shortcut[], folders: ShortcutFolder[] = []): string[] {
  const containedShortcuts = new Set(folders.flatMap((folder) => folder.shortcutIds))
  const visibleShortcuts = shortcuts.filter((shortcut) => !containedShortcuts.has(shortcut.id))
  const allowed = new Set([...launcherItems.map((item) => item.id), ...visibleShortcuts.map((item) => item.id), ...folders.map((folder) => folder.id)])
  const order = Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id))) ]
    : []
  for (const id of defaultLauncherOrder) if (allowed.has(id) && !order.includes(id)) order.push(id)
  for (const item of visibleShortcuts) if (!order.includes(item.id)) order.push(item.id)
  for (const folder of folders) if (!order.includes(folder.id)) order.push(folder.id)
  return order
}

export function sanitizeStoredValue<T>(value: unknown, fallback: T): T {
  if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T
  if (record(fallback) && record(value)) return { ...fallback, ...value } as T
  return value === undefined || value === null ? fallback : value as T
}
