import { describe, expect, it } from 'vitest'
import { findLauncherMatches } from './launcherSearch'
import type { LauncherItem, ShortcutFolder } from '../types'

function site(id: string, title: string, url = `https://${id}.example/`): LauncherItem {
  return { id, title, color: '#467d68', mark: 'S', shortcut: { id, title, url, color: '#467d68', mark: 'S' } }
}
const nested = site('nested', '离线手册')
const local = site('local', 'Vue Guide')
const remote = site('remote', 'Vue Guide')
const calculator: LauncherItem = { id: 'calculator', title: '计算器', color: '#fff', mark: 'C', action: 'calculator' }
const folder: ShortcutFolder = { id: 'reading', title: '阅读资料', color: '#467d68', mark: 'R', shortcutIds: ['nested'] }
const options = {
  query: 'Vue',
  activeWorkspaceId: 'home',
  hiddenItemIds: [] as string[],
  items: [local, remote, nested, calculator, { id: folder.id, title: folder.title, color: folder.color, mark: folder.mark, folder }],
  folders: [folder],
  workspaces: [
    { id: 'work', name: '工作', itemIds: ['remote', 'calculator'] },
    { id: 'home', name: '主页', itemIds: ['local', 'nested', 'reading', 'calculator'] },
  ],
}

describe('local launcher search', () => {
  it('keeps the default scope in the active workspace', () => {
    expect(findLauncherMatches(options).map(({ item }) => item.id)).toEqual(['local'])
  })

  it('searches all workspaces on request, keeping the active workspace first on ties', () => {
    const matches = findLauncherMatches({ ...options, allWorkspaces: true })
    expect(matches.map(({ item }) => item.id)).toEqual(['local', 'remote'])
    expect(matches[1]).toMatchObject({ workspaceId: 'work', workspaceName: '工作' })
  })

  it('includes folder contents with their real location and matches folder names', () => {
    const matches = findLauncherMatches({ ...options, query: '阅读' })
    expect(matches.map(({ item }) => item.id)).toEqual(['reading', 'nested'])
    expect(matches[1]).toMatchObject({ folderTitle: '阅读资料', workspaceName: '主页' })
  })

  it('requires every query term while allowing terms across title, URL and context', () => {
    expect(findLauncherMatches({ ...options, query: '工作 Vue', allWorkspaces: true }).map(({ item }) => item.id)).toEqual(['remote'])
    expect(findLauncherMatches({ ...options, query: '阅读 nested' }).map(({ item }) => item.id)).toEqual(['nested'])
    expect(findLauncherMatches({ ...options, query: 'Vue impossible' })).toEqual([])
  })

  it('normalizes full-width characters, case and repeated spaces without stripping Unicode titles', () => {
    expect(findLauncherMatches({ ...options, query: '  ＶＵＥ   Ｇｕｉｄｅ  ' }).map(({ item }) => item.id)).toEqual(['local'])
    expect(findLauncherMatches({ ...options, query: '离线' })[0]?.item.id).toBe('nested')
  })

  it('ranks exact titles, prefixes and title words ahead of URL-only hits', () => {
    const items = [site('url', 'Reference', 'https://vue.example/'), site('words', 'Learn Vue'), site('prefix', 'Vue Docs'), site('exact', 'Vue')]
    expect(findLauncherMatches({ ...options, items, workspaces: [{ id: 'home', name: '主页', itemIds: items.map(({ id }) => id) }] }).map(({ item }) => item.id))
      .toEqual(['exact', 'prefix', 'words', 'url'])
  })

  it('deduplicates built-in tools and respects hidden entries in both scopes', () => {
    expect(findLauncherMatches({ ...options, query: '计算', allWorkspaces: true })).toMatchObject([{ workspaceId: 'home', item: { id: 'calculator' } }])
    expect(findLauncherMatches({ ...options, query: '计算', allWorkspaces: true, hiddenItemIds: ['calculator'] })).toEqual([])
    expect(findLauncherMatches({ ...options, query: '工作', allWorkspaces: true }).some(({ item }) => item.action)).toBe(false)
  })

  it('never invents a workspace, mutates records, or falls back to external search', () => {
    const before = JSON.stringify(options)
    expect(findLauncherMatches({ ...options, query: '   ' })).toEqual([])
    expect(findLauncherMatches({ ...options, activeWorkspaceId: 'removed' })).toEqual([])
    expect(findLauncherMatches({ ...options, query: 'https://new.example/' })).toEqual([])
    expect(JSON.stringify(options)).toBe(before)
  })
})
