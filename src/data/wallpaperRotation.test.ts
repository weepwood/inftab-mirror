import { describe, expect, it } from 'vitest'
import { wallpaperChoices } from './defaults'
import { advanceWallpaperRotation, nextWallpaperRotationDelay } from './wallpaperRotation'

describe('wallpaper rotation', () => {
  it('waits for the selected interval before advancing', () => {
    const now = 1_800_000_000_000
    const result = advanceWallpaperRotation(wallpaperChoices[0]!.value, 'hourly', now, now + 59 * 60 * 1000)

    expect(result).toBeUndefined()
    expect(nextWallpaperRotationDelay('hourly', now, now + 59 * 60 * 1000)).toBe(60 * 1000)
  })

  it('skips missed intervals without losing the rotation cadence', () => {
    const now = 1_800_000_000_000
    const result = advanceWallpaperRotation(wallpaperChoices[0]!.value, 'daily', now, now + 3 * 24 * 60 * 60 * 1000 + 500)

    expect(result).toEqual({ wallpaper: wallpaperChoices[3]!.value, lastAt: now + 3 * 24 * 60 * 60 * 1000 })
  })

  it('does not rotate custom wallpapers or when the feature is off', () => {
    expect(advanceWallpaperRotation('https://example.com/wallpaper.jpg', 'daily', 1_800_000_000_000, 2_000_000_000_000)).toBeUndefined()
    expect(advanceWallpaperRotation(wallpaperChoices[0]!.value, 'off', 1_800_000_000_000, 2_000_000_000_000)).toBeUndefined()
    expect(nextWallpaperRotationDelay('off', 1_800_000_000_000, 2_000_000_000_000)).toBeUndefined()
  })

  it('does not rotate early after the system clock moves backwards', () => {
    const result = advanceWallpaperRotation(wallpaperChoices[0]!.value, 'hourly', 1_800_000_000_000, 1_799_999_000_000)
    expect(result).toEqual({ wallpaper: wallpaperChoices[0]!.value, lastAt: 1_800_000_000_000 })
  })
})
