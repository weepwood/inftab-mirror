import { describe, expect, it } from 'vitest'
import { defaultPreferences, launcherItems } from './defaults'
import { parseWorkspaceBackup } from './backup'
import { mergeById } from './mergeById'

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
    expect(parsed.habits).toEqual([])
  })

  it('strips layered wallpaper CSS that could trigger hidden remote image requests', () => {
    const parsed = parseWorkspaceBackup(backup({
      preferences: {
        ...defaultPreferences,
        customWallpaper: 'linear-gradient(red), url(https://tracker.example/pixel)',
      },
    }))

    expect(parsed.preferences.customWallpaper).toBe('')
  })

  it('preserves shortcut data while stripping protocol-relative icon URLs from imported backups', () => {
    const parsed = parseWorkspaceBackup(backup({
      shortcuts: [{ id: 'custom', title: 'Custom', url: 'https://example.com', color: '#abc', mark: 'C', icon: '//tracker.example/pixel' }],
    }))

    expect(parsed.shortcuts).toEqual([{
      id: 'custom',
      title: 'Custom',
      url: 'https://example.com/',
      color: '#abc',
      mark: 'C',
      icon: undefined,
    }])
  })

  it('repairs invalid imported colors without dropping shortcuts, folders, or workspace membership', () => {
    const parsed = parseWorkspaceBackup(backup({
      shortcuts: [{ id: 'custom', title: 'Custom', url: 'https://example.com', color: '#12345', mark: 'C' }],
      folders: [{ id: 'folder-work', title: 'Work', shortcutIds: ['custom'], color: '#1234567', mark: 'W' }],
      launcherOrder: ['folder-work', 'custom'],
      homeWorkspaces: [{ id: 'default', name: '主页', itemIds: ['folder-work', 'custom'] }],
    }))

    expect(parsed.shortcuts).toEqual([expect.objectContaining({ id: 'custom', color: '#3d82f6' })])
    expect(parsed.folders).toEqual([expect.objectContaining({ id: 'folder-work', color: '#4176e8', shortcutIds: ['custom'] })])
    expect(parsed.homeWorkspaces?.[0]?.itemIds).toEqual(expect.arrayContaining(['folder-work', 'custom']))
    expect(() => parseWorkspaceBackup(parsed)).not.toThrow()
  })

  it('validates and migrates local habit records in backups', () => {
    const parsed = parseWorkspaceBackup(backup({
      habits: [{ id: 'read', title: ' 阅读 ', completedDates: ['2026-10-12'] }],
    }))
    expect(parsed.habits).toEqual([{ id: 'read', title: '阅读', completedDates: ['2026-10-12'] }])
    expect(() => parseWorkspaceBackup(backup({
      habits: [{ id: 'invalid', title: 'Invalid', completedDates: ['2026-02-30'] }],
    }))).toThrow(/重复或无法识别/)
  })

  it('migrates older backups into one homepage containing their valid launchers', () => {
    const parsed = parseWorkspaceBackup(backup({
      folders: [{ id: 'folder-work', title: 'Work', shortcutIds: ['custom'], color: '#abc', mark: 'W' }],
    }))
    expect(parsed.homeWorkspaces).toHaveLength(1)
    expect(parsed.homeWorkspaces?.[0]?.itemIds).toEqual(expect.arrayContaining(['weather', 'custom', 'folder-work']))
    expect(parsed.activeHomeWorkspaceId).toBe(parsed.homeWorkspaces?.[0]?.id)
  })

  it('filters unknown workspace entries while preserving valid workspace metadata', () => {
    const parsed = parseWorkspaceBackup(backup({
      launcherOrder: ['weather', 'custom', 'folder-work'],
      folders: [{ id: 'folder-work', title: 'Work', shortcutIds: ['custom'], color: '#abc', mark: 'W' }],
      homeWorkspaces: [
        { id: 'default', name: '主页', itemIds: ['custom', 'folder-work', 'missing'] },
        { id: 'games', name: '游戏', itemIds: ['custom', 'missing'] },
      ],
      activeHomeWorkspaceId: 'games',
    }))
    expect(parsed.homeWorkspaces?.find((item) => item.id === 'default')?.itemIds).toContain('folder-work')
    expect(parsed.homeWorkspaces?.every((workspace) => !workspace.itemIds.includes('missing'))).toBe(true)
    expect(parsed.activeHomeWorkspaceId).toBe('games')
  })

  it('repairs invalid active workspace references and rejects malformed workspace containers', () => {
    const parsed = parseWorkspaceBackup(backup({ activeHomeWorkspaceId: 'absent' }))
    expect(parsed.activeHomeWorkspaceId).toBe(parsed.homeWorkspaces?.[0]?.id)
    expect(() => parseWorkspaceBackup(backup({ homeWorkspaces: 'invalid' }))).toThrow(/主页工作区/)
    expect(() => parseWorkspaceBackup(backup({ homeWorkspaces: Array.from({ length: 21 }, (_, index) => ({ id: `space-${index}`, name: `Space ${index}`, itemIds: [] })) }))).toThrow(/主页工作区数量无效/)
  })

  it('rejects a malformed workspace instead of orphaning its custom launchers', () => {
    expect(() => parseWorkspaceBackup(backup({
      homeWorkspaces: [
        { id: 'default', name: '主页', itemIds: ['weather'] },
        { id: 'work', name: '工作', itemIds: 'custom' },
      ],
      activeHomeWorkspaceId: 'default',
    }))).toThrow(/工作区结构无效/)
  })

  it('rejects duplicate workspace IDs before one can be silently discarded', () => {
    const workspace = { id: 'work', name: '工作', itemIds: ['custom'] }
    expect(() => parseWorkspaceBackup(backup({
      homeWorkspaces: [
        { id: 'default', name: '主页', itemIds: [] },
        workspace,
        workspace,
      ],
    }))).toThrow(/重复的工作区 ID/)
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
    const credentialed = backup({ shortcuts: [{ id: 'bad-auth', title: 'Trusted', url: 'https://trusted.example@evil.example/', color: '#abc', mark: '!' }] })
    expect(() => parseWorkspaceBackup(credentialed)).toThrow(/重复或无法识别/)
  })

  it('rejects shortcuts that collide with built-in launcher ids', () => {
    expect(() => parseWorkspaceBackup(backup({
      shortcuts: [{ id: 'weather', title: 'Replacement', url: 'https://example.com', color: '#abc', mark: 'R' }],
    }))).toThrow(/重复或无法识别/)
  })

  it('explains when a backup reuses one launcher ID for a shortcut and folder', () => {
    expect(() => parseWorkspaceBackup(backup({
      folders: [{ id: 'custom', title: 'Work', shortcutIds: ['custom'], color: '#369', mark: 'W' }],
    }))).toThrow(/快捷入口与文件夹使用了相同的入口 ID/)
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
    expect(parsed.launcherOrder).toEqual(['folder-work', 'weather', 'countdowns', 'habits', 'todos', 'focus-timer', 'notes', 'settings', 'bookmarks', 'history', 'calculator', 'calendar'])
  })

  it.each([
    ['folders', '文件夹'],
    ['habits', '习惯'],
    ['countdowns', '纪念日'],
    ['customSearchEngines', '自定义搜索引擎'],
  ])('rejects an explicitly null optional %s list rather than silently importing it empty', (key, label) => {
    expect(() => parseWorkspaceBackup(backup({ [key]: null }))).toThrow(`备份中的${label}数量无效`)
  })

  it('keeps older backups compatible with the new clock preference', () => {
    const preferences = { ...defaultPreferences, showClock: undefined, themeMode: undefined, dockItemIds: undefined, homeWidgetIds: undefined }

    expect(parseWorkspaceBackup(backup({ preferences })).preferences.showClock).toBe(true)
    expect(parseWorkspaceBackup(backup({ preferences })).preferences.themeMode).toBe('light')
    expect(parseWorkspaceBackup(backup({ preferences })).preferences.dockItemIds).toEqual([])
    expect(parseWorkspaceBackup(backup({ preferences })).preferences.homeWidgetIds).toEqual([])
  })

  it('keeps backups without the newer focus timer widget size compatible', () => {
    const homeWidgetSizes = Object.fromEntries(Object.entries(defaultPreferences.homeWidgetSizes)
      .filter(([id]) => id !== 'focus-timer-summary' && id !== 'bookmarks-summary' && id !== 'history-summary'))
    const preferences = { ...defaultPreferences, homeWidgetSizes }
    const parsed = parseWorkspaceBackup(backup({ preferences, focusTimer: undefined }))

    expect(parsed.preferences.homeWidgetSizes['focus-timer-summary']).toBe('standard')
    expect(parsed.preferences.homeWidgetSizes['bookmarks-summary']).toBe('standard')
    expect(parsed.preferences.homeWidgetSizes['history-summary']).toBe('standard')
    expect(parsed.focusTimer).toBeUndefined()
  })

  it('backs up built-in, custom, and folder Dock items while rejecting stale ids', () => {
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, dockItemIds: ['weather', 'custom', 'folder-work'] },
      folders: [{ id: 'folder-work', title: 'Work', shortcutIds: ['custom'], color: '#369', mark: 'W' }],
    })).preferences.dockItemIds).toEqual(['weather', 'custom', 'folder-work'])
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, dockItemIds: ['custom-shortcut'] },
    }))).toThrow(/Dock 入口/)
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, dockItemIds: Array.from({ length: 25 }, (_, index) => `entry-${index}`) },
    }))).toThrow(/页面设置无法识别/)
  })

  it('backs up valid home widgets and rejects unknown widget ids', () => {
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, homeWidgetIds: ['todo-summary', 'countdown-summary', 'notes-summary'] },
    })).preferences.homeWidgetIds).toEqual(['todo-summary', 'countdown-summary', 'notes-summary'])
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, homeWidgetSizes: { ...defaultPreferences.homeWidgetSizes, 'todo-summary': 'wide' } },
    })).preferences.homeWidgetSizes['todo-summary']).toBe('wide')
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, homeWidgetSizes: { ...defaultPreferences.homeWidgetSizes, 'todo-summary': 'full' } },
    })).preferences.homeWidgetSizes['todo-summary']).toBe('full')
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, homeWidgetSizes: { ...defaultPreferences.homeWidgetSizes, 'todo-summary': 'huge' } },
    }))).toThrow(/页面设置无法识别/)
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, homeWidgetIds: ['remote-code'] },
    }))).toThrow(/页面设置无法识别/)
  })

  it('preserves hidden panels and rejects unknown hidden launcher ids', () => {
    expect(parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, hiddenLauncherIds: ['weather', 'calendar'] },
    })).preferences.hiddenLauncherIds).toEqual(['weather', 'calendar'])
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, hiddenLauncherIds: ['custom-shortcut'] },
    }))).toThrow(/页面设置无法识别/)
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

  it('preserves the wallpaper rotation schedule and rejects unknown intervals', () => {
    const schedule = { ...defaultPreferences, wallpaperRotation: 'daily', wallpaperRotationLastAt: 1_700_000_000_000 }
    expect(parseWorkspaceBackup(backup({ preferences: schedule })).preferences).toMatchObject({
      wallpaperRotation: 'daily', wallpaperRotationLastAt: 1_700_000_000_000,
    })
    expect(() => parseWorkspaceBackup(backup({
      preferences: { ...defaultPreferences, wallpaperRotation: 'weekly' },
    }))).toThrow(/页面设置无法识别/)
  })

  it('rejects oversized sections and unsupported enums', () => {
    expect(() => parseWorkspaceBackup(backup({ notes: Array.from({ length: 501 }, (_, index) => ({ id: String(index), title: '', body: '', updatedAt: 1 })) }))).toThrow(/最多 500/)
    expect(() => parseWorkspaceBackup(backup({ preferences: { ...defaultPreferences, engine: 'other' } }))).toThrow(/搜索引擎/)
    expect(() => parseWorkspaceBackup(backup({ preferences: {} }))).toThrow(/结构不完整/)
  })

  it('accepts the maximum launcher order allowed by the shortcut and folder limits', () => {
    const limit = 1_000 + launcherItems.length
    const maximumLauncherOrder = Array.from({ length: limit }, (_, index) => `item-${index}`)
    expect(() => parseWorkspaceBackup(backup({ launcherOrder: maximumLauncherOrder }))).not.toThrow()
    expect(() => parseWorkspaceBackup(backup({ launcherOrder: [...maximumLauncherOrder, 'overflow'] }))).toThrow(`最多 ${limit} 项`)
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
