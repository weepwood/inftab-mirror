import type { CustomTheme } from '../types'
import { sanitizeCustomTheme } from './customTheme'
import { isRecord } from './validation'

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
  const url = URL.createObjectURL(new Blob([serializeThemeFile(theme)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'inftab-theme.json'
  try { document.body.append(anchor); anchor.click() } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000) }
}
