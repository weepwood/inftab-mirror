// @vitest-environment jsdom
import { effectScope } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { parseWorkspaceBackup } from '../data/backup'
import { defaultFocusTimerState, startFocusTimer } from '../data/focusTimer'
import { useLocalWorkspace } from './useLocalWorkspace'

let scope: ReturnType<typeof effectScope> | undefined

afterEach(() => {
  scope?.stop()
  scope = undefined
  localStorage.clear()
})

describe('useLocalWorkspace default shortcut migration', () => {
  it('repairs outdated built-in icon paths without replacing user-selected icons', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'lunwenmao', title: '论文猫', url: 'https://www.lunwenmao.com/', color: '#f6f7f8', mark: '猫', icon: 'ebd5cc9193de437e76de2ca1abd2121.png' },
      { id: 'fox', title: '狐猴', url: 'https://www.google.com/', color: '#06b8df', mark: '狐', icon: '24f02a8178e623d22dc563857bf32f8.png' },
      { id: 'infinitytab', title: 'Infinitytab', url: 'https://inftab.com/', color: '#141414', mark: '∞', icon: 'bc545d7b32d3c84c3041ca092fb2689.png' },
      { id: 'jd', title: '京东收藏夹', url: 'https://www.jd.com/', color: '#e9232e', mark: 'JD', icon: 'data:image/png;base64,custom' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    expect(workspace.shortcuts.value.find((item) => item.id === 'lunwenmao')?.icon).toBe('ebd5cc9193bde437e76de2ca1abd2121.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'fox')?.icon).toBe('24f02a8178e6236d22dc563857bf32f8.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'infinitytab')?.icon).toBe('bc545d7b32d3dc84c3041ca092fb2689.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'jd')?.icon).toBe('data:image/png;base64,custom')
  })
})

describe('useLocalWorkspace default shortcut URL migration', () => {
  it('repairs known placeholder targets while preserving custom destinations', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'fox', title: 'Lemur', url: 'https://www.google.com/', color: '#06b8df', mark: 'F' },
      { id: 'games', title: 'Games', url: 'https://inftab.com/', color: '#f7f7f7', mark: 'G' },
      { id: 'infinitytab', title: 'Infinity', url: 'https://inftab.com/', color: '#141414', mark: 'I' },
      { id: 'jd', title: 'My store', url: 'https://shop.example/', color: '#e9232e', mark: 'J' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    expect(workspace.shortcuts.value.find((item) => item.id === 'fox')?.url).toBe('https://www.lemurbrowser.com/app/zh/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'games')?.url).toBe('https://games.inftab.com/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'infinitytab')?.url).toBe('https://www.infinitytab.com/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'jd')?.url).toBe('https://shop.example/')
  })
})

describe('useLocalWorkspace launcher ordering', () => {
  it('preserves hidden launcher positions while reordering visible items', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const originalOrder = [...workspace.launcherOrder.value]
    const hiddenIds = new Set(['weather', 'calendar'])
    const visibleIds = originalOrder.filter((id) => !hiddenIds.has(id))

    workspace.reorderLauncherItems('todos', 'settings', visibleIds)

    const nextVisibleIds = workspace.launcherOrder.value.filter((id) => !hiddenIds.has(id))
    const expectedVisibleIds = [...visibleIds]
    const todosIndex = expectedVisibleIds.indexOf('todos')
    expectedVisibleIds.splice(todosIndex, 1)
    expectedVisibleIds.splice(expectedVisibleIds.indexOf('settings'), 0, 'todos')
    expect(nextVisibleIds).toEqual(expectedVisibleIds)
    expect(workspace.launcherOrder.value.indexOf('weather')).toBe(originalOrder.indexOf('weather'))
    expect(workspace.launcherOrder.value.indexOf('calendar')).toBe(originalOrder.indexOf('calendar'))
  })
})

