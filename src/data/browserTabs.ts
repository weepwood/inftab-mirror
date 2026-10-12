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

export async function getCurrentWindowTabCandidates(): Promise<BrowserTabCandidate[]> {
  const tabs = extensionApi()?.tabs
  if (!tabs) throw new Error('浏览器标签页功能当前不可用。')
  const result = await tabs.query({ currentWindow: true })
  return result.flatMap((tab) => {
    if (typeof tab.id !== 'number' || !Number.isInteger(tab.id) || !isWebUrl(tab.url)) return []
    const url = new URL(tab.url)
    return [{
      id: String(tab.id),
      title: (typeof tab.title === 'string' && tab.title.trim() ? tab.title.trim() : url.hostname).slice(0, 500),
      url: url.href,
      hostname: url.hostname,
    }]
  })
}
