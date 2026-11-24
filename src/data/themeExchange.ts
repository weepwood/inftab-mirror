import type { CustomTheme } from '../types'
import { sanitizeCustomTheme } from './customTheme'
import { isRecord } from './validation'
import { downloadText } from './downloadBackup'

export const maxThemeFileBytes = 16 * 1024
export function parseThemeFile(text: string): CustomTheme {
  if (new Blob([text]).size > maxThemeFileBytes) throw new Error('主题文件超过 16 KiB。')
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || value.format !== 'inftab-theme' || value.version !== 1) throw new Error('不支持的主题文件。')
  const theme = sanitizeCustomTheme(value.theme)
  if (!theme) throw new Error('主题颜色、对比度或尺寸参数无效。')
  return theme
}
export function serializeThemeFile(theme: CustomTheme) {
  const safe = sanitizeCustomTheme(theme)
  if (!safe) throw new Error('请先修正主题参数。')
  return JSON.stringify({ format: 'inftab-theme', version: 1, theme: safe }, null, 2)
}
export function downloadThemeFile(theme: CustomTheme) {
  downloadText(serializeThemeFile(theme), 'application/json', 'inftab-theme.json')
}
