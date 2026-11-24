import { expect, it } from 'vitest'
import { defaultCustomTheme, sanitizeCustomTheme, contrastRatio } from './customTheme'
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
