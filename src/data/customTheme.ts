import type { CustomTheme, ThemeColors, ThemePreset } from '../types'
import { isRecord } from './validation'

const color = (value: unknown): string | undefined => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
function luminance(value: string) {
  const rgb = Number.parseInt(value.slice(1), 16)
  const channel = (shift: number) => {
    const v = ((rgb >> shift) & 255) / 255
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
  }
  return channel(16) * .2126 + channel(8) * .7152 + channel(0) * .0722
}
export function contrastRatio(a: string, b: string) {
  const first = luminance(a) + .05, second = luminance(b) + .05
  return Math.max(first / second, second / first)
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
/** Only called with normalized preferences from the workspace store. */
export function applyCustomTheme(root: HTMLElement, theme?: CustomTheme | null) {
  const safe = theme
  const update = (key: string, value?: string) => value === undefined
    ? root.style.removeProperty('--custom-' + key)
    : root.style.setProperty('--custom-' + key, value)
  for (const mode of ['light','dark'] as const) {
    for (const field of ['accent','surface','text'] as const) update(mode + '-' + field, safe?.[mode][field])
  }
  update('radius', safe ? safe.radius + 'px' : undefined)
  update('opacity', safe ? safe.opacity + '%' : undefined)
  root.toggleAttribute('data-custom-theme', !!safe)
}

export const maxThemePresets = 20
export function sanitizeThemePresets(value: unknown): ThemePreset[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>(), names = new Set<string>()
  const result: ThemePreset[] = []
  for (const entry of value.slice(0, maxThemePresets)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(entry.id) || typeof entry.name !== 'string') continue
    const name = entry.name.normalize('NFKC').trim()
    const key = name.toLowerCase()
    const theme = sanitizeCustomTheme(entry.theme)
    if (!name || Array.from(name).length > 40 || ids.has(entry.id) || names.has(key) || !theme) continue
    ids.add(entry.id); names.add(key)
    result.push({ id: entry.id, name, theme })
  }
  return result
}
