// @vitest-environment jsdom
import { effectScope, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { useShortcutDrag } from './useShortcutDrag'
import type { LauncherItem } from '../types'

it('continues vertical scrolling after the initial touch movement without starting a drag', () => {
  const scope = effectScope()
  const home = document.createElement('main')
  home.className = 'home home-scrollable'
  const cell = document.createElement('article')
  home.append(cell)
  document.body.append(home)
  const item: LauncherItem = { id: 'one', title: '入口', color: '#fff', mark: '1' }
  const emit = vi.fn()
  const drag = scope.run(() => useShortcutDrag({ items: [item] }, emit, ref(home), ref([[item]]), ref('')))!
  const pointer = (type: string, y: number) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: y })
  try {
    cell.addEventListener('pointerdown', event => drag.onPointerDown(event as PointerEvent, item))
    cell.dispatchEvent(pointer('pointerdown', 200))
    window.dispatchEvent(pointer('pointermove', 160))
    expect(home.scrollTop).toBe(40)
    window.dispatchEvent(pointer('pointermove', 120))
    expect(home.scrollTop).toBe(80)
    expect(drag.draggingId.value).toBe('')
    window.dispatchEvent(pointer('pointerup', 120))
    expect(emit).not.toHaveBeenCalled()
  } finally {
    scope.stop()
    home.remove()
  }
})
