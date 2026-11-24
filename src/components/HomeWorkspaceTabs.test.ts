// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomeWorkspaceTabs from './HomeWorkspaceTabs.vue'

let wrapper: VueWrapper | undefined
const workspaces = [
  { id: 'default', name: '主页', itemIds: [] },
  { id: 'work', name: '工作', itemIds: [] },
  { id: 'tools', name: '工具', itemIds: [] },
]
const createWorkspace = vi.fn(() => true)
const renameWorkspace = vi.fn(() => true)
function setup(items = workspaces) {
  wrapper = mount(HomeWorkspaceTabs, { attachTo: document.body, props: { workspaces: items, activeId: 'work', createWorkspace, renameWorkspace } })
  return wrapper
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.clearAllMocks(); document.body.innerHTML = '' })

describe('HomeWorkspaceTabs', () => {
  it('shows the current name and opens only on click; selecting closes and restores focus', async () => {
    const w = setup()
    const trigger = w.get('.home-workspace-trigger')
    expect(trigger.text()).toContain('工作')
    await trigger.trigger('focus')
    expect(w.find('.workspace-panel').exists()).toBe(false)
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(w.get('[data-workspace-tab="work"]').attributes('aria-pressed')).toBe('true')
    expect(w.get('[data-workspace-tab="tools"]').text()).toContain('工具')
    await w.get('[data-workspace-tab="tools"]').trigger('click')
    expect(w.emitted('select')).toEqual([['tools']])
    expect(w.find('.workspace-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })
  it('supports keyboard focus movement without switching and layered Escape', async () => {
    const w = setup()
    await w.get('.home-workspace-trigger').trigger('click')
    const work = w.get('[data-workspace-tab="work"]')
    expect(document.activeElement).toBe(work.element)
    await work.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(w.get('[data-workspace-tab="tools"]').element)
    expect(w.emitted('select')).toBeUndefined()
    await w.get('[data-workspace-action="default"]').trigger('click')
    expect(document.activeElement?.textContent).toContain('重命名')
    const buttons = w.findAll('[role="menuitem"]')
    expect(buttons.slice(1).every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    await buttons[0]!.trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(w.get('[data-workspace-action="default"]').element)
    await w.get('[data-workspace-action="default"]').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(w.get('.home-workspace-trigger').element)
  })
  it('validates creation and reports failed saves without losing the draft', async () => {
    const w = setup()
    await w.get('.home-workspace-trigger').trigger('click')
    await w.get('.workspace-create').trigger('click')
    await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('请输入')
    await w.get('input').setValue('工作')
    await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('已被使用')
    await w.get('input').setValue('😀'.repeat(41))
    await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('40')
    createWorkspace.mockReturnValueOnce(false)
    await w.get('input').setValue('设计')
    await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('创建失败')
    await w.get('form').trigger('submit')
    expect(createWorkspace).toHaveBeenLastCalledWith('设计')
    expect(w.find('.workspace-panel').exists()).toBe(false)
  })
  it('renames, moves and removes through visible actions', async () => {
    const w = setup()
    await w.get('.home-workspace-trigger').trigger('click')
    await w.get('[data-workspace-action="tools"]').trigger('click')
    await w.findAll('[role="menuitem"]')[0]!.trigger('click')
    await w.get('input').setValue('项目')
    await w.get('form').trigger('submit')
    expect(renameWorkspace).toHaveBeenCalledWith('tools', '项目')
    await w.get('[data-workspace-action="tools"]').trigger('click')
    await w.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(w.emitted('move')).toEqual([['tools', -1]])
    await w.get('[data-workspace-action="tools"]').trigger('click')
    await w.findAll('[role="menuitem"]')[3]!.trigger('click')
    expect(w.emitted('remove')).toEqual([['tools']])
    expect(document.activeElement).toBe(w.get('.home-workspace-trigger').element)
  })
  it('filters many workspaces and explains the limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, name: `工作区 ${i}`, itemIds: [] }))
    const w = setup(many)
    await w.get('.home-workspace-trigger').trigger('click')
    await w.get('[aria-label="查找工作区"]').setValue('19')
    expect(w.findAll('[data-workspace-tab]')).toHaveLength(1)
    expect(w.get('[data-workspace-tab]').text()).toContain('19')
    expect(w.get('.workspace-create').attributes('disabled')).toBeDefined()
    expect(w.get('.workspace-create').text()).toContain('上限')
    await w.get('[aria-label="查找工作区"]').setValue('不存在')
    expect(w.get('.workspace-no-results').text()).toContain('没有找到')
  })
  it('closes when a pointer is pressed outside', async () => {
    const w = setup()
    await w.get('.home-workspace-trigger').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(w.find('.workspace-panel').exists()).toBe(false)
  })
})


it('saves only the current workspace layout and supports reverting to global', async () => {
  const saveLayout = vi.fn(() => true)
  wrapper = mount(HomeWorkspaceTabs, { attachTo: document.body, props: { workspaces, activeId: 'work', createWorkspace, renameWorkspace, globalLayout: { columns: 6, rows: 3, iconSize: 72, iconRadius: 16, showNames: true }, saveLayout } })
  await wrapper.get('.home-workspace-trigger').trigger('click')
  await wrapper.get('.workspace-layout-edit').trigger('click')
  await wrapper.get('input[type=range]').setValue('4')
  await wrapper.get('.workspace-layout-form').trigger('submit')
  expect(saveLayout).toHaveBeenCalledWith('work', { columns: 4, rows: 3, iconSize: 72, iconRadius: 16, showNames: true })
  await wrapper.get('.home-workspace-trigger').trigger('click')
  await wrapper.get('.workspace-layout-edit').trigger('click')
  await wrapper.findAll('.workspace-layout-form button')[0]!.trigger('click')
  expect(saveLayout).toHaveBeenLastCalledWith('work', undefined)
})
