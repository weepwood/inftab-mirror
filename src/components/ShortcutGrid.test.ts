// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShortcutGrid from './ShortcutGrid.vue'
import type { LauncherItem } from '../types'
import { launcherItems } from '../data/defaults'

const items: LauncherItem[] = Array.from({ length: 4 }, (_, index) => ({
  id: `item-${index}`,
  title: `入口 ${index}`,
  color: '#3567aa',
  mark: String(index),
}))

function installAnimationEnvironment() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: () => {}, removeListener: () => {} }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ShortcutGrid page cycling', () => {
  it('falls back from a broken icon and retries when its URL changes', async () => {
    installAnimationEnvironment()
    const shortcut: LauncherItem = { ...items[0]!, icon: 'https://icons.example/broken.png' }
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: [shortcut],
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    await wrapper.get('.shortcut-picture').trigger('error')
    expect(wrapper.find('.shortcut-picture').exists()).toBe(false)
    expect(wrapper.get('.shortcut-icon .shortcut-mark').text()).toBe(shortcut.mark)

    await wrapper.setProps({ items: [{ ...shortcut, icon: 'https://icons.example/recovered.png' }] })
    expect(wrapper.get('.shortcut-picture').attributes('src')).toBe('https://icons.example/recovered.png')

    await wrapper.setProps({ items: [] })
    await wrapper.setProps({ items: [shortcut] })
    expect(wrapper.get('.shortcut-picture').attributes('src')).toBe(shortcut.icon)
    wrapper.unmount()
  })

  it('skips configured page effects when reduced motion is requested', async () => {
    installAnimationEnvironment()
    vi.stubGlobal('matchMedia', () => ({ matches: true, addListener: () => {}, removeEventListener: () => {} }))
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: Array.from({ length: 8 }, (_, index) => ({ ...items[index % items.length]!, id: `reduced-${index}` })),
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'particles',
        transitionDuration: 1800,
      },
    })

    await wrapper.setProps({ currentPage: 1 })

    expect(wrapper.find('.particles-in, .particles-out, .trails-out').exists()).toBe(false)
    expect(document.getElementById('shortcut-particle-canvas')).toBeNull()
    expect(wrapper.get('.shortcut-pages').attributes('style')).toContain('transform: none')
    wrapper.unmount()
  })

  it('renders a non-empty icon for every built-in launcher action', () => {
    installAnimationEnvironment()
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: launcherItems,
        columns: 6,
        rows: 3,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    for (const item of launcherItems.filter((launcherItem) => launcherItem.action)) {
      expect(wrapper.get(`[data-item-id="${item.id}"] .shortcut-icon`).find('svg, img, .shortcut-mark').exists(), item.id).toBe(true)
    }
    expect(wrapper.get('[data-item-id="weather"] .shortcut-open').attributes('aria-label')).toBe('打开天气')
    expect(wrapper.get('[data-item-id="settings"] .shortcut-open').attributes('aria-label')).toBe('打开设置')
    wrapper.unmount()
  })

  it('keeps the correct page interactive when rapid turns reach the loop rebase', async () => {
    installAnimationEnvironment()
    const wrapper = mount(ShortcutGrid, {
      props: {
        items,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    for (const page of [1, 0, 1, 0]) {
      await wrapper.setProps({ currentPage: page, transitionDirection: 1 })
      await flushPromises()
    }

    const activePage = wrapper.find('.shortcut-page[aria-hidden="false"]')
    expect(activePage.exists()).toBe(true)
    expect(activePage.attributes('data-page-index')).toBe('0')
    expect(activePage.text()).toContain('入口 0')
    expect(activePage.text()).toContain('入口 1')
    wrapper.unmount()
  })

  it('keeps duplicated cycle pages inert for assistive technology', () => {
    installAnimationEnvironment()
    const wrapper = mount(ShortcutGrid, {
      props: {
        items,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 1,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    const active = wrapper.findAll('.shortcut-page[aria-hidden="false"]')
    const inactive = wrapper.findAll('.shortcut-page[aria-hidden="true"]')
    expect(active).toHaveLength(1)
    expect(active[0]?.attributes('data-page-index')).toBe('1')
    expect(inactive.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('mounts shortcut cells only for the active slide and its neighbors', () => {
    installAnimationEnvironment()
    const manyItems = Array.from({ length: 100 }, (_, index) => ({ ...items[index % items.length], id: 'entry-' + index }))
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: manyItems,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 10,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    expect(wrapper.findAll('.shortcut-page').length).toBeGreaterThan(100)
    expect(wrapper.findAll('.shortcut-cell')).toHaveLength(6)
    wrapper.unmount()
  })

  it('mounts only the current page when particles are idle', () => {
    installAnimationEnvironment()
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: Array.from({ length: 20 }, (_, index) => ({ ...items[index % items.length], id: 'entry-' + index })),
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 3,
        transitionDirection: 1,
        transitionEffect: 'particles',
        transitionDuration: 0,
      },
    })

    expect(wrapper.findAll('.shortcut-cell')).toHaveLength(2)
    expect(wrapper.findAll('.shortcut-page')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cancels pending page reset frames when the grid unmounts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16))
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: () => {}, removeListener: () => {} }))
    const wrapper = mount(ShortcutGrid, {
      props: {
        items,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    await wrapper.setProps({ items: items.slice(0, 2) })
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a running particle canvas when the transition effect changes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16))
    const cancelFrame = vi.fn((handle: number) => window.clearTimeout(handle))
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: () => {}, removeListener: () => {} }))
    const pixels = new Uint8ClampedArray(48 * 48 * 4)
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255
    const context = {
      scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(),
      save: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), restore: vi.fn(), fillText: vi.fn(),
      getImageData: () => ({ data: pixels }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const wrapper = mount(ShortcutGrid, {
      props: {
        items,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'particles',
        transitionDuration: 0,
      },
    })

    await wrapper.setProps({ currentPage: 1 })
    expect(document.getElementById('shortcut-particle-canvas')).not.toBeNull()
    await wrapper.setProps({ transitionEffect: 'slide' })

    expect(cancelFrame).toHaveBeenCalled()
    expect(document.getElementById('shortcut-particle-canvas')).toBeNull()
    wrapper.unmount()
  })

  it('supports keyboard context menus and restores focus after Escape', async () => {
    installAnimationEnvironment()
    const shortcut = {
      id: 'shortcut',
      title: 'Example',
      url: 'https://example.com/',
      color: '#3567aa',
      mark: 'E',
    }
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: [{ id: shortcut.id, title: shortcut.title, color: shortcut.color, mark: shortcut.mark, shortcut }],
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
      attachTo: document.body,
    })

    const trigger = wrapper.get('.shortcut-open').element as HTMLElement
    trigger.focus()
    await wrapper.get('.shortcut-open').trigger('keydown', { key: 'F10', shiftKey: true })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="menuitem"]').exists()).toBe(true))
    expect(document.activeElement).toBe(wrapper.get('[role="menuitem"]').element)

    const moveDown = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    document.activeElement!.dispatchEvent(moveDown)
    await flushPromises()
    expect(moveDown.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(wrapper.findAll('[role="menuitem"]')[1]!.element)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })
})

