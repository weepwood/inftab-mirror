import type { CustomTheme } from '../types'
import { maxThemePresets, sanitizeThemePresets } from './customTheme'

export const defaultCustomTheme: CustomTheme = {
  light: { accent: '#365f91', surface: '#ffffff', text: '#242e3d' },
  dark: { accent: '#435e8a', surface: '#202a39', text: '#edf2fa' },
  radius: 10, opacity: 96,
}
export function validThemePresets(value: unknown): boolean {
  return Array.isArray(value) && value.length <= maxThemePresets && sanitizeThemePresets(value).length === value.length
}
