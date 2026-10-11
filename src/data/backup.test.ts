import { describe, expect, it } from 'vitest'
import { defaultPreferences } from './defaults'
import { mergeById, parseWorkspaceBackup } from './backup'

function backup(overrides: Record<string, unknown> = {}) {
  return {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    preferences: { ...defaultPreferences },
    shortcuts: [{ id: 'custom', title: 'Custom', url: 'https://example.com', color: '#abc', mark: 'C' }],
    launcherOrder: ['weather', 'custom', 'stale-id'],
    todos: [{ id: 'todo-1', title: 'Task', done: false }],
    notes: [{ id: 'note-1', title: 'Note', body: 'Text', updatedAt: 1 }],
    activeNoteId: 'missing-note',
    weatherCity: '上海',
    ...overrides,
  }
}

describe('workspace backups', () => {
  it('normalizes preferences and repairs broken entry and note references', () => {
    const parsed = parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, columns: 999, shade: -1 },
    }))

    expect(parsed.preferences.columns).toBe(12)
    expect(parsed.preferences.shade).toBe(0)
    expect(parsed.launcherOrder).not.toContain('stale-id')
    expect(parsed.activeNoteId).toBe('note-1')
  })

  it('rejects duplicate and unsafe shortcut data instead of silently losing it', () => {
    const duplicated = backup({
      shortcuts: [
        { id: 'same', title: 'One', url: 'https://one.example', color: '#abc', mark: '1' },
        { id: 'same', title: 'Two', url: 'https://two.example', color: '#abc', mark: '2' },
      ],
    })
    expect(() => parseWorkspaceBackup(duplicated)).toThrow(/重复或无法识别/)

    const unsafe = backup({ shortcuts: [{ id: 'bad', title: 'Bad', url: 'javascript:alert(1)', color: '#abc', mark: '!' }] })
    expect(() => parseWorkspaceBackup(unsafe)).toThrow(/重复或无法识别/)
  })

  it('imports version-one backups without folders and filters stale folder members', () => {
    expect(parseWorkspaceBackup(backup()).folders).toEqual([])
    expect(parseWorkspaceBackup(backup()).countdowns).toEqual([])
    const parsed = parseWorkspaceBackup(backup({
      countdowns: [{ id: 'anniversary', title: 'Anniversary', date: '2020-02-29', recurrence: 'yearly' }],
      folders: [{ id: 'folder-work', title: '工作', shortcutIds: ['custom', 'missing'], color: '#369', mark: '工' }],
      launcherOrder: ['folder-work', 'custom'],
    }))
    expect(parsed.countdowns).toEqual([{ id: 'anniversary', title: 'Anniversary', date: '2020-02-29', recurrence: 'yearly' }])
    expect(parsed.folders[0]?.shortcutIds).toEqual(['custom'])
    expect(parsed.launcherOrder).toEqual(['folder-work', 'weather', 'countdowns', 'todos', 'notes', 'settings', 'bookmarks', 'history', 'calculator', 'calendar'])
  })

  it('keeps older backups compatible with the new clock preference', () => {
    const preferences = { ...defaultPreferences, showClock: undefined, themeMode: undefined }

    expect(parseWorkspaceBackup(backup({ preferences })).preferences.showClock).toBe(true)
    expect(parseWorkspaceBackup(backup({ preferences })).preferences.themeMode).toBe('light')
  })

  it('imports theme preferences and rejects unsupported theme values', () => {
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, themeMode: 'dark' },
    })).preferences.themeMode).toBe('dark')
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, themeMode: 'neon' },
    }))).toThrow(/页面设置无法识别/)
  })

  it('preserves custom engines and requires a selected custom engine to be included', () => {
    const customSearchEngines = [{ id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }]
    const parsed = parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, engine: 'custom:wiki' },
      customSearchEngines,
    }))
    expect(parsed.customSearchEngines).toEqual(customSearchEngines)
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, engine: 'custom:missing' },
      customSearchEngines,
    }))).toThrow(/搜索引擎/)
    expect(() => parseWorkspaceBackup(backup({
      customSearchEngines: [{ id: 'bad', name: 'Unsafe', template: 'javascript:{query}' }],
    }))).toThrow(/重复或无法识别/)
  })

  it('preserves a compressed local wallpaper when restoring a backup', () => {
    const localWallpaper = 'data:image/webp;base64,YWJj'
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, customWallpaper: localWallpaper },
    })).preferences.customWallpaper).toBe(localWallpaper)
  })

  it('rejects oversized sections and unsupported enums', () => {
    expect(() => parseWorkspaceBackup(backup({ notes: Array.from({ length: 501 }, (_, index) => ({ id: String(index), title: '', body: '', updatedAt: 1 })) }))).toThrow(/最多 500/)
    expect(() => parseWorkspaceBackup(backup({ preferences: { ...defaultPreferences, engine: 'other' } }))).toThrow(/搜索引擎/)
    expect(() => parseWorkspaceBackup(backup({ preferences: {} }))).toThrow(/结构不完整/)
  })

  it('accepts the maximum launcher order allowed by the shortcut and folder limits', () => {
    const maximumLauncherOrder = Array.from({ length: 1_009 }, (_, index) => `item-${index}`)
    expect(() => parseWorkspaceBackup(backup({ launcherOrder: maximumLauncherOrder }))).not.toThrow()
    expect(() => parseWorkspaceBackup(backup({ launcherOrder: [...maximumLauncherOrder, 'overflow'] }))).toThrow(/最多 1009 项/)
  })

  it('rejects backups with oversized embedded wallpapers', () => {
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, customWallpaper: `data:image/webp;base64,${'a'.repeat(2_000_001)}` },
    }))).toThrow(/自定义壁纸超过大小限制/)
  })

  it('merges by id while preserving existing order for updated items', () => {
    expect(mergeById([{ id: 'a', value: 1 }, { id: 'b', value: 2 }], [{ id: 'b', value: 3 }, { id: 'c', value: 4 }])).toEqual([
      { id: 'a', value: 1 }, { id: 'b', value: 3 }, { id: 'c', value: 4 },
    ])
  })
})
