import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasWeatherPermission, requestWeatherPermission, weatherHostPermissions } from './weatherPermissions'

afterEach(() => vi.unstubAllGlobals())

describe('optional weather host permission', () => {
  it('keeps the website usable without extension permission APIs', async () => {
    await expect(hasWeatherPermission()).resolves.toBe(true)
    await expect(requestWeatherPermission()).resolves.toBe(true)
  })

  it('checks the exact weather API origins in the extension', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { contains } })

    await expect(hasWeatherPermission()).resolves.toBe(false)
    expect(contains).toHaveBeenCalledWith({ origins: [...weatherHostPermissions] })
  })

  it('requests only the exact weather API origins after user action', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' }, permissions: { request } })

    await expect(requestWeatherPermission()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: [...weatherHostPermissions] })
  })

  it('does not assume extension access when the permissions API is unavailable', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } })
    await expect(hasWeatherPermission()).resolves.toBe(false)
    await expect(requestWeatherPermission()).resolves.toBe(false)
  })
})
