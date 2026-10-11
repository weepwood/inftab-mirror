// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImageBlob, fitImageDimensions, maxImagePixels, maxImageUploadBytes } from './images'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('local image compression', () => {
  it('resizes without enlarging small images and preserves aspect ratio', () => {
    expect(fitImageDimensions(4000, 2000, 1920)).toEqual({ width: 1920, height: 960 })
    expect(fitImageDimensions(128, 64, 192)).toEqual({ width: 128, height: 64 })
    expect(() => fitImageDimensions(0, 64, 192)).toThrow(/尺寸无效/)
  })

  it('compresses upload data to WebP and closes the decoded bitmap', async () => {
    const bitmap = { width: 4000, height: 2000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['webp'], { type: 'image/webp' })))

    const dataUrl = await compressImageBlob(new Blob(['source'], { type: 'image/png' }), 1920)

    expect(dataUrl).toMatch(/^data:image\/webp;base64,/)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1920, 960)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('rejects unsupported types, oversized files, and excessive pixel dimensions', async () => {
    await expect(compressImageBlob(new Blob(['svg'], { type: 'image/svg+xml' }), 1920)).rejects.toThrow(/PNG、JPG、WebP 或 GIF/)
    await expect(compressImageBlob(new Blob([new Uint8Array(maxImageUploadBytes + 1)], { type: 'image/png' }), 1920)).rejects.toThrow(/10 MB/)

    const bitmap = { width: maxImagePixels + 1, height: 1, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    await expect(compressImageBlob(new Blob(['large'], { type: 'image/png' }), 1920)).rejects.toThrow(/分辨率过高/)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('rejects oversized compressed results and still releases the bitmap', async () => {
    const bitmap = { width: 100, height: 100, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['too large'], { type: 'image/webp' })))

    await expect(compressImageBlob(new Blob(['source'], { type: 'image/png' }), 1920, 2)).rejects.toThrow(/压缩后的图片仍然过大/)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
