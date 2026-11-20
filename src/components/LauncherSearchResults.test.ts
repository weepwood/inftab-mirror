// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LauncherSearchResults from './LauncherSearchResults.vue'
import type { LauncherItem } from '../types'

let wrapper: VueWrapper | undefined
const site = (id: string, title = `Docs ${id}`): LauncherItem => ({ id, title, color: '#467d68', mark: 'D', shortcut: { id, title, url: `https://${id}.example/`, color: '#467d68', mark: 'D' } })
const props = {
  query: 'Docs', items: [site('local'), site('remote')], folders: [], hiddenItemIds: [], activeWorkspaceId: 'default',
  workspaces: [{ id: 'default', name: '主页', itemIds: ['local'] }, { id: 'work', name: '工作', itemIds: ['remote'] }],
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('launcher search results', () => {
  it('offers local scopes, creation actions and keyboard guidance even before typing', async () => {
    wrapper = mount(LauncherSearchResults, { props: { ...props, query: '' } })
    expect(wrapper.get('[aria-label="查找范围"] button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect(wrapper.get('#launcher-search-help').text()).toContain('搜索词不离开本机')
    await wrapper.get('.launcher-search-actions button').trigger('click')
    await wrapper.findAll('.launcher-search-actions button')[1]!.trigger('click')
    expect(wrapper.emitted('addShortcut')).toHaveLength(1)
    expect(wrapper.emitted('addFolder')).toHaveLength(1)
  })

  it('shows workspace context without changing scope or opening anything until selected', async () => {
    wrapper = mount(LauncherSearchResults, { props })
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
    await wrapper.findAll('[aria-label="查找范围"] button')[1]!.trigger('click')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2)
    expect(wrapper.get('[aria-label="工作 · Docs remote"]').text()).toContain('工作')
    expect(wrapper.get('.launcher-search-count').text()).toBe('2 项结果')
    expect(wrapper.emitted('open')).toBeUndefined()
    await wrapper.get('[aria-label="工作 · Docs remote"]').trigger('click', { ctrlKey: true })
    const [match, event] = wrapper.emitted('open')![0]!
    expect(match).toMatchObject({ workspaceId: 'work', item: { id: 'remote' } })
    expect(event).toMatchObject({ ctrlKey: true })
  })

  it('forwards middle-click opening from the highest-ranked visible match', async () => {
    wrapper = mount(LauncherSearchResults, { props })
    await wrapper.get('[role="option"]').trigger('auxclick', { button: 1 })
    expect(wrapper.emitted('open')![0]![1]).toMatchObject({ button: 1 })
    expect(wrapper.emitted('open')![0]![0]).toMatchObject({ item: { id: 'local' } })
  })

  it('supports result navigation and a keyboard round trip back to the input', async () => {
    wrapper = mount(LauncherSearchResults, { attachTo: document.body, props })
    await wrapper.findAll('[aria-label="查找范围"] button')[1]!.trigger('click')
    const results = wrapper.findAll<HTMLButtonElement>('[role="option"]')
    results[0]!.element.focus()
    await results[0]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(results[1]!.element)
    await results[1]!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(results[0]!.element)
    await results[0]!.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('focusSearch')).toHaveLength(1)
    await results[0]!.trigger('keydown', { key: 'ArrowDown', isComposing: true })
    expect(document.activeElement).toBe(results[0]!.element)
  })

  it('paginates large result sets locally and resets the visible count for a new query', async () => {
    const items = Array.from({ length: 26 }, (_, index) => site(`entry-${index}`))
    wrapper = mount(LauncherSearchResults, { props: { ...props, items, workspaces: [{ id: 'default', name: '主页', itemIds: items.map(({ id }) => id) }] } })
    expect(wrapper.findAll('[role="option"]')).toHaveLength(12)
    expect(wrapper.get('.launcher-search-count').text()).toBe('26 项结果')
    await wrapper.get('.launcher-search-more').trigger('click')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(24)
    await wrapper.setProps({ query: 'docs entry-' })
    expect(wrapper.findAll('[role="option"]')).toHaveLength(12)
    await wrapper.setProps({ query: 'not-found' })
    expect(wrapper.get('.launcher-search-empty').text()).toContain('没有匹配')
    expect(wrapper.find('.launcher-search-more').exists()).toBe(false)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('drops removed workspace results instead of keeping a stale selectable match', async () => {
    wrapper = mount(LauncherSearchResults, { props })
    await wrapper.findAll('[aria-label="查找范围"] button')[1]!.trigger('click')
    await wrapper.setProps({ workspaces: [props.workspaces[0]!] })
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Docs remote')
  })

  it('opens above a low search box and repositions after scrolling, cleaning its listeners', async () => {
    const host = document.createElement('section')
    host.className = 'search-area'
    host.innerHTML = '<div class="search-box"></div><div id="mount"></div>'
    document.body.appendChild(host)
    const bounds = { top: 650, bottom: 700, x: 0, y: 650, left: 0, right: 300, width: 300, height: 50, toJSON: () => ({}) }
    const rect = vi.spyOn(host.querySelector('.search-box')!, 'getBoundingClientRect').mockReturnValue(bounds)
    const remove = vi.spyOn(window, 'removeEventListener')
    wrapper = mount(LauncherSearchResults, { attachTo: host.querySelector('#mount')!, props })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.launcher-search').attributes('style')).toContain('bottom: calc(100% + 8px)')
    rect.mockReturnValue({ ...bounds, top: 50, bottom: 100 })
    window.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.launcher-search').attributes('style')).toContain('top: calc(100% + 8px)')
    wrapper.unmount()
    wrapper = undefined
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
