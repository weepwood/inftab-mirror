import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasMostVisitedSitesPermission, requestBrowserTabsPermission, requestMostVisitedSitesPermission, subscribeToMostVisitedSitesPermissionChanges } from './browserTabPermissions'

afterEach(() => vi.unstubAllGlobals())

describe('browser tabs permission', () => {
  it('requests only the optional tabs permission from an extension', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { request } })

    await expect(requestBrowserTabsPermission()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ permissions: ['tabs'] })
  })

  it('does not request browser permissions from the website', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(requestBrowserTabsPermission()).resolves.toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('requests the topSites permission only when the feature is explicitly selected', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { request } })

    await expect(requestMostVisitedSitesPermission()).resolves.toBe(true)
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith({ permissions: ['topSites'] })
  })

  it('checks topSites access without requesting it from the website', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { contains } })

    await expect(hasMostVisitedSitesPermission()).resolves.toBe(true)
    expect(contains).toHaveBeenCalledWith({ permissions: ['topSites'] })

    vi.stubGlobal('chrome', { permissions: { contains } })
    await expect(hasMostVisitedSitesPermission()).resolves.toBe(false)
    expect(contains).toHaveBeenCalledOnce()
  })

  it('notifies topSites permission changes and ignores unrelated grants', () => {
    const createEvent = () => {
      const listeners = new Set<(details: unknown) => void>()
      return {
        addListener: (listener: (details: unknown) => void) => listeners.add(listener),
        removeListener: (listener: (details: unknown) => void) => listeners.delete(listener),
        fire: (details: unknown) => listeners.forEach((notify) => notify(details)),
      }
    }
    const onAdded = createEvent()
    const onRemoved = createEvent()
    const listener = vi.fn()
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { onAdded, onRemoved } })
    const stop = subscribeToMostVisitedSitesPermissionChanges(listener)

    onAdded.fire({ permissions: ['tabs'] })
    expect(listener).not.toHaveBeenCalled()
    onAdded.fire({ permissions: ['topSites'] })
    onRemoved.fire({ permissions: ['topSites'] })
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    onAdded.fire({ permissions: ['topSites'] })
    onRemoved.fire({ permissions: ['topSites'] })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
