import type { BrowserBookmarkNode } from '../types'

interface ChromeEvent {
  addListener(listener: (...args: unknown[]) => void): void
  removeListener(listener: (...args: unknown[]) => void): void
}

interface ChromeBookmarksApi {
  getTree(): Promise<BrowserBookmarkNode[]>
  onCreated?: ChromeEvent
  onChanged?: ChromeEvent
  onMoved?: ChromeEvent
  onRemoved?: ChromeEvent
  onChildrenReordered?: ChromeEvent
  onImportEnded?: ChromeEvent
}

interface ChromeExtensionApi {
  runtime?: { id?: string }
  bookmarks?: ChromeBookmarksApi
  permissions?: {
    contains(details: { permissions: string[] }): Promise<boolean>
    request(details: { permissions: string[] }): Promise<boolean>
  }
}

function extensionApi(): ChromeExtensionApi | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  return api?.runtime?.id ? api : undefined
}

export function canAccessBrowserBookmarks(): boolean {
  const api = extensionApi()
  return Boolean(api?.bookmarks && api.permissions)
}

export async function hasBrowserBookmarksPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api?.bookmarks || !api.permissions) return false
  return api.permissions.contains({ permissions: ['bookmarks'] })
}

export async function requestBrowserBookmarksPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api?.bookmarks || !api.permissions) return false
  return api.permissions.request({ permissions: ['bookmarks'] })
}

export async function getBrowserBookmarkTree(): Promise<BrowserBookmarkNode[]> {
  const api = extensionApi()
  if (!api?.bookmarks) throw new Error('浏览器书签功能当前不可用。')
  return api.bookmarks.getTree()
}

export function subscribeToBrowserBookmarks(listener: () => void): () => void {
  const bookmarks = extensionApi()?.bookmarks
  if (!bookmarks) return () => {}
  const handleChange = () => listener()
  const events = [
    bookmarks.onCreated,
    bookmarks.onChanged,
    bookmarks.onMoved,
    bookmarks.onRemoved,
    bookmarks.onChildrenReordered,
    bookmarks.onImportEnded,
  ].filter((event): event is ChromeEvent => Boolean(event))
  events.forEach((event) => event.addListener(handleChange))
  return () => events.forEach((event) => event.removeListener(handleChange))
}
