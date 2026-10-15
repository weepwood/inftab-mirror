// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import HomeWorkspaceTabs from './HomeWorkspaceTabs.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

const workspaces = [
  { id: 'default', name: '主页', itemIds: [] },
  { id: 'reading-list', name: '阅读', itemIds: [] },
  { id: 'notes', name: '笔记', itemIds: [] },
]

describe('HomeWorkspaceTabs', () => {
  it('exposes the active workspace as a pressed button in a labeled group', () => {
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces, activeId: 'default' } })

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('切换工作区')
    expect(wrapper.get('[data-workspace-tab="default"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-workspace-tab="reading-list"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[role="tablist"], [role="tab"]').exists()).toBe(false)
    expect(wrapper.get('.home-workspace-bar').classes()).not.toContain('is-open')
    expect(wrapper.get('.home-workspace-trigger').attributes('aria-expanded')).toBe('false')
  })

  it('opens the quarter-circle menu from the corner trigger', async () => {
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces, activeId: 'default' } })

    await wrapper.get('.home-workspace-trigger').trigger('click')

    expect(wrapper.get('.home-workspace-bar').classes()).toContain('is-open')
    expect(wrapper.get('.home-workspace-trigger').attributes('aria-expanded')).toBe('true')
    // Each workspace has one slot; the trigger itself becomes the create button.
    const slots = wrapper.findAll('.home-workspace-slot')
    expect(slots).toHaveLength(workspaces.length)
    for (const slot of slots) {
      expect(slot.attributes('style')).toContain('--a:')
      expect(slot.attributes('style')).toContain('--r-open:')
    }
  })

  it('turns the open trigger into a create action and points it toward hovered workspaces', async () => {
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces, activeId: 'default' } })
    const trigger = wrapper.get('.home-workspace-trigger')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-label')).toBe('新建工作区')
    await trigger.trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)

    await wrapper.get('[data-workspace-tab="reading-list"]').trigger('pointerenter')
    expect(wrapper.get('.home-workspace-bar').classes()).toContain('is-pointing')
    expect(trigger.attributes('aria-label')).toBe('指向工作区')
  })

  it('fills each ring before expanding outward, up to four rings', async () => {
    const manyWorkspaces = Array.from({ length: 20 }, (_, index) => ({
      id: index === 0 ? 'default' : `workspace-${index}`,
      name: `工作区 ${index}`,
      itemIds: [],
    }))
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces: manyWorkspaces.slice(0, 2), activeId: 'default' } })

    const countsFor = () => {
      const counts = new Map<number, number>()
      for (const slot of wrapper!.findAll('.home-workspace-slot')) {
        const ring = Number(slot.attributes('style')?.match(/--ring:\s*(\d+)/)?.[1])
        counts.set(ring, (counts.get(ring) ?? 0) + 1)
      }
      return [...counts.values()]
    }

    expect(countsFor()).toEqual([2])
    for (const [workspaceCount, expected] of [
      [3, [3]],
      [4, [3, 1]],
      [7, [3, 4]],
      [8, [3, 4, 1]],
      [13, [3, 4, 6]],
      [14, [3, 4, 6, 1]],
      [20, [3, 4, 6, 7]],
    ] as const) {
      await wrapper.setProps({ workspaces: manyWorkspaces.slice(0, workspaceCount), activeId: 'default' })
      expect(countsFor()).toEqual(expected)
    }
  })

  it('moves selection and keyboard focus with horizontal arrow keys', async () => {
    wrapper = mount(HomeWorkspaceTabs, { attachTo: document.body, props: { workspaces, activeId: 'default' } })
    const current = wrapper.get('[data-workspace-tab="default"]')
    const next = wrapper.get('[data-workspace-tab="reading-list"]')

    await current.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    expect(wrapper.emitted('select')).toEqual([['reading-list']])
    expect(document.activeElement).toBe(next.element)
  })

  it('offers rename, move and delete from each chip context menu', async () => {
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces, activeId: 'notes' } })

    // The menu only appears on demand.
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await wrapper.get('[data-workspace-tab="notes"]').trigger('contextmenu')

    const menu = wrapper.get('[role="menu"]')
    expect(menu.attributes('aria-label')).toBe('笔记 的操作')
    expect(menu.get('.context-menu-title').text()).toBe('笔记')
    let items = menu.findAll('[role="menuitem"]')
    expect(items[0].text()).toContain('重命名')
    // 笔记 is last, so it can move left but not right.
    expect(items[1].attributes('disabled')).toBeUndefined()
    expect(items[2].attributes('disabled')).toBeDefined()

    await items[1].trigger('click')
    expect(wrapper.emitted('move')).toEqual([['notes', -1]])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    // 主页 is pinned first, so it can neither move nor be deleted.
    await wrapper.get('[data-workspace-tab="default"]').trigger('contextmenu')
    items = wrapper.findAll('[role="menuitem"]')
    expect(items[1].attributes('disabled')).toBeDefined()
    expect(items[2].attributes('disabled')).toBeDefined()
    expect(items[3].attributes('disabled')).toBeDefined()
  })
})
