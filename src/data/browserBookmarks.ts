import { extensionApi, subscribeEvents, subscribePermissionChanges, type ChromeEvent } from './browserApiShared'
import type { BrowserBookmarkNode } from '../types'

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
    onAdded?: ChromeEvent
    onRemoved?: ChromeEvent
    contains(details: { permissions: string[] }): Promise<boolean>
    request(details: { permissions: string[] }): Promise<boolean>
  }
}

export function canAccessBrowserBookmarks(): boolean {
  const api = extensionApi<ChromeExtensionApi>()
  return Boolean(api?.bookmarks && api.permissions)
}

export async function hasBrowserBookmarksPermission(): Promise<boolean> {
  const api = extensionApi<ChromeExtensionApi>()
  if (!api?.bookmarks || !api.permissions) return false
  return api.permissions.contains({ permissions: ['bookmarks'] })
}

export async function requestBrowserBookmarksPermission(): Promise<boolean> {
  const api = extensionApi<ChromeExtensionApi>()
  if (!api?.bookmarks || !api.permissions) return false
  return api.permissions.request({ permissions: ['bookmarks'] })
}

export async function getBrowserBookmarkTree(): Promise<BrowserBookmarkNode[]> {
  const api = extensionApi<ChromeExtensionApi>()
  if (!api?.bookmarks) throw new Error('浏览器书签功能当前不可用。')
  return api.bookmarks.getTree()
}

export function subscribeToBrowserBookmarks(listener: () => void): () => void {
  const bookmarks = extensionApi<ChromeExtensionApi>()?.bookmarks
  if (!bookmarks) return () => {}
  const handleChange = () => listener()
  return subscribeEvents([
    bookmarks.onCreated,
    bookmarks.onChanged,
    bookmarks.onMoved,
    bookmarks.onRemoved,
    bookmarks.onChildrenReordered,
    bookmarks.onImportEnded,
  ], handleChange)
}

export function subscribeToBrowserBookmarkPermissionChanges(listener: () => void): () => void {
  return subscribePermissionChanges(extensionApi<ChromeExtensionApi>()?.permissions, 'bookmarks', listener)
}
