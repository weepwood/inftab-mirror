import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentWindowTabCandidates, getMostVisitedSiteCandidates } from './browserTabs'

afterEach(() => vi.unstubAllGlobals())

describe('browser tab candidates', () => {
  it('requests only the current window and filters non-web or unsafe tab URLs', async () => {
    const query = vi.fn().mockResolvedValue([
      { id: 1, title: 'Docs', url: 'https://docs.example/path' },
      { id: 2, title: 'Internal', url: 'chrome://extensions/' },
      { id: 3, title: 'Script', url: 'javascript:alert(1)' },
      { id: 4, title: 'Credentials', url: 'https://user:pass@private.example/' },
      { title: 'No ID', url: 'https://missing-id.example/' },
      { id: 6, title: '', url: 'http://fallback.example:80/path' },
      { id: 7, title: 'Extension', url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/index.html' },
    ])
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, tabs: { query } })

    await expect(getCurrentWindowTabCandidates()).resolves.toEqual([
      { id: '1', title: 'Docs', url: 'https://docs.example/path', hostname: 'docs.example' },
      { id: '6', title: 'fallback.example', url: 'http://fallback.example/path', hostname: 'fallback.example' },
    ])
    expect(query).toHaveBeenCalledWith({ currentWindow: true })
  })

  it('rejects when the extension tabs API is unavailable', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } })
    await expect(getCurrentWindowTabCandidates()).rejects.toThrow('浏览器标签页功能当前不可用。')
  })

  it('normalizes and deduplicates top sites while rejecting unsafe URLs', async () => {
    const get = vi.fn().mockResolvedValue([
      { title: 'Docs', url: 'https://docs.example/path' },
      { title: 'Duplicate after normalization', url: 'https://docs.example/path' },
      { title: '', url: 'http://fallback.example:80/path' },
      { title: 'Unsafe', url: 'javascript:alert(1)' },
      { title: 'Credentials', url: 'https://user:pass@private.example/' },
      { title: 'Internal', url: 'chrome://settings/' },
    ])
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, topSites: { get } })

    await expect(getMostVisitedSiteCandidates()).resolves.toEqual([
      { id: 'top-site-0', title: 'Docs', url: 'https://docs.example/path', hostname: 'docs.example' },
      { id: 'top-site-2', title: 'fallback.example', url: 'http://fallback.example/path', hostname: 'fallback.example' },
    ])
    expect(get).toHaveBeenCalledOnce()
  })

  it('keeps a Unicode character intact when a browser title reaches its limit', async () => {
    const title = `${'a'.repeat(499)}😀tail`
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      tabs: { query: vi.fn().mockResolvedValue([{ id: 1, title, url: 'https://example.com/' }]) },
    })

    const [candidate] = await getCurrentWindowTabCandidates()

    expect(candidate?.title).toBe(`${'a'.repeat(499)}😀`)
  })

  it('rejects when the extension top-sites API is unavailable', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } })
    await expect(getMostVisitedSiteCandidates()).rejects.toThrow('浏览器常用网站功能当前不可用。')
  })
})
