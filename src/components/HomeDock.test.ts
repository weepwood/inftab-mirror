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

describe('HomeDock icons', () => {
  it('uses the same vector tool icons as the grid while preserving website artwork', () => {
    wrapper = mount(HomeDock, { props: { items: [
      { ...item, icon: '/legacy-weather.png' },
      { id: 'site', title: '网站', color: '#123456', mark: 'S', icon: '/site.png' },
    ] } })
    const tool = wrapper.get('[data-dock-item-id="weather"] .home-dock-icon')
    expect(tool.attributes('data-action')).toBe('weather')
    expect(tool.find('svg').exists()).toBe(true)
    expect(tool.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-dock-item-id="site"] img').attributes('src')).toBe('/site.png')
  })
})

describe('HomeDock context menu', () => {
  it('hides dock labels while keeping accessible names and tooltips', () => {
    wrapper = mount(HomeDock, { props: { items: [item] } })

    const button = wrapper.get('.home-dock-item')
    expect(wrapper.find('.home-dock-label').exists()).toBe(false)
    expect(button.attributes('aria-label')).toBe('打开天气')
    expect(wrapper.get('.home-dock-entry').attributes('data-title')).toBe('天气')
    expect(button.attributes('title')).toBeUndefined()
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
    const frames: { current?: FrameRequestCallback } = {}
    function advance(time: number) {
      const callback = frames.current
      frames.current = undefined
      callback?.(time)
    }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.current = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointermove', {
      pointerType: 'mouse', clientX: 24,
    }))
    advance(16)
    const scale = () => Number((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-scale'))
    expect(scale()).toBeGreaterThan(1)
    expect(scale()).toBeLessThan(1.65)
    advance(32)
    const beforeRetarget = scale()
    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointermove', { pointerType: 'mouse', clientX: 124 }))
    // New target is lower, but the inherited positive velocity means the
    // scale initially continues rising rather than jumping to the new target.
    advance(48)
    expect(scale()).toBeGreaterThan(beforeRetarget)
    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointermove', { pointerType: 'mouse', clientX: 24 }))
    for (let time = 64; time <= 640; time += 16) advance(time)

    expect((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-scale')).toBe('1.650')
    expect(Number((entries[1]!.element as HTMLElement).style.getPropertyValue('--dock-scale'))).toBeGreaterThan(1)
    expect(parseFloat((entries[2]!.element as HTMLElement).style.getPropertyValue('--dock-shift-x'))).toBeGreaterThan(parseFloat((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-shift-x')))
    expect((entries[1]!.element as HTMLElement).style.width).toBe('')
    expect(wrapper.get('.home-dock').classes()).toContain('is-magnifying')

    wrapper.get('.home-dock').element.dispatchEvent(pointerEvent('pointerleave', {}))
    for (let time = 656; time <= 1296; time += 16) advance(time)

    expect((entries[0]!.element as HTMLElement).style.getPropertyValue('--dock-scale')).toBe('')
    expect((entries[1]!.element as HTMLElement).style.getPropertyValue('--dock-shift-x')).toBe('')
    expect(wrapper.get('.home-dock').classes()).not.toContain('is-magnifying')
  })
})

it('offers keyboard reordering without dragging', async () => {
  wrapper = mount(HomeDock, { props: { items: [item, { ...item, id: 'mail', title: '邮件' }] } })
  await wrapper.get('[data-dock-item-id="weather"]').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
  expect(wrapper.emitted('reorder')).toEqual([['weather', 'mail', true]])
})

it('retains the visible position and velocity across interrupted spring reordering', async () => {
  const mail = { ...item, id: 'mail', title: '邮件' }
  wrapper = mount(HomeDock, { props: { items: [item, mail] } })
  const frames: { current?: FrameRequestCallback } = {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.current = callback; return 1 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frames.current = undefined })
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const advance = () => { now += 16; const cb = frames.current; frames.current = undefined; cb?.(now) }
  const track = wrapper.get('.home-dock-track').element as HTMLElement
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0 } as DOMRect)
  const slots = wrapper.findAll('.home-dock-entry').map(entry => entry.element as HTMLElement)
  const offset = (el: HTMLElement) => Array.from(track.children).indexOf(el) * 50
  const translation = (el: HTMLElement) => Number(el.style.transform.match(/translateX\(([^p]+)px\)/)?.[1] ?? 0)
  slots.forEach(el => {
    Object.defineProperties(el, { offsetParent: { value: track }, offsetLeft: { get: () => offset(el) }, offsetWidth: { value: 48 } })
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => ({ left: offset(el) + translation(el), width: 48 } as DOMRect))
  })
  try {
    await wrapper.setProps({ items: [mail, item] })
    await nextTick()
    expect(translation(slots[0]!)).toBe(-50)
    advance(); advance()
    const before = offset(slots[0]!) + translation(slots[0]!)
    expect(before).toBeGreaterThan(0)
    await wrapper.setProps({ items: [item, mail] })
    await nextTick()
    expect(offset(slots[0]!) + translation(slots[0]!)).toBeCloseTo(before)
    advance()
    // The direction changed but the retained positive velocity initially
    // still moves the item right, instead of restarting at zero velocity.
    expect(offset(slots[0]!) + translation(slots[0]!)).toBeGreaterThan(before)
    for (let i = 0; i < 60; i++) advance()
    expect(slots.every(el => !el.style.transform)).toBe(true)
    expect(frames.current).toBeUndefined()
  } finally { wrapper.unmount(); wrapper = undefined; vi.restoreAllMocks() }
})

it('uses layout geometry instead of a transformed slot for drag insertion', async () => {
  wrapper = mount(HomeDock, { props: { items: [item, { ...item, id: 'mail', title: '邮件' }] } })
  const track = wrapper.get('.home-dock-track').element as HTMLElement
  const target = wrapper.findAll('.home-dock-entry')[1]!.element as HTMLElement
  Object.defineProperties(target, { offsetParent: { value: track }, offsetLeft: { value: 50 }, offsetWidth: { value: 48 } })
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100 } as DOMRect)
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 200, width: 48 } as DOMRect)
  await wrapper.get('[data-dock-item-id="weather"]').trigger('dragstart')
  await wrapper.findAll('.home-dock-entry')[1]!.trigger('dragover', { clientX: 180 })
  expect(target.classList.contains('dock-drop-after')).toBe(true)
  await wrapper.findAll('.home-dock-entry')[1]!.trigger('drop', { clientX: 180 })
  expect(wrapper.emitted('reorder')).toEqual([['weather', 'mail', true]])
})
