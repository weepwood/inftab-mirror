// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { LauncherItem } from '../types'
import HomeDock from './HomeDock.vue'

let wrapper: VueWrapper | undefined

const item: LauncherItem = { id: 'weather', title: '天气', action: 'weather', color: '#36b3ff', mark: '☁' }

function pointerEvent(type: string, values: Record<string, unknown>) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), values)
}

function touchClick(pointerId: number) {
  return Object.assign(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }), { pointerId, pointerType: 'touch' })
}

function beginTouchGesture() {
  wrapper!.get('.home-dock').element.dispatchEvent(pointerEvent('pointerdown', {
    pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100,
  }))
  window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 101 }))
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('HomeDock touch gestures', () => {
  it('does not swallow the next tap when the browser cancels a native scroll gesture', async () => {
    wrapper = mount(HomeDock, { props: { items: [item] } })
    beginTouchGesture()
    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 1 }))

    await wrapper.get('.home-dock-item').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('suppresses the delayed synthetic click after a manually handled page scroll', async () => {
    wrapper = mount(HomeDock, { props: { items: [item] } })
    beginTouchGesture()
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 101, clientY: 140 }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 }))
    await Promise.resolve()

    wrapper.get('.home-dock-item').element.dispatchEvent(touchClick(1))

    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('allows a new touch tap when the browser did not emit a click for the prior scroll', async () => {
    wrapper = mount(HomeDock, { props: { items: [item] } })
    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100,
    }))
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 101, clientY: 140 }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 }))

    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 2, pointerType: 'touch', button: 0, clientX: 100, clientY: 100,
    }))
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2 }))
    wrapper.get('.home-dock-item').element.dispatchEvent(touchClick(2))

    expect(wrapper.emitted('open')).toHaveLength(1)
  })
})
