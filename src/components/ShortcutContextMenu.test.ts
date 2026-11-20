// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { maxDockItems, type LauncherItem } from '../types'
import ShortcutContextMenu from './ShortcutContextMenu.vue'

let wrapper: VueWrapper | undefined
const shortcut = { id: 'example', title: 'Example', url: 'https://example.com/', color: '#369', mark: 'E' }
const item: LauncherItem = { ...shortcut, shortcut }
const fullDock = Array.from({ length: maxDockItems }, (_, index) => `pinned-${index}`)

async function mountMenu(overrides = {}) {
  wrapper = mount(ShortcutContextMenu, {
    attachTo: document.body,
    props: { item, dockItemIds: [], position: { left: 24, top: 48 }, ...overrides },
  })
  await nextTick()
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('ShortcutContextMenu', () => {
  it('focuses the first action and supports wrapping arrows, Home, and End', async () => {
    const menu = await mountMenu()
    const actions = menu.findAll<HTMLButtonElement>('[role="menuitem"]')
    expect(actions).toHaveLength(4)
    expect(document.activeElement).toBe(actions[0]!.element)
    expect(actions.map((action) => action.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(actions[3]!.element)
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(actions[0]!.element)
    await menu.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(actions[3]!.element)
    await menu.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(actions[0]!.element)
  })

  it('skips the disabled pin action in both directions when the Dock is full', async () => {
    const menu = await mountMenu({ dockItemIds: fullDock })
    const actions = menu.findAll<HTMLButtonElement>('[role="menuitem"]')
    expect(actions[2]!.element.disabled).toBe(true)
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(actions[1]!.element)
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(actions[3]!.element)
    expect(actions[3]!.attributes('tabindex')).toBe('0')
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(actions[1]!.element)
    expect(menu.emitted('close')).toBeUndefined()
  })

  it('keeps already pinned items removable even when the Dock is full', async () => {
    const menu = await mountMenu({ dockItemIds: [item.id, ...fullDock.slice(1)] })
    const pin = menu.findAll<HTMLButtonElement>('[role="menuitem"]')[2]!
    expect(pin.element.disabled).toBe(false)
    expect(pin.text()).toBe('从 Dock 移除')
    await pin.trigger('click')
    expect(menu.emitted('toggleDock')).toEqual([[]])
  })

  it('follows mouse focus when resuming keyboard navigation', async () => {
    const menu = await mountMenu()
    const actions = menu.findAll<HTMLButtonElement>('[role="menuitem"]')
    actions[2]!.element.focus()
    await nextTick()
    expect(actions[2]!.attributes('tabindex')).toBe('0')
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(actions[1]!.element)
  })

  it('forwards shortcut actions and uses the requested screen position', async () => {
    const menu = await mountMenu()
    expect(menu.attributes('style')).toContain('left: 24px')
    expect(menu.attributes('style')).toContain('top: 48px')
    const actions = menu.findAll('[role="menuitem"]')
    for (const action of actions) await action.trigger('click')
    for (const event of ['edit', 'copy', 'toggleDock', 'remove']) {
      expect(menu.emitted(event)).toEqual([[]])
    }
  })

  it('omits copying URLs for folders and navigates the remaining actions', async () => {
    const folder = { id: 'work', title: 'Work', shortcutIds: [shortcut.id], color: '#369', mark: 'W' }
    const menu = await mountMenu({ item: { ...folder, folder }, dockItemIds: fullDock })
    const actions = menu.findAll('[role="menuitem"]')
    expect(actions).toHaveLength(3)
    expect(actions[0]!.text()).toBe('编辑文件夹')
    expect(menu.text()).not.toContain('复制网址')
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(actions[2]!.element)
    expect(actions[2]!.text()).toBe('删除文件夹')
  })

  it('closes only when focus leaves the menu, not when moving between actions', async () => {
    const menu = await mountMenu()
    const actions = menu.findAll<HTMLButtonElement>('[role="menuitem"]')
    actions[1]!.element.focus()
    await nextTick()
    expect(menu.emitted('close')).toBeUndefined()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await nextTick()
    expect(menu.emitted('close')).toEqual([[]])
  })
})
