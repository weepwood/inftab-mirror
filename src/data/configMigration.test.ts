import { expect, it } from 'vitest'
import { defaultPreferences } from './defaults'
import { defaultCustomTheme, sanitizeThemePresets, validThemePresets } from './customTheme'
import { parseWorkspaceBackup } from './backup'
import { planConfigMigration } from './configMigration'

function snapshot(title: string) {
  return parseWorkspaceBackup({format:'inftab-workspace',version:1,exportedAt:'',preferences:{...defaultPreferences},shortcuts:[{id:title,title,url:'https://example.com/',color:'#abc',mark:'A'}],folders:[],launcherOrder:[title],todos:[{id:title,title,done:false}],notes:[],activeNoteId:'',weatherCity:'上海'})
}
it('validates unique theme preset ids and names and caps the library', () => {
  const first = {id:'a',name:' Blue ',theme:defaultCustomTheme}
  expect(sanitizeThemePresets([first,{...first,id:'b',name:'blue'}])).toEqual([{...first,name:'Blue'}])
  expect(validThemePresets([first,{...first,id:'b',name:'blue'}])).toBe(false)
  expect(validThemePresets(Array.from({length:21},(_,i)=>({...first,id:String(i),name:String(i)})))).toBe(false)
})
it('migrates only selected settings, retaining local private data and legacy optional themes', () => {
  const current = snapshot('local'), source = snapshot('remote')
  current.preferences.customTheme = defaultCustomTheme
  source.preferences.columns = 3
  source.preferences.themePalette = 'sand'
  const next = planConfigMigration(current,source,['appearance','layout'])
  expect(next.preferences.columns).toBe(3)
  expect(next.preferences.themePalette).toBe('sand')
  expect(next.preferences.customTheme).toEqual(defaultCustomTheme)
  expect(next.shortcuts).toEqual(current.shortcuts)
  expect(next.todos).toEqual(current.todos)
  expect(current.preferences.themePalette).toBe(defaultPreferences.themePalette)
})
it('replaces entry group together with workspace ownership and keeps private data', () => {
  const current = snapshot('local'), source = snapshot('remote')
  const next = planConfigMigration(current,source,['entries'])
  expect(next.shortcuts.map(item=>item.id)).toEqual(['remote'])
  expect(next.homeWorkspaces?.[0]?.itemIds).toContain('remote')
  expect(next.homeWorkspaces?.[0]?.itemIds).not.toContain('local')
  expect(next.todos).toEqual(current.todos)
  expect(()=>planConfigMigration(current,source,[])).toThrow()
})
