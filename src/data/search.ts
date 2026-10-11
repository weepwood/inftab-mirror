import type { EngineId, SearchMode } from '../types'

const templates: Record<EngineId, Record<SearchMode, string>> = {
  baidu: {
    html: 'https://www.baidu.com/s?wd={query}',
    photos: 'https://image.baidu.com/search/index?tn=baiduimage&word={query}',
    news: 'https://www.baidu.com/s?tn=news&word={query}',
    videos: 'https://haokan.baidu.com/web/search/page?query={query}',
    map: 'https://map.baidu.com/search/{query}',
  },
  google: {
    html: 'https://www.google.com/search?q={query}',
    photos: 'https://www.google.com/search?tbm=isch&q={query}',
    news: 'https://www.google.com/search?tbm=nws&q={query}',
    videos: 'https://www.google.com/search?tbm=vid&q={query}',
    map: 'https://www.google.com/maps/search/{query}',
  },
  bing: {
    html: 'https://www.bing.com/search?q={query}',
    photos: 'https://www.bing.com/images/search?q={query}',
    news: 'https://www.bing.com/news/search?q={query}',
    videos: 'https://www.bing.com/videos/search?q={query}',
    map: 'https://www.bing.com/maps?q={query}',
  },
  duckduckgo: {
    html: 'https://duckduckgo.com/?q={query}',
    photos: 'https://duckduckgo.com/?q={query}&iax=images&ia=images',
    news: 'https://duckduckgo.com/?q={query}&iar=news&ia=news',
    videos: 'https://duckduckgo.com/?q={query}&iax=videos&ia=videos',
    map: 'https://duckduckgo.com/?q={query}&iaxm=maps&ia=maps',
  },
}

export function buildSearchUrl(engine: EngineId, mode: SearchMode, value: string): string {
  const query = value.trim()
  if (!query) return ''
  return templates[engine][mode].replace('{query}', encodeURIComponent(query))
}
