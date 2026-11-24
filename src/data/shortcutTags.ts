import { truncateCodePoints } from './text'
export const maxShortcutTags = 12
export function sanitizeShortcutTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const tag = truncateCodePoints(item.normalize('NFKC').trim().replace(/\s+/gu, ' '), 24)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= maxShortcutTags) break
  }
  return tags
}
