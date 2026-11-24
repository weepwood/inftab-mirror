import { expect, it } from 'vitest'
import { defaultCustomTheme, sanitizeCustomTheme, contrastRatio } from './customTheme'
import { parseThemeFile, serializeThemeFile } from './themeExchange'
import { sanitizePreferences } from './sanitize'

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
