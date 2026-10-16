// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('HomeDock context menu', () => {
  it('hides dock labels while keeping accessible names and tooltips', () => {
    wrapper = mount(HomeDock, { props: { items: [item] } })

    const button = wrapper.get('.home-dock-item')
    expect(wrapper.find('.home-dock-label').exists()).toBe(false)
    expect(button.attributes('aria-label')).toBe('打开天气')
    expect(button.attributes('title')).toBe('天气')
    expect(wrapper.find('.home-dock-remove').exists()).toBe(false)
    expect(wrapper.get('.home-dock').classes()).toContain('magnification-off')
  })

  it('can disable icon magnification', () => {
    wrapper = mount(HomeDock, { props: { items: [item], magnificationEnabled: false } })

    expect(wrapper.get('.home-dock').classes()).toContain('magnification-off')
  })

  it('sizes the icon and its button together', () => {
    wrapper = mount(HomeDock, { props: { items: [item], iconSize: 58 } })

    expect(wrapper.get('.home-dock').attributes('style')).toContain('--dock-size-setting: 58px')
    expect(wrapper.get('.home-dock').attributes('style')).toContain('--dock-gap-setting: 2px')
  })

  it('removes an item from its right-click menu', async () => {
    wrapper = mount(HomeDock, { attachTo: document.body, props: { items: [item] } })

    await wrapper.get('.home-dock-item').trigger('contextmenu')
    const menu = document.body.querySelector('.dock-context-menu')
    expect(menu).not.toBeNull()
    expect(menu?.getAttribute('role')).toBe('menu')
    expect(menu?.textContent).toContain('从 Dock 移除')
    menu?.querySelector('button')?.click()
    await nextTick()

    expect(wrapper.emitted('remove')).toEqual([['weather']])
    expect(document.body.querySelector('.dock-context-menu')).toBeNull()
  })

  it('applies the dark theme to its teleported context menu', async () => {
    wrapper = mount(HomeDock, { attachTo: document.body, props: { items: [item], darkTheme: true } })
    await wrapper.get('.home-dock-item').trigger('contextmenu')

    expect(document.body.querySelector('.dock-context-theme.theme-dark .dock-context-menu')).not.toBeNull()
  })
})

describe('HomeDock magnification', () => {
  it('uses stable icon positions while magnifying and clears styles on leave', () => {
    wrapper = mount(HomeDock, {
      props: {
        items: [item, { ...item, id: 'mail', title: '邮件' }, { ...item, id: 'maps', title: '地图' }],
        magnificationEnabled: true,
      },
    })
    const entries = wrapper.findAll('.home-dock-entry')
    entries.forEach((entry, index) => {
      vi.spyOn(entry.element, 'getBoundingClientRect').mockReturnValue({
        left: index * 50, width: 48, right: index * 50 + 48, top: 0, bottom: 48,
        height: 48, x: index * 50, y: 0, toJSON: () => ({}),
      } as DOMRect)
    })
    let runFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      runFrame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointermove', {
      pointerType: 'mouse', clientX: 24,
    }))
    runFrame?.(0)

    expect((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-scale')).toBe('1.500')
    expect((entries[1]!.element as HTMLElement).style.getPropertyValue('--dock-scale')).toBe('1.361')
    expect((entries[1]!.element as HTMLElement).style.getPropertyValue('--dock-shift-x')).toBe('8.66px')
    expect((entries[1]!.element as HTMLElement).style.width).toBe('')
    expect(wrapper.get('.home-dock').classes()).toContain('is-magnifying')

    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointerleave', {}))

    expect((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-scale')).toBe('')
    expect((entries[1]!.element as HTMLElement).style.getPropertyValue('--dock-shift-x')).toBe('')
    expect(wrapper.get('.home-dock').classes()).not.toContain('is-magnifying')
  })
})
