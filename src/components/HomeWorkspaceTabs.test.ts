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

  it('emits a workspace move request from the accessible reorder control', async () => {
    wrapper = mount(HomeWorkspaceTabs, { props: { workspaces, activeId: 'notes' } })

    await wrapper.get('[aria-label="将笔记左移"]').trigger('click')

    expect(wrapper.emitted('move')).toEqual([['notes', -1]])
    expect(wrapper.get('[aria-label="将笔记左移"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[aria-label="将笔记右移"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ activeId: 'default' })
    expect(wrapper.get('[aria-label="将主页左移"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="将主页右移"]').attributes('disabled')).toBeDefined()
  })
})
