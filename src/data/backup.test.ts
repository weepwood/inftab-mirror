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
    expect(parsed.launcherOrder).toEqual(['folder-work', 'weather', 'countdowns', 'todos', 'notes', 'settings'])
  })

  it('keeps older backups compatible with the new clock preference', () => {
    const preferences = { ...defaultPreferences, showClock: undefined }

    expect(parseWorkspaceBackup(backup({ preferences })).preferences.showClock).toBe(true)
  })

  it('rejects oversized sections and unsupported enums', () => {
    expect(() => parseWorkspaceBackup(backup({ notes: Array.from({ length: 501 }, (_, index) => ({ id: String(index), title: '', body: '', updatedAt: 1 })) }))).toThrow(/最多 500/)
    expect(() => parseWorkspaceBackup(backup({ preferences: { ...defaultPreferences, engine: 'other' } }))).toThrow(/搜索引擎/)
    expect(() => parseWorkspaceBackup(backup({ preferences: {} }))).toThrow(/结构不完整/)
  })

  it('merges by id while preserving existing order for updated items', () => {
    expect(mergeById([{ id: 'a', value: 1 }, { id: 'b', value: 2 }], [{ id: 'b', value: 3 }, { id: 'c', value: 4 }])).toEqual([
      { id: 'a', value: 1 }, { id: 'b', value: 3 }, { id: 'c', value: 4 },
    ])
  })
})
