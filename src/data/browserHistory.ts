interface ChromeEvent {
  addListener(listener: (...args: unknown[]) => void): void
  removeListener(listener: (...args: unknown[]) => void): void
}

export interface BrowserHistoryEntry {
  id: string
  url: string
  title: string
  lastVisitTime: number
  visitCount: number
}

interface ChromeHistoryApi {
  search(query: { text: string; startTime: number; maxResults: number }): Promise<BrowserHistoryEntry[]>
  onVisited?: ChromeEvent
  onVisitRemoved?: ChromeEvent
}

interface ChromeExtensionApi {
  runtime?: { id?: string }
  history?: ChromeHistoryApi
  permissions?: {
    onAdded?: ChromeEvent
    onRemoved?: ChromeEvent
    contains(details: { permissions: string[] }): Promise<boolean>
    request(details: { permissions: string[] }): Promise<boolean>
  }
}

const historyPermission = 'history'
const maxHistoryResults = 100

function extensionApi(): ChromeExtensionApi | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  return api?.runtime?.id ? api : undefined
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function canAccessBrowserHistory(): boolean {
  const api = extensionApi()
  return Boolean(api?.history && api.permissions)
}

export async function hasBrowserHistoryPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api?.history || !api.permissions) return false
  return api.permissions.contains({ permissions: [historyPermission] })
}

export async function requestBrowserHistoryPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api?.history || !api.permissions) return false
  return api.permissions.request({ permissions: [historyPermission] })
}

export async function searchBrowserHistory(text = '', maxResults = maxHistoryResults): Promise<BrowserHistoryEntry[]> {
  const history = extensionApi()?.history
  if (!history) throw new Error('浏览历史功能当前不可用。')
  const results = await history.search({
    text: text.trim().slice(0, 200),
    startTime: 0,
    maxResults: Math.min(maxHistoryResults, Math.max(1, Math.floor(maxResults))),
  })
  return results.filter((entry) => isWebUrl(entry.url)
    && typeof entry.id === 'string'
    && typeof entry.lastVisitTime === 'number'
    && Number.isFinite(new Date(entry.lastVisitTime).getTime()))
    .map((entry) => ({
      id: entry.id,
      url: entry.url,
      title: typeof entry.title === 'string' ? entry.title.slice(0, 500) : '',
      lastVisitTime: entry.lastVisitTime,
      visitCount: Number.isFinite(entry.visitCount) ? Math.max(0, entry.visitCount) : 0,
    }))
}

export function subscribeToBrowserHistory(listener: () => void): () => void {
  const history = extensionApi()?.history
  if (!history) return () => {}
  const handleChange = () => listener()
  const events = [history.onVisited, history.onVisitRemoved].filter((event): event is ChromeEvent => Boolean(event))
  events.forEach((event) => event.addListener(handleChange))
  return () => events.forEach((event) => event.removeListener(handleChange))
}

export function subscribeToBrowserHistoryPermissionChanges(listener: () => void): () => void {
  const permissions = extensionApi()?.permissions
  if (!permissions) return () => {}
  const events = [permissions.onAdded, permissions.onRemoved].filter((event): event is ChromeEvent => Boolean(event))
  events.forEach((event) => event.addListener(listener))
  return () => events.forEach((event) => event.removeListener(listener))
}
