import { normalizeWebUrl } from './urls'

export const hackerNewsHostPermission = 'https://hacker-news.firebaseio.com/*'

export interface HackerNewsStory {
  id: number
  title: string
  url: string
  source: string
  points: number
  comments: number
}

interface ChromePermissionsApi {
  contains(details: { origins: string[] }): Promise<boolean>
  request(details: { origins: string[] }): Promise<boolean>
}

interface ChromeNewsApi {
  runtime?: { id?: string }
  permissions?: ChromePermissionsApi
}

function extensionApi(): ChromeNewsApi | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeNewsApi }).chrome
  return api?.runtime?.id ? api : undefined
}

export async function hasHackerNewsPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api) return true
  return api.permissions?.contains({ origins: [hackerNewsHostPermission] }) ?? false
}

export async function requestHackerNewsPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api) return true
  return api.permissions?.request({ origins: [hackerNewsHostPermission] }) ?? false
}

function parseStory(value: unknown): HackerNewsStory | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0 || item.type !== 'story'
    || item.deleted === true || item.dead === true || typeof item.title !== 'string') return undefined
  const title = item.title.trim().slice(0, 240)
  if (!title) return undefined
  const articleUrl = normalizeWebUrl(item.url)
  const discussionUrl = `https://news.ycombinator.com/item?id=${item.id}`
  const url = articleUrl ?? discussionUrl
  const source = articleUrl ? new URL(articleUrl).hostname : 'Hacker News'
  return {
    id: item.id as number,
    title,
    url,
    source,
    points: typeof item.score === 'number' && Number.isFinite(item.score) ? Math.max(0, Math.floor(item.score)) : 0,
    comments: typeof item.descendants === 'number' && Number.isFinite(item.descendants) ? Math.max(0, Math.floor(item.descendants)) : 0,
  }
}

async function getJson(url: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('资讯服务暂时不可用，请检查网络后重试。')
  return response.json()
}

export async function fetchHackerNewsStories(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<HackerNewsStory[]> {
  const idsPayload = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json', signal, fetcher)
  if (!Array.isArray(idsPayload)) throw new Error('资讯数据格式无法识别，请稍后重试。')
  const ids = [...new Set(idsPayload.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 5)
  const results = await Promise.allSettled(ids.map(async (id) => {
    const payload = await getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, signal, fetcher)
    return parseStory(payload)
  }))
  const stories = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : [])
  if (ids.length && !stories.length) throw new Error('资讯暂时无法加载，请稍后重试。')
  return stories
}
