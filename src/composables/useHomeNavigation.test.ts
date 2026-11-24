// @vitest-environment jsdom
import { effectScope, ref } from 'vue'
import { expect, it } from 'vitest'
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
