import type { Ref } from 'vue'
import { truncateCodePoints } from '../data/text'

interface IconParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  delay: number
}

const maxParticleCanvasPixels = 4 * 1024 * 1024

export function particleCanvasSize(width: number, height: number, deviceRatio: number) {
  const w = Math.max(1, width), h = Math.max(1, height)
  const scale = Math.min(deviceRatio || 1, 2, Math.sqrt(maxParticleCanvasPixels / (w * h)))
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) }
}

function iconParticles(icon: HTMLElement, direction: number, iconIndex: number, iconCount: number, sample: HTMLCanvasElement): IconParticle[] {
  const bounds = icon.getBoundingClientRect()
  const image = icon.querySelector('img')
  const mark = icon.querySelector<HTMLElement>('.shortcut-mark')
  // Reset the bitmap and origin-clean state before each icon, including remote images.
  sample.width = 48
  sample.height = 48
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const style = getComputedStyle(icon)
  const radius = Math.min(13, Number.parseFloat(style.borderRadius) || 0)
  context.fillStyle = style.backgroundColor
  context.beginPath()
  context.roundRect(0, 0, 48, 48, radius)
  context.fill()
  if (image?.complete && image.naturalWidth > 0) {
    context.save()
    context.beginPath()
    context.roundRect(0, 0, 48, 48, radius)
    context.clip()
    try { context.drawImage(image, 0, 0, 48, 48) } catch { return [] }
    context.restore()
  } else if (mark) {
    const markStyle = getComputedStyle(mark)
    context.fillStyle = markStyle.color
    context.font = `700 ${Math.min(25, Number.parseFloat(markStyle.fontSize) || 21)}px system-ui`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(truncateCodePoints(mark.textContent?.trim() ?? '', 5), 24, 24, 42)
  }
  let pixels: ImageData
  try {
    pixels = context.getImageData(0, 0, 48, 48)
  } catch {
    return []
  }
  const stride = Math.max(4, Math.ceil(Math.sqrt((48 * 48 * iconCount) / 900)))
  const result: IconParticle[] = []
  const stepDelay = (iconIndex / Math.max(1, iconCount - 1)) * 90
  for (let y = 1; y < 48; y += stride) {
    for (let x = 1; x < 48; x += stride) {
      const offset = (y * 48 + x) * 4
      const alpha = pixels.data[offset + 3] / 255
      if (alpha < 0.12 || Math.random() > 0.88) continue
      const angle = Math.random() * Math.PI * 2
      const speed = 24 + Math.random() * 95
      result.push({
        x: bounds.left + (x / 48) * bounds.width,
        y: bounds.top + (y / 48) * bounds.height,
        vx: Math.cos(angle) * speed - direction * (20 + Math.random() * 54),
        vy: Math.sin(angle) * speed - 18,
        size: 1.5 + Math.random() * 3.5,
        color: `rgba(${pixels.data[offset]}, ${pixels.data[offset + 1]}, ${pixels.data[offset + 2]}, ${alpha})`,
        delay: stepDelay,
      })
    }
  }
  return result
}

export function useShortcutParticles(gridViewport: Ref<HTMLElement | undefined>) {
  let particleFrame = 0
  function playParticleTransition(pageIndex: number, direction: number, duration: number) {
    const page = gridViewport.value?.querySelector<HTMLElement>(`.shortcut-page[data-page-index="${pageIndex}"]:not([data-clone="true"])`)
    const icons = [...(page?.querySelectorAll<HTMLElement>('.shortcut-icon') ?? [])]
    if (!icons.length) return
    const sample = document.createElement('canvas')
    const particles = icons.flatMap((icon, index) => iconParticles(icon, direction, index, icons.length, sample))
    if (!particles.length) return
    cancelParticleTransition()
    const canvas = document.createElement('canvas')
    canvas.id = 'shortcut-particle-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '4', pointerEvents: 'none' })
    const viewportWidth = Math.max(1, window.innerWidth)
    const viewportHeight = Math.max(1, window.innerHeight)
    const size = particleCanvasSize(viewportWidth, viewportHeight, window.devicePixelRatio)
    canvas.width = size.width
    canvas.height = size.height
    document.body.append(canvas)
    const context = canvas.getContext('2d')
    if (!context) { canvas.remove(); return }
    context.scale(size.width / viewportWidth, size.height / viewportHeight)
    const startedAt = performance.now()
    const animationDuration = Math.max(260, duration)
    const animate = (now: number) => {
      context.clearRect(0, 0, viewportWidth, viewportHeight)
      let hasParticles = false
      for (const particle of particles) {
        const elapsed = now - startedAt - particle.delay
        if (elapsed < 0) { hasParticles = true; continue }
        const progress = Math.min(1, elapsed / animationDuration)
        if (progress >= 1) continue
        hasParticles = true
        const eased = 1 - (1 - progress) ** 2
        context.globalAlpha = (1 - progress) ** 1.4
        context.fillStyle = particle.color
        context.shadowColor = particle.color
        context.shadowBlur = 7 * (1 - progress)
        context.fillRect(particle.x + particle.vx * eased * 0.48, particle.y + particle.vy * eased * 0.48 + 34 * progress * progress, particle.size * (1 - progress * 0.55), particle.size * (1 - progress * 0.55))
      }
      context.globalAlpha = 1
      context.shadowBlur = 0
      if (hasParticles) particleFrame = requestAnimationFrame(animate)
      else { canvas.remove(); particleFrame = 0 }
    }
    particleFrame = requestAnimationFrame(animate)
  }
  
  function cancelParticleTransition() {
    if (particleFrame) cancelAnimationFrame(particleFrame)
    particleFrame = 0
    document.getElementById('shortcut-particle-canvas')?.remove()
  }
  return { playParticleTransition, cancelParticleTransition }
}
