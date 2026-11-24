import { expect, it } from 'vitest'
import { particleCanvasSize } from './useShortcutParticles'

it('keeps normal resolution and caps large high-DPI animation surfaces', () => {
  expect(particleCanvasSize(800, 600, 1)).toEqual({ width: 800, height: 600 })
  expect(particleCanvasSize(390, 844, 3)).toEqual({ width: 780, height: 1688 })
  const large = particleCanvasSize(3840, 2160, 2)
  expect(large.width * large.height).toBeLessThanOrEqual(4 * 1024 * 1024)
  expect(large.width / large.height).toBeCloseTo(3840 / 2160, 2)
  expect(particleCanvasSize(0, 0, 1)).toEqual({ width: 1, height: 1 })
})
