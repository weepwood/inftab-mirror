import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canAccessBrowserBookmarks,
  getBrowserBookmarkTree,
  hasBrowserBookmarksPermission,
  requestBrowserBookmarksPermission,
  subscribeToBrowserBookmarkPermissionChanges,
  subscribeToBrowserBookmarks,
} from './browserBookmarks'

function event() {
  const listeners = new Set<(...args: unknown[]) => void>()
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.delete(listener)),
    fire: () => listeners.forEach((listener) => listener()),
    listeners,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('optional browser bookmark access', () => {
  it('does not expose bookmark APIs outside an installed extension', async () => {
    vi.stubGlobal('chrome', { bookmarks: { getTree: vi.fn() }, permissions: { contains: vi.fn() } })
    expect(canAccessBrowserBookmarks()).toBe(false)
    expect(await hasBrowserBookmarksPermission()).toBe(false)
    await expect(getBrowserBookmarkTree()).rejects.toThrow(/不可用/)
  })

  it('checks and requests only the optional bookmarks permission', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      bookmarks: { getTree: vi.fn().mockResolvedValue([]) },
      permissions: { contains, request },
    })

    expect(canAccessBrowserBookmarks()).toBe(true)
    expect(await hasBrowserBookmarksPermission()).toBe(false)
    expect(await requestBrowserBookmarksPermission()).toBe(true)
    expect(contains).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    expect(request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
  })

  it('subscribes to browser bookmark changes and removes every listener', () => {
    const onCreated = event()
    const onRemoved = event()
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, bookmarks: { getTree: vi.fn(), onCreated, onRemoved } })
    const listener = vi.fn()

    const unsubscribe = subscribeToBrowserBookmarks(listener)
    onCreated.fire()
    onRemoved.fire()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    expect(onCreated.listeners.size).toBe(0)
    expect(onRemoved.listeners.size).toBe(0)
  })

  it('subscribes to optional permission changes and cleans them up', () => {
    const onAdded = event()
    const onRemoved = event()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      bookmarks: { getTree: vi.fn() },
      permissions: { contains: vi.fn(), request: vi.fn(), onAdded, onRemoved },
    })
    const listener = vi.fn()
    const unsubscribe = subscribeToBrowserBookmarkPermissionChanges(listener)

    onRemoved.fire()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    expect(onAdded.listeners.size).toBe(0)
    expect(onRemoved.listeners.size).toBe(0)
  })
})
