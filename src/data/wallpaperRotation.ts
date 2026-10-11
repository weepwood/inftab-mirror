import { wallpaperChoices } from './defaults'
import type { WallpaperRotation } from '../types'

const rotationIntervals: Record<Exclude<WallpaperRotation, 'off'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

export function wallpaperRotationInterval(mode: WallpaperRotation): number | undefined {
  return mode === 'off' ? undefined : rotationIntervals[mode]
}

export function advanceWallpaperRotation(
  wallpaper: string,
  mode: WallpaperRotation,
  lastAt: number,
  now: number,
): { wallpaper: string; lastAt: number } | undefined {
  const interval = wallpaperRotationInterval(mode)
  const currentIndex = wallpaperChoices.findIndex((choice) => choice.value === wallpaper)
  if (interval === undefined || currentIndex < 0) return undefined
  if (!Number.isFinite(lastAt) || lastAt <= 0) return { wallpaper, lastAt: now }
  if (now < lastAt) return { wallpaper, lastAt }

  const elapsedRotations = Math.floor((now - lastAt) / interval)
  if (elapsedRotations < 1) return undefined
  const nextIndex = (currentIndex + elapsedRotations) % wallpaperChoices.length
  return {
    wallpaper: wallpaperChoices[nextIndex]!.value,
    lastAt: lastAt + elapsedRotations * interval,
  }
}

export function nextWallpaperRotationDelay(mode: WallpaperRotation, lastAt: number, now: number): number | undefined {
  const interval = wallpaperRotationInterval(mode)
  if (interval === undefined) return undefined
  if (!Number.isFinite(lastAt) || lastAt <= 0) return interval
  const elapsed = Math.max(0, now - lastAt)
  return interval - (elapsed % interval)
}
