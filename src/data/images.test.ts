// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImageBlob, fetchAndCompressImage, fitImageDimensions, maxImagePixels, maxImageUploadBytes } from './images'

afterEach(() => {
  vi.useRealTimers()
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

  it('downloads shortcut images without credentials or referrer, then compresses them locally', async () => {
    const bitmap = { width: 192, height: 192, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['webp'], { type: 'image/webp' })))
    const image = new Blob(['source'], { type: 'image/png' })
    const fetcher = vi.fn().mockResolvedValue(new Response(image, { headers: { 'content-type': 'image/png' } }))

    const dataUrl = await fetchAndCompressImage('https://images.example/icon.png', 192, fetcher)

    expect(dataUrl).toMatch(/^data:image\/webp;base64,/)
    expect(fetcher).toHaveBeenCalledWith('https://images.example/icon.png', expect.objectContaining({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal),
    }))
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('rejects oversized remote image responses before decoding them', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      headers: { 'content-length': String(maxImageUploadBytes + 1) },
    }))

    await expect(fetchAndCompressImage('https://images.example/large.png', 192, fetcher)).rejects.toThrow(/10 MB/)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('stops reading an oversized streamed image even without a content-length header', async () => {
    const createBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createBitmap)
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new Uint8Array(maxImageUploadBytes + 1))
        controller.close()
      },
    })
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/png' } }))

    await expect(fetchAndCompressImage('https://images.example/stream.png', 192, fetcher)).rejects.toThrow(/10 MB/)
    expect(createBitmap).not.toHaveBeenCalled()
  })

  it('aborts a stalled remote image request and reports a timeout', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))

    const request = fetchAndCompressImage('https://images.example/slow.png', 192, fetcher)
    const timedOut = expect(request).rejects.toThrow(/超时/)
    await vi.advanceTimersByTimeAsync(10_000)

    await timedOut
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
