import { encodeQuery } from './search'

export function buildTranslationUrl(value: string): string {
  if (typeof value !== 'string') return ''
  const query = value.trim()
  if (!query) return ''
  return `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeQuery(query)}&op=translate`
}
