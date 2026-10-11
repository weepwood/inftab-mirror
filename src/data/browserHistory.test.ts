import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canAccessBrowserHistory,
  hasBrowserHistoryPermission,
  requestBrowserHistoryPermission,
  searchBrowserHistory,
  subscribeToBrowserHistory,
  subscribeToBrowserHistoryPermissionChanges,
} from './browserHistory'

function event() {
  const listeners = new Set<(...args: unknown[]) => void>()
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.delete(listener)),
    fire: () => listeners.forEach((listener) => listener()),
    listeners,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('optional browser history access', () => {
  it('does not expose browser history outside an installed extension', async () => {
    vi.stubGlobal('chrome', { history: { search: vi.fn() }, permissions: { contains: vi.fn() } })

    expect(canAccessBrowserHistory()).toBe(false)
    expect(await hasBrowserHistoryPermission()).toBe(false)
    await expect(searchBrowserHistory()).rejects.toThrow(/不可用/)
  })

  it('requests only the optional history permission', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      history: { search: vi.fn().mockResolvedValue([]) },
      permissions: { contains, request },
    })

    expect(canAccessBrowserHistory()).toBe(true)
    expect(await hasBrowserHistoryPermission()).toBe(false)
    expect(await requestBrowserHistoryPermission()).toBe(true)
    expect(contains).toHaveBeenCalledWith({ permissions: ['history'] })
    expect(request).toHaveBeenCalledWith({ permissions: ['history'] })
  })

  it('bounds searches and filters non-web or malformed history entries', async () => {
    const search = vi.fn().mockResolvedValue([
      { id: 'web', url: 'https://example.com/path', title: 'Example', lastVisitTime: 1_700_000_000_000, visitCount: 3 },
      { id: 'settings', url: 'chrome://settings/', title: 'Settings', lastVisitTime: 1_700_000_000_000, visitCount: 1 },
      { id: 'missing-time', url: 'https://invalid.example/', title: 'Invalid', lastVisitTime: Number.NaN, visitCount: 1 },
      { id: 'out-of-range-time', url: 'https://invalid-time.example/', title: 'Invalid', lastVisitTime: 1e300, visitCount: 1 },
    ])
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, history: { search } })

    const results = await searchBrowserHistory('  example  ', 500)

    expect(search).toHaveBeenCalledWith({ text: 'example', startTime: 0, maxResults: 100 })
    expect(results).toEqual([{ id: 'web', url: 'https://example.com/path', title: 'Example', lastVisitTime: 1_700_000_000_000, visitCount: 3 }])
  })

  it('subscribes to history and permission changes and cleans up listeners', () => {
    const onVisited = event()
    const onVisitRemoved = event()
    const onAdded = event()
    const onRemoved = event()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      history: { search: vi.fn(), onVisited, onVisitRemoved },
      permissions: { contains: vi.fn(), request: vi.fn(), onAdded, onRemoved },
    })
    const historyListener = vi.fn()
    const permissionListener = vi.fn()
    const unsubscribeHistory = subscribeToBrowserHistory(historyListener)
    const unsubscribePermission = subscribeToBrowserHistoryPermissionChanges(permissionListener)

    onVisited.fire()
    onVisitRemoved.fire()
    onRemoved.fire()
    expect(historyListener).toHaveBeenCalledTimes(2)
    expect(permissionListener).toHaveBeenCalledOnce()

    unsubscribeHistory()
    unsubscribePermission()
    expect(onVisited.listeners.size).toBe(0)
    expect(onVisitRemoved.listeners.size).toBe(0)
    expect(onAdded.listeners.size).toBe(0)
    expect(onRemoved.listeners.size).toBe(0)
  })
})
