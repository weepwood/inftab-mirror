import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchHackerNewsStories, hasHackerNewsPermission, hackerNewsCacheKey, hackerNewsHostPermission, readCachedHackerNewsFeed, requestHackerNewsPermission, subscribeToHackerNewsPermissionChanges, writeCachedHackerNewsFeed } from './hackerNews'

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(value: unknown, ok = true): Response {
  return { ok, json: async () => value } as Response
}

describe('Hacker News feed', () => {
  it('keeps Unicode intact at the story title limit', async () => {
    const title = `${'x'.repeat(239)}😀tail`
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/topstories.json')) return jsonResponse([99])
      return jsonResponse({ id: 99, type: 'story', title, url: 'https://example.com/story' })
    })

    await expect(fetchHackerNewsStories(new AbortController().signal, fetcher)).resolves.toEqual([
      { id: 99, title: `${'x'.repeat(239)}😀`, url: 'https://example.com/story', source: 'example.com', points: 0, comments: 0 },
    ])
  })

  it('loads a small ranked feed and labels each story with its source', async () => {
    const requestOptions: RequestInit[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      if (options) requestOptions.push(options)
      const url = String(input)
      if (url.endsWith('/topstories.json')) return jsonResponse([11, 12, 12, 13])
      if (url.endsWith('/11.json')) return jsonResponse({ id: 11, type: 'story', title: '  First story ', url: 'https://news.example/article', score: 32, descendants: 8 })
      if (url.endsWith('/12.json')) return jsonResponse({ id: 12, type: 'story', title: 'Ask HN without an article URL', score: 4 })
      return jsonResponse({ id: 13, type: 'job', title: 'Skip non-story items' })
    })

    await expect(fetchHackerNewsStories(new AbortController().signal, fetcher)).resolves.toEqual([
      { id: 11, title: 'First story', url: 'https://news.example/article', source: 'news.example', points: 32, comments: 8 },
      { id: 12, title: 'Ask HN without an article URL', url: 'https://news.ycombinator.com/item?id=12', source: 'Hacker News', points: 4, comments: 0 },
    ])
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(requestOptions.every((options) => options.credentials === 'omit' && options.referrerPolicy === 'no-referrer')).toBe(true)
  })

  it('rejects unsafe article URLs and skips deleted or malformed stories', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/topstories.json')) return jsonResponse([21, 22, 23])
      if (url.endsWith('/21.json')) return jsonResponse({ id: 21, type: 'story', title: 'Unsafe URL', url: 'javascript:alert(1)' })
      if (url.endsWith('/22.json')) return jsonResponse({ id: 22, type: 'story', title: 'Deleted', deleted: true })
      return jsonResponse(null)
    })

    await expect(fetchHackerNewsStories(new AbortController().signal, fetcher)).resolves.toEqual([
      { id: 21, title: 'Unsafe URL', url: 'https://news.ycombinator.com/item?id=21', source: 'Hacker News', points: 0, comments: 0 },
    ])
  })

  it('fails clearly when the feed endpoint is unavailable or malformed', async () => {
    await expect(fetchHackerNewsStories(new AbortController().signal, vi.fn().mockResolvedValue(jsonResponse({}, false))))
      .rejects.toThrow('资讯服务暂时不可用')
    await expect(fetchHackerNewsStories(new AbortController().signal, vi.fn().mockResolvedValue(jsonResponse(null))))
      .rejects.toThrow('资讯数据格式无法识别')
    await expect(fetchHackerNewsStories(new AbortController().signal, vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))))
      .rejects.toThrow('资讯网络请求失败')
    await expect(fetchHackerNewsStories(new AbortController().signal, vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as Response))).rejects.toThrow('资讯数据无法解析')
  })

  it('rejects a partially fulfilled feed when the request is aborted', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/topstories.json')) return Promise.resolve(jsonResponse([31, 32]))
      if (url.endsWith('/31.json')) return Promise.resolve(jsonResponse({ id: 31, type: 'story', title: 'Partial story' }))
      return new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })

    const pendingFeed = fetchHackerNewsStories(controller.signal, fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    controller.abort()

    await expect(pendingFeed).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('requests extension host access only through an explicit permission call', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'a'.repeat(32) }, permissions: { contains, request } })

    await expect(hasHackerNewsPermission()).resolves.toBe(false)
    expect(contains).toHaveBeenCalledWith({ origins: [hackerNewsHostPermission] })
    expect(request).not.toHaveBeenCalled()
    await expect(requestHackerNewsPermission()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: [hackerNewsHostPermission] })
  })

  it('subscribes only to changes for the Hacker News host and cleans up listeners', () => {
    const createEvent = () => {
      const listeners = new Set<(details: { origins?: string[] }) => void>()
      return {
        addListener: vi.fn((listener: (details: { origins?: string[] }) => void) => listeners.add(listener)),
        removeListener: vi.fn((listener: (details: { origins?: string[] }) => void) => listeners.delete(listener)),
        fire: (origins: string[]) => listeners.forEach((listener) => listener({ origins })),
      }
    }
    const onAdded = createEvent()
    const onRemoved = createEvent()
    vi.stubGlobal('chrome', { runtime: { id: 'a'.repeat(32) }, permissions: { onAdded, onRemoved } })
    const listener = vi.fn()

    const unsubscribe = subscribeToHackerNewsPermissionChanges(listener)
    onAdded.fire(['https://unrelated.example/*'])
    expect(listener).not.toHaveBeenCalled()
    onAdded.fire([hackerNewsHostPermission])
    onRemoved.fire([hackerNewsHostPermission])
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    expect(onAdded.removeListener).toHaveBeenCalledOnce()
    expect(onRemoved.removeListener).toHaveBeenCalledOnce()
  })

  it('does not require extension permission on the website', async () => {
    vi.stubGlobal('chrome', undefined)

    await expect(hasHackerNewsPermission()).resolves.toBe(true)
    await expect(requestHackerNewsPermission()).resolves.toBe(true)
  })

  it('stores and safely validates a small offline cache', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const stories = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      title: `Story ${index + 1}`,
      url: index === 0 ? 'javascript:alert(1)' : `https://example-${index}.org/story`,
      source: 'untrusted.example',
      points: 12,
      comments: 4,
    }))

    expect(writeCachedHackerNewsFeed(stories, 1_800_000_000_000, storage)).toBe(true)
    expect(readCachedHackerNewsFeed(storage)).toEqual({
      updatedAt: 1_800_000_000_000,
      stories: stories.slice(1, 5).map((story) => ({ ...story, source: new URL(story.url).hostname })),
    })
    values.set(hackerNewsCacheKey, '{broken')
    expect(readCachedHackerNewsFeed(storage)).toBeUndefined()
    expect(writeCachedHackerNewsFeed(stories, Date.now(), { setItem: () => { throw new Error('quota') } })).toBe(false)
  })
})
