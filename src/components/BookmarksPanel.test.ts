// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BookmarksPanel from './BookmarksPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('BookmarksPanel', () => {
  it('explains that browser bookmarks are extension-only on the website', () => {
    vi.stubGlobal('chrome', undefined)
    wrapper = mount(BookmarksPanel)
    expect(wrapper.text()).toContain('此功能需要浏览器扩展')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('requests permission on demand, filters bookmarks, and excludes script URLs', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    const request = vi.fn().mockResolvedValue(true)
    const getTree = vi.fn().mockResolvedValue([{
      id: '0',
      title: '',
      children: [{
        id: '1',
        title: 'Bookmarks Bar',
        children: [
          { id: '2', title: 'Vue Docs', url: 'https://vuejs.org/' },
          { id: '3', title: 'Unsafe', url: 'javascript:alert(1)' },
          { id: '4', title: 'Empty Folder', children: [] },
        ],
      }],
    }])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(false), request },
      bookmarks: {
        getTree,
        onCreated: bookmarkChange,
        onChanged: bookmarkChange,
        onMoved: bookmarkChange,
        onRemoved: bookmarkChange,
        onChildrenReordered: bookmarkChange,
        onImportEnded: bookmarkChange,
      },
    })
    wrapper = mount(BookmarksPanel)
    await flushPromises()
    expect(wrapper.text()).toContain('连接当前浏览器的书签')
    expect(request).not.toHaveBeenCalled()

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['Vue Docs'])
    expect(wrapper.text()).not.toContain('Unsafe')
    expect(wrapper.text()).toContain('Empty Folder')

    await wrapper.get('input[aria-label="筛选浏览器书签"]').setValue('vuejs')
    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['Vue Docs'])
  })

  it('clears the visible bookmark data when permission is revoked while open', async () => {
    const permissionRemoved = {
      listeners: new Set<(...args: unknown[]) => void>(),
      addListener(listener: (...args: unknown[]) => void) { this.listeners.add(listener) },
      removeListener(listener: (...args: unknown[]) => void) { this.listeners.delete(listener) },
      fire() { this.listeners.forEach((listener) => listener()) },
    }
    const contains = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains, request: vi.fn(), onRemoved: permissionRemoved },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: '0', title: '', children: [{ id: '2', title: 'Vue Docs', url: 'https://vuejs.org/' }] }]),
        onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    })
    wrapper = mount(BookmarksPanel)
    await flushPromises()
    expect(wrapper.find('.browser-bookmark-link').exists()).toBe(true)

    permissionRemoved.fire()
    await flushPromises()
    expect(wrapper.find('.browser-bookmark-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('连接当前浏览器的书签')
  })
})
