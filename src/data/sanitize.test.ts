import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from './defaults'
import {
  sanitizeActiveNoteId,
  sanitizeCountdowns,
  sanitizeCustomSearchEngines,
  sanitizeFolders,
  sanitizeLauncherOrder,
  sanitizeNotes,
  sanitizePreferences,
  sanitizeShortcuts,
  sanitizeTodos,
} from './sanitize'

afterEach(() => vi.restoreAllMocks())

describe('local state sanitization', () => {
  it('clamps numeric preferences and restores unknown choices to defaults', () => {
    const result = sanitizePreferences({
      engine: 'javascript',
      mode: 'image',
      shade: -20,
      columns: 500,
      pageTransitionMs: Number.POSITIVE_INFINITY,
      visibleSearchModes: ['map', 'map', 'unsupported'],
    })

    expect(result.engine).toBe(defaultPreferences.engine)
    expect(result.mode).toBe('map')
    expect(result.shade).toBe(0)
    expect(result.columns).toBe(12)
    expect(result.pageTransitionMs).toBe(defaultPreferences.pageTransitionMs)
    expect(result.visibleSearchModes).toEqual(['map'])
  })

  it('preserves valid theme choices and falls back for invalid values', () => {
    expect(sanitizePreferences({ themeMode: 'dark' }).themeMode).toBe('dark')
    expect(sanitizePreferences({ themeMode: 'system' }).themeMode).toBe('system')
    expect(sanitizePreferences({ themeMode: 'neon' }).themeMode).toBe('light')
  })

  it('keeps the selected search type visible and falls back when every type is hidden', () => {
    expect(sanitizePreferences({ mode: 'photos', visibleSearchModes: ['html', 'news'] }).mode).toBe('html')
    expect(sanitizePreferences({ mode: 'news', visibleSearchModes: ['html', 'news'] }).mode).toBe('news')
    expect(sanitizePreferences({ mode: 'photos', visibleSearchModes: [] }).mode).toBe(defaultPreferences.mode)
  })

  it('keeps only unique hideable built-in launcher ids', () => {
    expect(sanitizePreferences({ hiddenLauncherIds: ['weather', 'weather', 'settings', 'custom', 7] }).hiddenLauncherIds).toEqual(['weather'])
    expect(sanitizePreferences({}).hiddenLauncherIds).toEqual([])
  })

  it('keeps unique valid dock ids, including custom entries, within the dock limit', () => {
    expect(sanitizePreferences({ dockItemIds: ['weather', 'shortcut-a', 'folder-a', 'weather', ''] }).dockItemIds)
      .toEqual(['weather', 'shortcut-a', 'folder-a'])
    expect(sanitizePreferences({ dockItemIds: Array.from({ length: 30 }, (_, index) => `entry-${index}`) }).dockItemIds).toHaveLength(24)
    expect(sanitizePreferences({}).dockItemIds).toEqual([])
  })

  it('keeps enabled home widgets unique and limited to registered ids', () => {
    expect(sanitizePreferences({ homeWidgetIds: ['todo-summary', 'todo-summary', 'unknown', 3, 'countdown-summary'] }).homeWidgetIds)
      .toEqual(['todo-summary', 'countdown-summary'])
    expect(sanitizePreferences({ homeWidgetIds: ['notes-summary'] }).homeWidgetIds).toEqual(['notes-summary'])
    expect(sanitizePreferences({}).homeWidgetIds).toEqual([])
  })

  it('keeps only supported home widget sizes and defaults older settings to standard', () => {
    expect(sanitizePreferences({ homeWidgetSizes: { 'todo-summary': 'wide', 'notes-summary': 'full', 'calendar-summary': 'huge', unknown: 'wide' } }).homeWidgetSizes)
      .toEqual({ 'todo-summary': 'wide', 'countdown-summary': 'standard', 'notes-summary': 'full', 'calendar-summary': 'standard', 'weather-summary': 'standard', 'focus-timer-summary': 'standard', 'bookmarks-summary': 'standard', 'history-summary': 'standard', 'habits-summary': 'standard', 'news-summary': 'standard' })
    expect(sanitizePreferences({}).homeWidgetSizes).toEqual(defaultPreferences.homeWidgetSizes)
  })

  it('drops unsafe shortcuts, duplicate ids, and malformed records', () => {
    const shortcuts = sanitizeShortcuts([
      { id: 'safe', title: ' Safe ', url: 'https://example.com', color: '#abc', mark: 'S' },
      { id: 'unsafe', title: 'Run', url: 'javascript:alert(1)', color: '#abc', mark: '!' },
      { id: 'credentialed', title: 'Trusted', url: 'https://trusted.example@evil.example/', color: '#abc', mark: 'T' },
      { id: 'safe', title: 'Duplicate', url: 'https://other.example', color: '#abc', mark: 'D' },
      null,
    ])

    expect(shortcuts).toEqual([{ id: 'safe', title: 'Safe', url: 'https://example.com/', color: '#abc', mark: 'S', icon: undefined }])
    expect(sanitizeShortcuts([{ id: 'bundled', title: 'Bundled', url: 'https://example.com', color: '#abc', mark: 'B', icon: 'site-icon.png' }])[0]?.icon).toBe('site-icon.png')
  })

  it('keeps launchers when imported colors are invalid and accepts only CSS hex lengths', () => {
    const validHexColors = ['#abc', '#abcd', '#abcdef', '#abcdef12']
    const shortcuts = sanitizeShortcuts([
      ...validHexColors.map((color, index) => ({ id: `valid-${index}`, title: 'Valid', url: 'https://example.com', color, mark: 'V' })),
      { id: 'five-digits', title: 'Five digits', url: 'https://five.example', color: '#12345', mark: 'F' },
      { id: 'seven-digits', title: 'Seven digits', url: 'https://seven.example', color: '#1234567', mark: 'S' },
      { id: 'unsafe-color', title: 'Unsafe color', url: 'https://unsafe.example', color: 'url(https://tracker.example)', mark: 'U' },
    ])
    const folders = sanitizeFolders([
      { id: 'invalid-folder-color', title: 'Imported folder', shortcutIds: [], color: '#12345', mark: 'I' },
    ], shortcuts)

    expect(shortcuts.map((shortcut) => shortcut.color)).toEqual([
      ...validHexColors,
      '#3d82f6',
      '#3d82f6',
      '#3d82f6',
    ])
    expect(folders).toEqual([{
      id: 'invalid-folder-color', title: 'Imported folder', shortcutIds: [], color: '#4176e8', mark: 'I',
    }])
  })

  it('keeps a shortcut when its optional icon is unsafe and strips protocol-relative image URLs', () => {
    const shortcuts = sanitizeShortcuts([
      { id: 'scheme-relative', title: 'Link', url: 'https://example.com', color: '#abc', mark: 'L', icon: '//tracker.example/pixel' },
      { id: 'unsafe-icon', title: 'Other link', url: 'https://other.example', color: '#abc', mark: 'O', icon: 'javascript:alert(1)' },
    ])

    expect(shortcuts).toEqual([
      { id: 'scheme-relative', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L', icon: undefined },
      { id: 'unsafe-icon', title: 'Other link', url: 'https://other.example/', color: '#abc', mark: 'O', icon: undefined },
    ])
  })

  it('reserves built-in launcher ids for built-in entries', () => {
    expect(sanitizeShortcuts([
      { id: 'weather', title: 'Replacement', url: 'https://example.com', color: '#abc', mark: 'R' },
      { id: 'custom', title: 'Custom', url: 'https://custom.example', color: '#abc', mark: 'C' },
    ])).toEqual([{ id: 'custom', title: 'Custom', url: 'https://custom.example/', color: '#abc', mark: 'C', icon: undefined }])
  })

  it('repairs launcher order and stale active note references', () => {
    const shortcuts = sanitizeShortcuts([{ id: 'custom', title: 'Custom', url: 'https://example.com', color: '#abc', mark: 'C' }])
    const order = sanitizeLauncherOrder(['ghost', 'custom', 'custom', 'weather'], shortcuts)
    const notes = sanitizeNotes([{ id: 'note-1', title: 'A', body: 'B', updatedAt: -1 }])

    expect(order.slice(0, 2)).toEqual(['custom', 'weather'])
    expect(new Set(order).size).toBe(order.length)
    expect(order).not.toContain('ghost')
    expect(notes[0]?.updatedAt).toBe(0)
    expect(sanitizeActiveNoteId('stale', notes)).toBe('note-1')
    expect(sanitizeTodos([{ id: 'todo', title: '  task ', done: false }])).toEqual([{ id: 'todo', title: 'task', done: false }])
  })

  it('keeps folder membership limited to existing shortcuts', () => {
    const shortcuts = sanitizeShortcuts([{ id: 'shortcut', title: 'Link', url: 'https://example.com', color: '#abc', mark: 'L' }])
    const folders = sanitizeFolders([
      { id: 'folder', title: 'Work', shortcutIds: ['shortcut', 'missing', 'shortcut'], color: '#369', mark: '▣' },
      { id: 'weather', title: 'Collision', shortcutIds: [], color: '#369', mark: '!' },
    ], shortcuts)
    const order = sanitizeLauncherOrder([], shortcuts, folders)

    expect(folders).toEqual([{ id: 'folder', title: 'Work', shortcutIds: ['shortcut'], color: '#369', mark: '▣' }])
    expect(order).toContain('folder')
    expect(order).not.toContain('shortcut')
    expect(folders.some((folder) => folder.id === 'weather')).toBe(false)
  })

  it('does not expose mutable default arrays through sanitized preferences', () => {
    const preferences = sanitizePreferences({})
    preferences.visibleSearchModes.push('news')

    expect(defaultPreferences.visibleSearchModes).toEqual([])
  })

  it('defaults the optional clock setting on for older saved preferences', () => {
    const preferences = sanitizePreferences({ showSearchBar: false })

    expect(preferences.showClock).toBe(true)
    expect(preferences.showSearchBar).toBe(false)
  })

  it('preserves compressed local wallpapers and rejects unsupported embedded data', () => {
    const localWallpaper = `data:image/webp;base64,${'a'.repeat(64)}`
    expect(sanitizePreferences({ customWallpaper: localWallpaper }).customWallpaper).toBe(localWallpaper)
    expect(sanitizePreferences({ customWallpaper: 'data:image/png;base64,YWJj' }).customWallpaper).toBe('data:image/png;base64,YWJj')
    expect(sanitizePreferences({ customWallpaper: 'data:image/svg+xml;base64,PHN2Zz4=' }).customWallpaper).toBe('')
    expect(sanitizePreferences({ customWallpaper: 'linear-gradient(#12345, #abcdef)' }).customWallpaper).toBe('')
    expect(sanitizePreferences({ customWallpaper: `data:image/webp;base64,${'a'.repeat(2_000_001)}` }).customWallpaper).toHaveLength(0)
  })

  it('keeps custom background CSS to a single safe gradient and canonical web image URL', () => {
    expect(sanitizePreferences({ customWallpaper: 'linear-gradient(red), url(https://tracker.example/pixel)' }).customWallpaper).toBe('')
    expect(sanitizePreferences({ customWallpaper: 'https://images.example/a.jpg"),url(https://tracker.example/pixel)' }).customWallpaper)
      .toBe('https://images.example/a.jpg%22),url(https://tracker.example/pixel)')
    expect(sanitizePreferences({ customWallpaper: 'https://user:pass@images.example/a.jpg' }).customWallpaper).toBe('')
    expect(sanitizePreferences({ customWallpaper: 'linear-gradient(135deg, #192a3a, #e0a777 52%)' }).customWallpaper)
      .toBe('linear-gradient(135deg, #192a3a, #e0a777 52%)')
    expect(sanitizePreferences({ customWallpaper: 'LINEAR-GRADIENT(135deg, #192a3a, #e0a777 52%)' }).customWallpaper)
      .toBe('linear-gradient(135deg, #192a3a, #e0a777 52%)')
  })

  it('normalizes wallpaper rotation settings and clamps future schedule timestamps', () => {
    const now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const preferences = sanitizePreferences({ wallpaperRotation: 'daily', wallpaperRotationLastAt: now + 60_000 })

    expect(preferences.wallpaperRotation).toBe('daily')
    expect(preferences.wallpaperRotationLastAt).toBe(now)
    expect(sanitizePreferences({ wallpaperRotation: 'weekly' }).wallpaperRotation).toBe('off')
  })

  it('assigns a shortcut to only the first folder and restores it when unassigned', () => {
    const shortcuts = sanitizeShortcuts([{ id: 'shortcut', title: 'Link', url: 'https://example.com', color: '#abc', mark: 'L' }])
    const folders = sanitizeFolders([
      { id: 'folder-a', title: 'A', shortcutIds: ['shortcut'], color: '#369', mark: 'A' },
      { id: 'folder-b', title: 'B', shortcutIds: ['shortcut'], color: '#369', mark: 'B' },
    ], shortcuts)

    expect(folders.map((folder) => folder.shortcutIds)).toEqual([['shortcut'], []])
    expect(sanitizeLauncherOrder(['folder-a'], shortcuts, folders)).not.toContain('shortcut')
    expect(sanitizeLauncherOrder(['folder-a'], shortcuts, [])).toContain('shortcut')
  })

  it('keeps only valid, uniquely identified countdown records', () => {
    expect(sanitizeCountdowns([
      { id: 'birthday', title: '  Birthday ', date: '2000-02-29', recurrence: 'yearly' },
      { id: 'invalid-date', title: 'Invalid', date: '2025-02-29', recurrence: 'once' },
      { id: 'birthday', title: 'Duplicate', date: '2025-05-01', recurrence: 'once' },
      { id: 'unsupported', title: 'Unsupported', date: '2025-05-01', recurrence: 'monthly' },
    ])).toEqual([{ id: 'birthday', title: 'Birthday', date: '2000-02-29', recurrence: 'yearly' }])
  })

  it('keeps custom search engines safe, bounded, and uniquely identified', () => {
    expect(sanitizeCustomSearchEngines([
      { id: 'wiki', name: ' Wiki ', template: 'https://example.com/?q={query}' },
      { id: 'wiki', name: 'Duplicate', template: 'https://duplicate.example/?q={query}' },
      { id: 'unsafe', name: 'Unsafe', template: 'javascript:{query}' },
      { id: '../bad', name: 'Bad ID', template: 'https://example.com/?q={query}' },
    ])).toEqual([{ id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }])
  })
})
