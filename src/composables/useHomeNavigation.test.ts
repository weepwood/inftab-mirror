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

it('uses the shortest cyclic path for explicit page selections', () => {
  const scope = effectScope()
  const currentPage = ref(0)
  const pageDirection = ref(1)
  const nav = scope.run(() => useHomeNavigation({ currentPage, pageDirection, overlayOpen: ref(false), pageCount: ref(5), minimalMode: ref(false), shortHomeScrollEnabled: ref(false) }))!
  try {
    nav.goToPage(4)
    expect([currentPage.value, pageDirection.value]).toEqual([4, -1])
    nav.goToPage(1)
    expect([currentPage.value, pageDirection.value]).toEqual([1, 1])
  } finally { scope.stop() }
})

it('previews empty-area horizontal touch movement and cancels on mode changes', () => {
  const scope = effectScope()
  const currentPage = ref(0)
  const minimalMode = ref(false)
  const nav = scope.run(() => useHomeNavigation({ currentPage, pageDirection: ref(1), overlayOpen: ref(false), pageCount: ref(3), minimalMode, shortHomeScrollEnabled: ref(false) }))!
  const touch = (x: number, y = 50) => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: y } as PointerEvent)
  try {
    nav.startHomeSwipe(touch(200))
    nav.moveHomeSwipe(touch(120))
    expect(nav.wheelOffset.value).toBeLessThan(0)
    expect(currentPage.value).toBe(0)
    nav.finishHomeSwipe(touch(90))
    expect(currentPage.value).toBe(1)
    expect(nav.wheelOffset.value).toBe(0)
    nav.startHomeSwipe(touch(200))
    nav.moveHomeSwipe(touch(280))
    minimalMode.value = true
    minimalMode.value = false
    nav.finishHomeSwipe(touch(300))
    expect(currentPage.value).toBe(1)
    expect(nav.wheelOffset.value).toBe(0)
    nav.startHomeSwipe(touch(200))
    nav.moveHomeSwipe(touch(180, 200))
    expect(nav.wheelOffset.value).toBe(0)
  } finally { scope.stop() }
})

it('decays touch release projection when the finger pauses before release', () => {
  const scope = effectScope(), currentPage = ref(0)
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  const nav = scope.run(() => useHomeNavigation({ currentPage, pageDirection: ref(1), pageCount: ref(3), minimalMode: ref(false), shortHomeScrollEnabled: ref(false), overlayOpen: ref(false) }))!
  const touch = (x: number) => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: 0 } as PointerEvent)
  try {
    nav.startHomeSwipe(touch(200)); now = 16; nav.moveHomeSwipe(touch(160))
    now = 24; nav.finishHomeSwipe(touch(160))
    expect(currentPage.value).toBe(1)
    nav.startHomeSwipe(touch(200)); now = 40; nav.moveHomeSwipe(touch(160))
    now = 180; nav.finishHomeSwipe(touch(160))
    expect(currentPage.value).toBe(1)
  } finally { scope.stop(); clock.mockRestore() }
})

it('does not let wheel input steal an active touch gesture', () => {
  const scope = effectScope(), currentPage = ref(0)
  const nav = scope.run(() => useHomeNavigation({ currentPage, pageDirection: ref(1), pageCount: ref(3), minimalMode: ref(false), shortHomeScrollEnabled: ref(false), overlayOpen: ref(false) }))!
  const touch = (x: number) => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: 0 } as PointerEvent)
  try {
    nav.startHomeSwipe(touch(200)); nav.moveHomeSwipe(touch(130))
    const preview = nav.wheelOffset.value
    const wheel = new WheelEvent('wheel', { deltaX: 100, cancelable: true })
    nav.handleHomeWheel(wheel)
    expect(currentPage.value).toBe(0)
    expect(nav.wheelOffset.value).toBe(preview)
    expect(wheel.defaultPrevented).toBe(false)
    nav.finishHomeSwipe(touch(100))
    expect(currentPage.value).toBe(1)
    nav.handleHomeWheel(new WheelEvent('wheel', { deltaX: 100, cancelable: true }))
    expect(currentPage.value).toBe(2)
  } finally { scope.stop() }
})
