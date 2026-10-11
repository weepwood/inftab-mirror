// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShortcutGrid from './ShortcutGrid.vue'
import type { LauncherItem } from '../types'

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

afterEach(() => vi.unstubAllGlobals())

describe('ShortcutGrid page cycling', () => {
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
})
