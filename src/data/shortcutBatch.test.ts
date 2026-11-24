import { expect, it } from 'vitest'
import { planShortcutBatch } from './shortcutBatch'
import { defaultPreferences } from './defaults'
import type { WorkspaceBackup } from './backup'

const snapshot = () => ({ shortcuts: [{ id:'a', title:'A', url:'https://example.com/', color:'#abc', mark:'A' }, { id:'b', title:'B', url:'https://b.example/', color:'#abc', mark:'B' }], folders:[{id:'f', title:'F', shortcutIds:['a'], color:'#abc',mark:'F'}], homeWorkspaces:[{id:'default',name:'Home',itemIds:['a','b','f']},{id:'work',name:'Work',itemIds:[]}], launcherOrder:['a','b','f'], preferences:{...defaultPreferences,dockItemIds:['a']} }) as WorkspaceBackup
it('moves selected links without keeping them in a foreign folder', () => {
  const source = snapshot()
  const next = planShortcutBatch(source,{ids:['a'],kind:'move',workspaceId:'work'})
  expect(next.homeWorkspaces?.[1]?.itemIds).toEqual(['a'])
  expect(next.folders[0]?.shortcutIds).toEqual([])
  expect(source.folders[0]?.shortcutIds).toEqual(['a'])
})
it('deletes only selected shortcuts and cleans all references', () => {
  const next = planShortcutBatch(snapshot(),{ids:['a'],kind:'delete'})
  expect(next.shortcuts.map(item=>item.id)).toEqual(['b'])
  expect(next.preferences.dockItemIds).toEqual([])
  expect(next.launcherOrder).toEqual(['b','f'])
  expect(next.folders[0]?.shortcutIds).toEqual([])
})
it('normalizes tags and rejects stale selections', () => {
  const first = planShortcutBatch(snapshot(),{ids:['a','b'],kind:'tag',tag:'  Work  '})
  const second = planShortcutBatch(first,{ids:['a'],kind:'tag',tag:'work'})
  expect(second.shortcuts[0]?.tags).toEqual(['Work'])
  expect(planShortcutBatch(second,{ids:['a'],kind:'untag',tag:'WORK'}).shortcuts[0]?.tags).toEqual([])
  expect(()=>planShortcutBatch(second,{ids:['missing'],kind:'delete'})).toThrow()
})
