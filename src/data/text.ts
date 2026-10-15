export function truncateCodePoints(value: string, maxCodePoints: number): string {
  const limit = Math.max(0, Math.floor(maxCodePoints))
  if (limit === Number.POSITIVE_INFINITY) return value
  if (!Number.isFinite(limit)) return ''

  const characters: string[] = []
  for (const character of value) {
    if (characters.length >= limit) break
    characters.push(character)
  }
  return characters.join('')
}

export function truncateCodeUnits(value: string, maxCodeUnits: number): string {
  const limit = Math.max(0, Math.floor(maxCodeUnits))
  if (limit === Number.POSITIVE_INFINITY || limit >= value.length) return value
  if (!Number.isFinite(limit)) return ''

  const end = Math.min(limit, value.length)
  const lastUnit = value.charCodeAt(end - 1)
  const endsWithHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff
  return value.slice(0, endsWithHighSurrogate ? end - 1 : end)
}
