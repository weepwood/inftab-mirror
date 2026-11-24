// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getOverlayFocusable, trapOverlayTab } from './overlayFocus'

describe('overlay keyboard focus', () => {
  it('skips hidden, disabled and collapsed controls and wraps both directions', () => {
    const root = document.createElement('section')
    root.innerHTML = '<button id="first">first</button><button disabled>disabled</button><div hidden><button>hidden</button></div><details><summary>more</summary><button>collapsed</button></details><input type="hidden"><button id="last">last</button>'
    document.body.append(root)
    try {
      const items = getOverlayFocusable(root)
      expect(items.map(item => item.tagName)).toEqual(['BUTTON', 'SUMMARY', 'BUTTON'])
      items[2]!.focus()
      const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
      trapOverlayTab(forward, root)
      expect(forward.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(items[0])
      const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
      trapOverlayTab(backward, root)
      expect(document.activeElement).toBe(items[2])
    } finally { root.remove() }
  })
})
