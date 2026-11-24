import { extensionApi, subscribeEvents, subscribePermissionChanges, type ChromeEvent, isWebUrl } from './browserApiShared'
import { truncateCodePoints } from './text'

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

export function canAccessBrowserHistory(): boolean {
  const api = extensionApi<ChromeExtensionApi>()
  return Boolean(api?.history && api.permissions)
}

export async function hasBrowserHistoryPermission(): Promise<boolean> {
  const api = extensionApi<ChromeExtensionApi>()
  if (!api?.history || !api.permissions) return false
  return api.permissions.contains({ permissions: [historyPermission] })
}

export async function requestBrowserHistoryPermission(): Promise<boolean> {
  const api = extensionApi<ChromeExtensionApi>()
  if (!api?.history || !api.permissions) return false
  return api.permissions.request({ permissions: [historyPermission] })
}

export async function searchBrowserHistory(text = '', maxResults = maxHistoryResults): Promise<BrowserHistoryEntry[]> {
  const history = extensionApi<ChromeExtensionApi>()?.history
  if (!history) throw new Error('浏览历史功能当前不可用。')
  const requestedLimit = Number.isFinite(maxResults) ? Math.floor(maxResults) : maxHistoryResults
  const results = await history.search({
    text: truncateCodePoints(text.trim(), 200),
    startTime: 0,
    maxResults: Math.min(maxHistoryResults, Math.max(1, requestedLimit)),
  })
  return results.filter((entry) => isWebUrl(entry.url)
    && typeof entry.id === 'string'
    && typeof entry.lastVisitTime === 'number'
    && Number.isFinite(new Date(entry.lastVisitTime).getTime()))
    .map((entry) => ({
      id: entry.id,
      url: entry.url,
      title: typeof entry.title === 'string' ? truncateCodePoints(entry.title, 500) : '',
      lastVisitTime: entry.lastVisitTime,
      visitCount: Number.isFinite(entry.visitCount) ? Math.max(0, entry.visitCount) : 0,
    }))
}

export function subscribeToBrowserHistory(listener: () => void): () => void {
  const history = extensionApi<ChromeExtensionApi>()?.history
  if (!history) return () => {}
  const handleChange = () => listener()
  return subscribeEvents([history.onVisited, history.onVisitRemoved], handleChange)
}

export function subscribeToBrowserHistoryPermissionChanges(listener: () => void): () => void {
  return subscribePermissionChanges(extensionApi<ChromeExtensionApi>()?.permissions, historyPermission, listener)
}
