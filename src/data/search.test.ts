import { describe, expect, it } from 'vitest'
import { buildSearchUrl, isValidCustomSearchTemplate } from './search'
import type { CustomSearchEngine, EngineId, SearchMode } from '../types'

const engines: EngineId[] = ['baidu', 'google', 'bing', 'duckduckgo', 'sogou', 'yahoo', '360']
const modes: SearchMode[] = ['html', 'photos', 'news', 'videos', 'map']

describe('search URL generation', () => {
  it.each(engines.flatMap((engine) => modes.map((mode) => [engine, mode] as const)))(
    'builds a secure %s %s search URL',
    (engine, mode) => {
      const url = buildSearchUrl(engine, mode, '  Cats & Dogs / café  ')

      expect(url.startsWith('https://')).toBe(true)
      expect(url).toContain('Cats%20%26%20Dogs%20%2F%20caf%C3%A9')
    },
  )

  it('does not navigate for an empty or whitespace-only query', () => {
    expect(buildSearchUrl('google', 'html', '')).toBe('')
    expect(buildSearchUrl('google', 'html', '   ')).toBe('')
  })

  it('routes representative categories to the selected provider', () => {
    expect(buildSearchUrl('google', 'photos', 'cats')).toBe('https://www.google.com/search?tbm=isch&q=cats')
    expect(buildSearchUrl('bing', 'news', 'weather')).toBe('https://www.bing.com/news/search?q=weather')
    expect(buildSearchUrl('baidu', 'map', '上海')).toBe('https://map.baidu.com/search/%E4%B8%8A%E6%B5%B7')
  })

  it('encodes custom search queries and replaces every placeholder', () => {
    const customEngines: CustomSearchEngine[] = [
      { id: 'wiki', name: 'Wiki', template: 'https://example.com/search?q={query}&copy={query}' },
    ]
    expect(buildSearchUrl('custom:wiki', 'html', 'Café & Tea', customEngines))
      .toBe('https://example.com/search?q=Caf%C3%A9%20%26%20Tea&copy=Caf%C3%A9%20%26%20Tea')
  })

  it('rejects unknown custom engines and invalid custom templates', () => {
    expect(buildSearchUrl('custom:missing', 'html', 'query')).toBe('')
    expect(buildSearchUrl('custom:unsafe', 'html', 'query', [
      { id: 'unsafe', name: 'Unsafe', template: 'javascript:alert({query})' },
    ])).toBe('')
    expect(isValidCustomSearchTemplate('http://example.com/?q={query}')).toBe(false)
    expect(isValidCustomSearchTemplate('https://example.com/')).toBe(false)
    expect(isValidCustomSearchTemplate('https://{query}.example.com/search')).toBe(false)
  })
})
