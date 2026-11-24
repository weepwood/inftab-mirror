import { expect, it } from 'vitest'
import { sanitizeCustomTheme, contrastRatio, applyCustomTheme } from './customTheme'
import { defaultCustomTheme } from './themeEditorData'
import { parseThemeFile, serializeThemeFile } from './themeExchange'
import { sanitizePreferences } from './sanitize'
import { mergeConcurrentEdits } from '../composables/concurrentState'

it('keeps legacy preferences absent and safely normalizes optional custom themes', () => {
  expect(sanitizePreferences({}).customTheme).toBeUndefined()
  expect(sanitizePreferences({customTheme:null}).customTheme).toBeNull()
  expect(sanitizePreferences({customTheme:defaultCustomTheme}).customTheme).toEqual(defaultCustomTheme)
  expect(sanitizePreferences({customTheme:{...defaultCustomTheme,radius:99}}).customTheme).toBeNull()
  expect(contrastRatio('#000000','#ffffff')).toBeCloseTo(21)
})
it('rejects CSS injection, low contrast and unsupported theme versions', () => {
  expect(sanitizeCustomTheme({...defaultCustomTheme,light:{...defaultCustomTheme.light,accent:'url(https://example.com)'}})).toBeUndefined()
  expect(sanitizeCustomTheme({...defaultCustomTheme,dark:{...defaultCustomTheme.dark,text:defaultCustomTheme.dark.surface}})).toBeUndefined()
  expect(sanitizeCustomTheme({...defaultCustomTheme,opacity:84})).toBeUndefined()
  expect(parseThemeFile(serializeThemeFile(defaultCustomTheme))).toEqual(defaultCustomTheme)
  expect(()=>parseThemeFile(JSON.stringify({format:'inftab-theme',version:2,theme:defaultCustomTheme}))).toThrow()
  expect(()=>parseThemeFile(' '.repeat(17000))).toThrow()
})

it('keeps a full valid theme on concurrent conflict and preserves unrelated edits', () => {
  const previous = sanitizePreferences({customTheme: defaultCustomTheme})
  const local = sanitizePreferences({...previous,columns: 4,customTheme:{...defaultCustomTheme,light:{accent:'#365f91',surface:'#111111',text:'#ffffff'}}})
  const external = sanitizePreferences({...previous,customTheme:{...defaultCustomTheme,light:{...defaultCustomTheme.light,text:'#000000'}}})
  const merged = mergeConcurrentEdits(local,previous,external,sanitizePreferences)
  expect(merged.customTheme).toEqual(external.customTheme)
  expect(merged.columns).toBe(4)
})

it('writes only known variables from normalized preferences and removes them on reset', () => {
  const values = new Map<string,string>()
  const attrs = new Set<string>()
  const root = {style:{setProperty:(key:string,value:string)=>values.set(key,value),removeProperty:(key:string)=>values.delete(key)},toggleAttribute:(key:string,on:boolean)=>on?attrs.add(key):attrs.delete(key)} as unknown as HTMLElement
  applyCustomTheme(root,sanitizePreferences({customTheme:defaultCustomTheme}).customTheme)
  expect(values.get('--custom-light-accent')).toBe(defaultCustomTheme.light.accent)
  expect(values.size).toBe(8)
  expect(attrs.has('data-custom-theme')).toBe(true)
  applyCustomTheme(root,sanitizePreferences({customTheme:{...defaultCustomTheme,opacity:200}}).customTheme)
  expect(values.size).toBe(0)
  expect(attrs.has('data-custom-theme')).toBe(false)
})
