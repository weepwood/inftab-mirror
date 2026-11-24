import type { CustomTheme, ThemeColors } from '../types'
import { isRecord } from './validation'

const color = (value: unknown): string | undefined => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
function luminance(value: string) {
  const channels = [1, 3, 5].map(i => {
    const v = Number.parseInt(value.slice(i, i + 2), 16) / 255
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
  })
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722
}
export function contrastRatio(a: string, b: string) {
  const first = luminance(a), second = luminance(b)
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
}
function parseColors(value: unknown): ThemeColors | undefined {
  if (!isRecord(value)) return undefined
  const accent = color(value.accent), surface = color(value.surface), text = color(value.text)
  if (!accent || !surface || !text || contrastRatio(surface, text) < 4.5 || contrastRatio(accent, '#ffffff') < 4.5) return undefined
  return { accent, surface, text }
}
export function sanitizeCustomTheme(value: unknown): CustomTheme | undefined {
  if (!isRecord(value)) return undefined
  const light = parseColors(value.light), dark = parseColors(value.dark)
  if (!light || !dark || typeof value.radius !== 'number' || !Number.isInteger(value.radius) || value.radius < 0 || value.radius > 24
    || typeof value.opacity !== 'number' || !Number.isInteger(value.opacity) || value.opacity < 85 || value.opacity > 100) return undefined
  return { light, dark, radius: value.radius, opacity: value.opacity }
}
export const defaultCustomTheme: CustomTheme = {
  light: { accent: '#365f91', surface: '#ffffff', text: '#242e3d' },
  dark: { accent: '#435e8a', surface: '#202a39', text: '#edf2fa' },
  radius: 10, opacity: 96,
}
export function themeVariables(theme: CustomTheme) {
  return {
    '--custom-light-accent': theme.light.accent, '--custom-light-surface': theme.light.surface, '--custom-light-text': theme.light.text,
    '--custom-dark-accent': theme.dark.accent, '--custom-dark-surface': theme.dark.surface, '--custom-dark-text': theme.dark.text,
    '--custom-radius': theme.radius + 'px', '--custom-opacity': theme.opacity + '%',
  }
}
export function applyCustomTheme(root: HTMLElement, theme?: CustomTheme | null) {
  const safe = sanitizeCustomTheme(theme)
  for (const [key, value] of Object.entries(themeVariables(safe ?? defaultCustomTheme))) {
    if (safe) root.style.setProperty(key, value)
    else root.style.removeProperty(key)
  }
  root.toggleAttribute('data-custom-theme', !!safe)
}
