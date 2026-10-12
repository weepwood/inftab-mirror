import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestBrowserTabsPermission, requestMostVisitedSitesPermission } from './browserTabPermissions'

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
})
