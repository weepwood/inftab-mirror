// @vitest-environment jsdom
import { effectScope, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { useHomeNavigation } from './useHomeNavigation'

it('does not flip pages or consume scroll while an overlay is open', () => {
  const scope = effectScope()
  const currentPage = ref(0)
  const overlayOpen = ref(false)
  const navigation = scope.run(() => useHomeNavigation({ currentPage, overlayOpen, pageDirection: ref(1), pageCount: ref(3), minimalMode: ref(false), shortHomeScrollEnabled: ref(false) }))!
  try {
    navigation.startHomeSwipe({ pointerType: 'touch', pointerId: 1, clientX: 150, clientY: 0 } as PointerEvent)
    overlayOpen.value = true
    navigation.finishHomeSwipe({ pointerId: 1, clientX: 0, clientY: 0 } as PointerEvent)
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    navigation.handleHomeWheel(wheel)
    expect(wheel.defaultPrevented).toBe(false)
    expect(currentPage.value).toBe(0)
    overlayOpen.value = false
    navigation.handleHomeWheel(new WheelEvent('wheel', { deltaY: 100, cancelable: true }))
    expect(currentPage.value).toBe(1)
  } finally { scope.stop() }
})

it('accepts consecutive and reversed wheel inputs without a cooldown, wrapping in both directions', () => {
  const scope = effectScope()
  const currentPage = ref(2)
  const nav = scope.run(() => useHomeNavigation({ currentPage, overlayOpen: ref(false), pageDirection: ref(1), pageCount: ref(3), minimalMode: ref(false), shortHomeScrollEnabled: ref(false) }))!
  try {
    for (const deltaY of [100, 100, -100]) nav.handleHomeWheel(new WheelEvent('wheel', { deltaY, cancelable: true }))
    expect(currentPage.value).toBe(0)
  } finally { scope.stop() }
})

it('preserves fine-grained wheel remainder and allows reversal before settling', () => {
  vi.useFakeTimers()
  const scope = effectScope()
  const currentPage = ref(0)
  const nav = scope.run(() => useHomeNavigation({ currentPage, overlayOpen: ref(false), pageDirection: ref(1), pageCount: ref(5), minimalMode: ref(false), shortHomeScrollEnabled: ref(false) }))!
  const wheel = (deltaX: number) => nav.handleHomeWheel(new WheelEvent('wheel', { deltaX, cancelable: true }))
  try {
    wheel(70)
    wheel(60)
    expect(currentPage.value).toBe(1)
    wheel(-30)
    vi.advanceTimersByTime(150)
    expect(currentPage.value).toBe(1)
    expect(nav.wheelOffset.value).toBe(0)
    wheel(-100)
    expect(currentPage.value).toBe(0)
  } finally { scope.stop(); vi.useRealTimers() }
})
