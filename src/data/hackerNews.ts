import { normalizeWebUrl } from './urls'

export const hackerNewsHostPermission = 'https://hacker-news.firebaseio.com/*'
export const hackerNewsCacheKey = 'inftab.hacker-news-cache.v1'

export interface HackerNewsStory {
  id: number
  title: string
  url: string
  source: string
  points: number
  comments: number
}

export interface HackerNewsFeedCache {
  stories: HackerNewsStory[]
  updatedAt: number
}

interface ChromePermissionsApi {
  contains(details: { origins: string[] }): Promise<boolean>
  request(details: { origins: string[] }): Promise<boolean>
  onAdded?: ChromePermissionsEvent
  onRemoved?: ChromePermissionsEvent
}

interface ChromePermissionsEvent {
  addListener(listener: (details: { origins?: string[] }) => void): void
  removeListener(listener: (details: { origins?: string[] }) => void): void
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

export function subscribeToHackerNewsPermissionChanges(listener: () => void): () => void {
  const permissions = extensionApi()?.permissions
  if (!permissions) return () => {}
  const handleChange = (details: { origins?: string[] }) => {
    if (details.origins?.includes(hackerNewsHostPermission)) listener()
  }
  const events = [permissions.onAdded, permissions.onRemoved].filter((event): event is ChromePermissionsEvent => Boolean(event))
  events.forEach((event) => event.addListener(handleChange))
  return () => events.forEach((event) => event.removeListener(handleChange))
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

function parseCachedStory(value: unknown): HackerNewsStory | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0 || typeof item.title !== 'string') return undefined
  const title = item.title.trim().slice(0, 240)
  const url = normalizeWebUrl(item.url)
  if (!title || !url) return undefined
  const host = new URL(url).hostname
  return {
    id: item.id as number,
    title,
    url,
    source: host === 'news.ycombinator.com' ? 'Hacker News' : host,
    points: typeof item.points === 'number' && Number.isFinite(item.points) ? Math.max(0, Math.floor(item.points)) : 0,
    comments: typeof item.comments === 'number' && Number.isFinite(item.comments) ? Math.max(0, Math.floor(item.comments)) : 0,
  }
}

export function readCachedHackerNewsFeed(storage: Pick<Storage, 'getItem'> = localStorage): HackerNewsFeedCache | undefined {
  try {
    const raw = storage.getItem(hackerNewsCacheKey)
    if (!raw) return undefined
    const cache: unknown = JSON.parse(raw)
    if (typeof cache !== 'object' || cache === null || Array.isArray(cache)) return undefined
    const value = cache as Record<string, unknown>
    if (value.version !== 1 || !Number.isSafeInteger(value.updatedAt) || (value.updatedAt as number) <= 0 || !Array.isArray(value.stories)) return undefined
    const stories = value.stories.slice(0, 5).flatMap((story) => {
      const parsed = parseCachedStory(story)
      return parsed ? [parsed] : []
    })
    const uniqueStories = [...new Map(stories.map((story) => [story.id, story])).values()]
    return { stories: uniqueStories, updatedAt: value.updatedAt as number }
  } catch {
    return undefined
  }
}

export function writeCachedHackerNewsFeed(
  stories: HackerNewsStory[],
  updatedAt = Date.now(),
  storage: Pick<Storage, 'setItem'> = localStorage,
): boolean {
  try {
    const safeStories = stories.slice(0, 5).flatMap((story) => {
      const parsed = parseCachedStory(story)
      return parsed ? [parsed] : []
    })
    storage.setItem(hackerNewsCacheKey, JSON.stringify({ version: 1, stories: safeStories, updatedAt }))
    return true
  } catch {
    return false
  }
}

async function getJson(url: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('资讯网络请求失败，请检查网络后重试。')
  }
  if (!response.ok) throw new Error('资讯服务暂时不可用，请检查网络后重试。')
  try {
    return await response.json()
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('资讯数据无法解析，请稍后重试。')
  }
}

export async function fetchHackerNewsStories(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<HackerNewsStory[]> {
  const idsPayload = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json', signal, fetcher)
  if (!Array.isArray(idsPayload)) throw new Error('资讯数据格式无法识别，请稍后重试。')
  const ids = [...new Set(idsPayload.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 5)
  const results = await Promise.allSettled(ids.map(async (id) => {
    const payload = await getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, signal, fetcher)
    return parseStory(payload)
  }))
  if (signal.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  const stories = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : [])
  if (ids.length && !stories.length) throw new Error('资讯暂时无法加载，请稍后重试。')
  return stories
}