describe('useLocalWorkspace focus timer', () => {
  it('shares timer actions with panels and includes the state in backups', async () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const now = Date.now()
    await workspace.setFocusDuration(50)
    await workspace.startFocusTimer()
    expect(workspace.focusTimer.value.endsAt).toBeGreaterThan(now)
    expect(workspace.focusTimer.value.focusMinutes).toBe(50)

    const backup = parseWorkspaceBackup(workspace.createBackup())
    expect(backup.focusTimer).toMatchObject({ focusMinutes: 50, endsAt: workspace.focusTimer.value.endsAt })

    await workspace.resetFocusTimer()
    workspace.restoreBackup(backup, 'replace')
    expect(workspace.focusTimer.value).toEqual(backup.focusTimer)
  })

  it('defaults the timer when replacing from an older backup without timer data', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.focusTimer.value = startFocusTimer(defaultFocusTimerState, Date.now())
    const backup = workspace.createBackup()
    delete backup.focusTimer
    workspace.restoreBackup(backup, 'replace')
    expect(workspace.focusTimer.value).toEqual(defaultFocusTimerState)
  })
})

describe('useLocalWorkspace shortcut id validation', () => {
  it('does not let a custom shortcut replace a built-in launcher entry', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingShortcuts = [...workspace.shortcuts.value]

    expect(workspace.saveShortcut({ id: 'weather', title: 'Replacement', url: 'https://example.com/', color: '#abc', mark: 'R' })).toBe(false)
    expect(workspace.shortcuts.value).toEqual(existingShortcuts)
  })
})

describe('useLocalWorkspace dock references', () => {
  it('removes deleted shortcuts and folders from the persistent dock', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const shortcut = { id: 'dock-shortcut', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' }
    const folder = { id: 'dock-folder', title: 'Folder', shortcutIds: [], color: '#abc', mark: 'F' }

    expect(workspace.saveShortcut(shortcut)).toBe(true)
    expect(workspace.saveFolder(folder)).toBe(true)
    workspace.updatePreferences({ dockItemIds: [shortcut.id, folder.id] })
    workspace.removeShortcut(shortcut.id)
    expect(workspace.preferences.value.dockItemIds).toEqual([folder.id])
    workspace.removeFolder(folder.id)
    expect(workspace.preferences.value.dockItemIds).toEqual([])
  })

  it('cleans Dock references when shortcuts disappear in another tab', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'external-link', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' },
    ]))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: ['external-link'] }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.shortcuts.v1',
      oldValue: localStorage.getItem('inftab.shortcuts.v1'),
      newValue: '[]',
    }))

    expect(workspace.shortcuts.value).toEqual([])
    expect(workspace.preferences.value.dockItemIds).toEqual([])
  })

  it('repairs folder membership and keeps backups valid when shortcuts disappear in another tab', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'external-link', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' },
    ]))
    localStorage.setItem('inftab.folders.v1', JSON.stringify([
      { id: 'external-folder', title: 'Folder', shortcutIds: ['external-link'], color: '#abc', mark: 'F' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.shortcuts.v1',
      oldValue: localStorage.getItem('inftab.shortcuts.v1'),
      newValue: '[]',
    }))

    expect(workspace.shortcuts.value).toEqual([])
    expect(workspace.folders.value[0]?.shortcutIds).toEqual([])
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })
})

