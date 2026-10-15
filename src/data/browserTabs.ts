import { truncateCodePoints } from './text'

export interface BrowserTabCandidate {
  id: string
  title: string
  url: string
  hostname: string
}

interface BrowserTab {
  id?: number
  title?: string
  url?: string
}

interface ChromeExtensionApi {
  runtime?: { id?: string }
  tabs?: { query(query: { currentWindow: boolean }): Promise<BrowserTab[]> }
  topSites?: { get(): Promise<Array<{ title?: string; url?: string }>> }
}

function extensionApi(): ChromeExtensionApi | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  return api?.runtime?.id ? api : undefined
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && Boolean(url.hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

function createCandidate(id: string, title: unknown, value: unknown): BrowserTabCandidate | undefined {
  if (!isWebUrl(value)) return undefined
  const url = new URL(value)
  return {
    id,
    title: truncateCodePoints(typeof title === 'string' && title.trim() ? title.trim() : url.hostname, 500),
    url: url.href,
    hostname: url.hostname,
  }
}

export async function getCurrentWindowTabCandidates(): Promise<BrowserTabCandidate[]> {
  const tabs = extensionApi()?.tabs
  if (!tabs) throw new Error('浏览器标签页功能当前不可用。')
  const result = await tabs.query({ currentWindow: true })
  return result.flatMap((tab) => {
    if (typeof tab.id !== 'number' || !Number.isInteger(tab.id) || !isWebUrl(tab.url)) return []
    const candidate = createCandidate(String(tab.id), tab.title, tab.url)
    return candidate ? [candidate] : []
  })
}

export async function getMostVisitedSiteCandidates(): Promise<BrowserTabCandidate[]> {
  const topSites = extensionApi()?.topSites
  if (!topSites) throw new Error('浏览器常用网站功能当前不可用。')
  const sites = await topSites.get()
  const seenUrls = new Set<string>()
  return sites.flatMap((site, index) => {
    const candidate = createCandidate(`top-site-${index}`, site.title, site.url)
    if (!candidate || seenUrls.has(candidate.url)) return []
    seenUrls.add(candidate.url)
    return [candidate]
  })
}
