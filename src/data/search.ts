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
  sogou: {
    html: 'https://www.sogou.com/sogou?query={query}',
    photos: 'https://pic.sogou.com/pics?query={query}',
    news: 'https://news.sogou.com/news?query={query}',
    videos: 'https://v.sogou.com/v?query={query}',
    map: 'https://map.sogou.com/#city=%E5%85%A8%E5%9B%BD&query={query}',
  },
  yahoo: {
    html: 'https://search.yahoo.com/search?p={query}',
    photos: 'https://images.search.yahoo.com/search/images?p={query}',
    news: 'https://news.search.yahoo.com/search?p={query}',
    videos: 'https://video.search.yahoo.com/search/video?p={query}',
    map: 'https://maps.yahoo.com/place/?q={query}',
  },
  '360': {
    html: 'https://www.so.com/s?q={query}',
    photos: 'https://image.so.com/i?q={query}',
    news: 'https://news.so.com/ns?q={query}',
    videos: 'https://video.so.com/v?q={query}',
    map: 'https://ditu.so.com/?k={query}',
  },
}

export function buildSearchUrl(engine: EngineId, mode: SearchMode, value: string): string {
  const query = value.trim()
  if (!query) return ''
  return templates[engine][mode].replace('{query}', encodeURIComponent(query))
}
