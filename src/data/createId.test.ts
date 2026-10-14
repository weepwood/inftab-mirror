import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalId } from './createId'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('local record IDs', () => {
  it('uses the native UUID generator when available', () => {
    const randomUUID = vi.fn(() => 'native-uuid')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })

    expect(createLocalId()).toBe('native-uuid')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('creates a version-four UUID with secure random bytes when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0)
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    expect(createLocalId()).toBe('00000000-0000-4000-8000-000000000000')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })

  it('still creates a well-formed UUID when the Web Crypto API is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(createLocalId()).toBe('00000000-0000-4000-8000-000000000000')
  })
})
