// @vitest-environment jsdom
import { effectScope } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('useLocalWorkspace custom search engines', () => {
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

  it('repairs a stored preference that points to a missing custom engine', () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ engine: 'custom:missing' }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    expect(workspace.preferences.value.engine).toBe('baidu')
  })
})
