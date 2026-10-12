import { maxImagePixels, maxImageUploadBytes } from './imageLimits'

export { maxImagePixels, maxImageUploadBytes, maxWallpaperDataUrlLength } from './imageLimits'

export function fitImageDimensions(width: number, height: number, maxDimension: number) {
  if (![width, height, maxDimension].every(Number.isFinite) || width <= 0 || height <= 0 || maxDimension <= 0) {
    throw new Error('图片尺寸无效。')
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function readBoundedImageResponse(response: Response): Promise<Blob> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxImageUploadBytes) {
    throw new Error('图片不能超过 10 MB。')
  }
  if (!response.body) {
    const blob = await response.blob()
    if (blob.size > maxImageUploadBytes) throw new Error('图片不能超过 10 MB。')
    return blob
  }

  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let segment = new Uint8Array(64 * 1024)
  let segmentLength = 0
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxImageUploadBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('图片不能超过 10 MB。')
      }
      let offset = 0
      while (offset < value.byteLength) {
        const copied = Math.min(segment.byteLength - segmentLength, value.byteLength - offset)
        segment.set(value.subarray(offset, offset + copied), segmentLength)
        segmentLength += copied
        offset += copied
        if (segmentLength === segment.byteLength) {
          chunks.push(segment.buffer)
          segment = new Uint8Array(64 * 1024)
          segmentLength = 0
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (segmentLength) chunks.push(segment.slice(0, segmentLength).buffer)
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? ''
  return new Blob(chunks, { type: contentType })
}

export async function fetchAndCompressImage(url: string, maxDimension: number, fetcher: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  let blob: Blob
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error(`图标下载失败（HTTP ${response.status}）。`)
    blob = await readBoundedImageResponse(response)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('图标下载超时，请检查网络后重试。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
  return compressImageBlob(blob, maxDimension)
}

export async function compressImageBlob(blob: Blob, maxDimension: number, maxOutputBytes = 1_500_000): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type)) throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片。')
  if (blob.size > maxImageUploadBytes) throw new Error('图片不能超过 10 MB。')
  if (typeof createImageBitmap !== 'function') throw new Error('此浏览器不支持图片处理，请更新浏览器后重试。')

  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width * bitmap.height > maxImagePixels) throw new Error('图片分辨率过高，请换一张较小的图片。')
    const dimensions = fitImageDimensions(bitmap.width, bitmap.height, maxDimension)
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张图片。')
    if (typeof canvas.toBlob !== 'function') throw new Error('此浏览器不支持图片压缩，请更新浏览器后重试。')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('图片压缩失败。')), 'image/webp', 0.84)
    })
    if (compressed.size > maxOutputBytes) throw new Error('压缩后的图片仍然过大，请换一张内容更简单的图片。')
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取压缩后的图片。'))
      reader.onerror = () => reject(new Error('无法读取压缩后的图片。'))
      reader.readAsDataURL(compressed)
    })
  } finally {
    bitmap.close()
  }
}