describe('useLocalWorkspace custom search engines', () => {
  it('moves selection to a surviving note when another tab deletes the active note', () => {
    const notes = [
      { id: 'note-first', title: 'First', body: '', updatedAt: 1 },
      { id: 'note-active', title: 'Active', body: '', updatedAt: 2 },
    ]
    localStorage.setItem('inftab.notes.v1', JSON.stringify(notes))
    localStorage.setItem('inftab.active-note.v1', JSON.stringify('note-active'))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.notes.v1',
      oldValue: JSON.stringify(notes),
      newValue: JSON.stringify([notes[0]]),
    }))

    expect(workspace.notes.value).toEqual([notes[0]])
    expect(workspace.activeNoteId.value).toBe('note-first')
    expect(workspace.createBackup().activeNoteId).toBe('note-first')
  })

  it('adds and selects a validated engine, then falls back when it is removed', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    workspace.addCustomSearchEngine('Wiki', 'https://example.com/?q={query}')
    expect(workspace.customSearchEngines.value).toHaveLength(1)
    const engine = workspace.customSearchEngines.value[0]!
    expect(workspace.preferences.value.engine).toBe('custom:' + engine.id)
    expect(engine.template).toBe('https://example.com/?q={query}')

    workspace.removeCustomSearchEngine(engine.id)
    expect(workspace.customSearchEngines.value).toEqual([])
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('includes custom engines in backups and merges or replaces them with preferences', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.addCustomSearchEngine('Existing', 'https://existing.example/?q={query}')
    const existing = workspace.customSearchEngines.value[0]!
    const backup = workspace.createBackup()
    backup.customSearchEngines = [
      { id: 'imported', name: 'Imported', template: 'https://imported.example/?q={query}' },
    ]
    backup.preferences.engine = 'custom:imported'

    workspace.restoreBackup(backup, 'merge')
    expect(workspace.customSearchEngines.value.map((engine) => engine.id)).toEqual([existing.id, 'imported'])
    expect(workspace.preferences.value.engine).toBe('custom:imported')

    workspace.restoreBackup(backup, 'replace')
    expect(workspace.customSearchEngines.value.map((engine) => engine.id)).toEqual(['imported'])
    expect(workspace.preferences.value.engine).toBe('custom:imported')
  })

  it.each(['merge', 'replace'] as const)('preserves imported Dock entries and folder membership during %s restore', (mode) => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const backup = workspace.createBackup()
    backup.shortcuts = [{ id: 'restored-shortcut', title: 'Restored', url: 'https://restored.example/', color: '#abc', mark: 'R' }]
    backup.folders = [{ id: 'restored-folder', title: 'Restored folder', shortcutIds: ['restored-shortcut'], color: '#369', mark: 'F' }]
    backup.launcherOrder = ['restored-folder', 'restored-shortcut']
    backup.preferences.dockItemIds = ['restored-shortcut', 'restored-folder']

    expect(workspace.restoreBackup(backup, mode)).toBeUndefined()

    expect(workspace.preferences.value.dockItemIds).toEqual(['restored-shortcut', 'restored-folder'])
    expect(workspace.folders.value[0]?.shortcutIds).toEqual(['restored-shortcut'])
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })

  it('repairs a stored preference that points to a missing custom engine', () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ engine: 'custom:missing' }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('repairs the selected engine when another tab removes it', () => {
    const engine = { id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }
    localStorage.setItem('inftab.custom-search-engines.v1', JSON.stringify([engine]))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ engine: 'custom:wiki' }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.custom-search-engines.v1',
      oldValue: localStorage.getItem('inftab.custom-search-engines.v1'),
      newValue: '[]',
    }))

    expect(workspace.customSearchEngines.value).toEqual([])
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('keeps todo and note mutations valid for a version-one backup', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.addTodo('   ')
    expect(workspace.todos.value).toEqual([])
    workspace.addTodo('  Review release  ')
    const todoId = workspace.todos.value[0]!.id
    workspace.updateTodo(todoId, ' x '.repeat(200))
    expect(workspace.todos.value[0]?.title).toHaveLength(500)

    workspace.todos.value = Array.from({ length: 500 }, (_, index) => ({ id: 'todo-' + index, title: 'Task ' + index, done: false }))
    workspace.addTodo('Overflow')
    expect(workspace.todos.value).toHaveLength(500)

    workspace.notes.value = Array.from({ length: 500 }, (_, index) => ({ id: 'note-' + index, title: 'Note ' + index, body: '', updatedAt: 1 }))
    workspace.activeNoteId.value = 'note-0'
    workspace.addNote()
    expect(workspace.notes.value).toHaveLength(500)
    workspace.updateNote('note-0', 'title', 'T'.repeat(600))
    workspace.updateNote('note-0', 'body', 'B'.repeat(500_001))
    expect(workspace.notes.value[0]?.title).toHaveLength(500)
    expect(workspace.notes.value[0]?.body).toHaveLength(500_000)
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })

  it('enforces shortcut and folder backup limits at the workspace boundary', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.shortcuts.value = Array.from({ length: 500 }, (_, index) => ({
      id: `shortcut-${index}`, title: `Shortcut ${index}`, url: `https://example-${index}.com/`, color: '#abc', mark: 'S',
    }))
    expect(workspace.saveShortcut({ id: 'shortcut-overflow', title: 'Overflow', url: 'https://overflow.example/', color: '#abc', mark: 'O' })).toBe(false)
    expect(workspace.shortcuts.value).toHaveLength(500)

    workspace.folders.value = Array.from({ length: 500 }, (_, index) => ({
      id: `folder-${index}`, title: `Folder ${index}`, shortcutIds: [], color: '#abc', mark: 'F',
    }))
    expect(workspace.saveFolder({ id: 'folder-overflow', title: 'Overflow', shortcutIds: [], color: '#abc', mark: 'O' })).toBe(false)
    expect(workspace.folders.value).toHaveLength(500)

    const originalFolder = workspace.folders.value[0]!
    expect(workspace.saveFolder({ ...originalFolder, color: 'invalid' })).toBe(false)
    expect(workspace.folders.value[0]).toEqual(originalFolder)
  })

  it('rejects a merge that exceeds a section limit without applying partial changes', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.shortcuts.value = Array.from({ length: 500 }, (_, index) => ({
      id: `shortcut-${index}`, title: `Shortcut ${index}`, url: `https://example-${index}.com/`, color: '#abc', mark: 'S',
    }))
    const incoming = workspace.createBackup()
    incoming.shortcuts = [{ id: 'imported', title: 'Imported', url: 'https://imported.example/', color: '#abc', mark: 'I' }]
    incoming.preferences.showClock = !workspace.preferences.value.showClock

    const result = workspace.restoreBackup(incoming, 'merge')

    expect(result).toContain('快捷入口将超过数量上限')
    expect(workspace.shortcuts.value).toHaveLength(500)
    expect(workspace.preferences.value.showClock).not.toBe(incoming.preferences.showClock)
  })

  it('rejects cross-type launcher ID conflicts without dropping existing folders', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingFolder = { id: 'shared-launcher-id', title: 'Existing folder', shortcutIds: [], color: '#abc', mark: 'F' }
    expect(workspace.saveFolder(existingFolder)).toBe(true)

    const incoming = workspace.createBackup()
    incoming.folders = []
    incoming.shortcuts = [{ id: existingFolder.id, title: 'Imported shortcut', url: 'https://imported.example/', color: '#abc', mark: 'I' }]
    incoming.launcherOrder = [existingFolder.id]
    const validatedIncoming = parseWorkspaceBackup(incoming)

    const result = workspace.restoreBackup(validatedIncoming, 'merge')

    expect(result).toContain('相同的入口 ID')
    expect(workspace.folders.value).toEqual([existingFolder])
    expect(workspace.shortcuts.value.some((item) => item.id === existingFolder.id)).toBe(false)
  })

  it('rejects incoming folders that reuse existing shortcut IDs', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingShortcut = { id: 'shared-launcher-id', title: 'Existing shortcut', url: 'https://existing.example/', color: '#abc', mark: 'S' }
    expect(workspace.saveShortcut(existingShortcut)).toBe(true)

    const incoming = workspace.createBackup()
    incoming.shortcuts = incoming.shortcuts.filter((item) => item.id !== existingShortcut.id)
    incoming.folders = [{ id: existingShortcut.id, title: 'Imported folder', shortcutIds: [], color: '#369', mark: 'F' }]
    incoming.launcherOrder = [existingShortcut.id]
    const validatedIncoming = parseWorkspaceBackup(incoming)

    const result = workspace.restoreBackup(validatedIncoming, 'merge')

    expect(result).toContain('相同的入口 ID')
    expect(workspace.shortcuts.value).toContainEqual(existingShortcut)
    expect(workspace.folders.value.some((item) => item.id === existingShortcut.id)).toBe(false)
  })
})