describe('ShortcutGrid keyboard reordering', () => {
  it('copies a shortcut URL from its accessible keyboard context menu', async () => {
    installAnimationEnvironment()
    const writeText = vi.fn().mockResolvedValue(undefined)
    const requestPermission = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request: requestPermission } })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const shortcut = { id: 'shortcut', title: 'Example', url: 'https://example.com/', color: '#3567aa', mark: 'E' }
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: [{ id: shortcut.id, title: shortcut.title, color: shortcut.color, mark: shortcut.mark, shortcut }],
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
      attachTo: document.body,
    })

    const trigger = wrapper.get('.shortcut-open')
    await trigger.trigger('keydown', { key: 'F10', shiftKey: true })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="menuitem"]').exists()).toBe(true))
    await wrapper.findAll('[role="menuitem"]')[0]!.trigger('keydown', { key: 'ArrowDown' })
    const copyAction = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('复制网址'))!
    expect(document.activeElement).toBe(copyAction.element)
    await copyAction.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('https://example.com/')
    expect(requestPermission).toHaveBeenCalledWith({ permissions: ['clipboardWrite'] })
    expect(wrapper.get('[role="status"]').text()).toContain('已复制Example的网址')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('announces when clipboard permission is denied', async () => {
    installAnimationEnvironment()
    const writeText = vi.fn()
    vi.stubGlobal('chrome', { permissions: { request: vi.fn().mockResolvedValue(false) } })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const shortcut = { id: 'shortcut', title: 'Example', url: 'https://example.com/', color: '#3567aa', mark: 'E' }
    const wrapper = mount(ShortcutGrid, {
      props: {
        items: [{ id: shortcut.id, title: shortcut.title, color: shortcut.color, mark: shortcut.mark, shortcut }],
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })

    await wrapper.get('.shortcut-open').trigger('keydown', { key: 'F10', shiftKey: true })
    await vi.waitFor(() => expect(wrapper.find('[role="menuitem"]').exists()).toBe(true))
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('复制网址'))!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('无法复制网址')
    expect(writeText).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('offers a keyboard alternative and emits bounded adjacent moves', async () => {
    installAnimationEnvironment()
    const wrapper = mount(ShortcutGrid, {
      props: {
        items,
        columns: 2,
        rows: 1,
        iconSize: 64,
        iconRadius: 24,
        showNames: true,
        currentPage: 0,
        transitionDirection: 1,
        transitionEffect: 'slide',
        transitionDuration: 0,
      },
    })
    const secondButton = wrapper.get('[data-item-id="item-1"] .shortcut-open')
    expect(secondButton.attributes('aria-keyshortcuts')).toContain('Shift+ArrowLeft')

    await secondButton.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(wrapper.emitted('moveByKeyboard')).toEqual([['item-1', -1]])
    expect(wrapper.get('[role="status"]').text()).toContain('移动到第1个位置')

    await wrapper.get('[data-item-id="item-0"] .shortcut-open').trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(wrapper.emitted('moveByKeyboard')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toContain('已经是第一个入口')
    wrapper.unmount()
  })
})
