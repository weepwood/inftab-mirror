export function normalizeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const input = value.trim()
  if (!input || input.length > 2048) return undefined
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) return undefined
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) return undefined
    return url.href
  } catch {
    return undefined
  }
}
