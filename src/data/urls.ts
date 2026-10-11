export function normalizeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const input = value.trim()
  if (!input || input.length > 2048) return undefined
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input)
  const isHostWithPort = /^[^/?#]+:\d+(?:[/?#]|$)/.test(input)
  if (hasScheme && !/^https?:\/\//i.test(input) && !isHostWithPort) return undefined
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) return undefined
    return url.href
  } catch {
    return undefined
  }
}
