// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserBookmarkNode } from '../types'
import BookmarksPanel from './BookmarksPanel.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

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
    const importBookmarks = vi.fn().mockReturnValue({ added: 1 })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 10, importBookmarks } })
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
    const importBookmarks = vi.fn().mockReturnValue({ added: 1 })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 10, importBookmarks } })
    await flushPromises()
    expect(wrapper.text()).toContain('连接当前浏览器的书签')
    expect(request).not.toHaveBeenCalled()

    await wrapper.get('.bookmark-permission button').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['Vue Docs'])
    expect(wrapper.text()).not.toContain('Unsafe')
    expect(wrapper.text()).toContain('Empty Folder')

    await wrapper.get('input[aria-label="筛选浏览器书签"]').setValue('vuejs')
    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['Vue Docs'])
    await wrapper.get('[aria-label="添加Vue Docs到快捷入口"]').trigger('click')
    expect(wrapper.emitted('addShortcut')).toEqual([['Vue Docs', 'https://vuejs.org/']])
    await wrapper.get('[aria-label="选择Vue Docs"]').setValue(true)
    expect(wrapper.text()).toContain('已选 1 / 可添加 10')
    await wrapper.get('.bookmark-bulk-actions .button-primary').trigger('click')
    expect(importBookmarks).toHaveBeenCalledWith([{ title: 'Vue Docs', url: 'https://vuejs.org/' }])
    expect(wrapper.text()).toContain('已导入 1 个快捷入口')
  })

  it('keeps a large expanded bookmark tree searchable', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    const bookmarks = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index + 2), title: `Site ${index}`, url: `https://site-${index}.example/`,
    }))
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn() },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks Bar', children: bookmarks }] }]),
        onCreated: bookmarkChange,
      },
    })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 500, importBookmarks: vi.fn() } })
    await flushPromises()

    expect(wrapper.findAll('.browser-bookmark-list > li')).toHaveLength(1_001)
    expect(wrapper.findAll('.browser-bookmark-link')).toHaveLength(1_000)
    await wrapper.get('input[aria-label="筛选浏览器书签"]').setValue('Site 999')
    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['Site 999'])
  })

  it('searches deeply nested folders without overflowing the call stack', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    let nested: BrowserBookmarkNode = { id: 'deep-link', title: 'Deep link', url: 'https://deep.example/' }
    for (let index = 2_500; index > 0; index -= 1) {
      nested = { id: `folder-${index}`, title: `Folder ${index}`, children: [nested] }
    }
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn() },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: '0', title: '', children: [nested] }]),
        onCreated: bookmarkChange,
      },
    })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 500, importBookmarks: vi.fn() } })
    await flushPromises()

    await wrapper.get('input[aria-label="筛选浏览器书签"]').setValue('no matching bookmark')

    expect(wrapper.text()).toContain('没有匹配的书签')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('limits selection to available slots and reports capacity changes before importing', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    const getTree = vi.fn().mockResolvedValue([{ id: '0', title: '', children: [
      { id: 'one', title: 'One', url: 'https://one.example/' },
      { id: 'two', title: 'Two', url: 'https://two.example/' },
    ] }])
    const importBookmarks = vi.fn().mockReturnValue({ added: 1 })
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn() },
      bookmarks: { getTree, onCreated: bookmarkChange },
    })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 1, importBookmarks } })
    await flushPromises()

    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
    expect((wrapper.findAll('input[type="checkbox"]')[1]!.element as HTMLInputElement).disabled).toBe(true)
    await wrapper.get('button.button-primary').trigger('click')
    expect(importBookmarks).toHaveBeenCalledWith([{ title: 'One', url: 'https://one.example/' }])
  })

  it('lets users clear hidden selections if another tab reduces the available capacity', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    const getTree = vi.fn().mockResolvedValue([{ id: '0', title: '', children: [
      { id: 'one', title: 'One', url: 'https://one.example/' },
      { id: 'two', title: 'Two', url: 'https://two.example/' },
    ] }])
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn() },
      bookmarks: { getTree, onCreated: bookmarkChange },
    })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 2, importBookmarks: vi.fn() } })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await wrapper.get('[aria-label="选择One"]').setValue(true)
    await wrapper.get('[aria-label="选择Two"]').setValue(true)
    await wrapper.get('input[aria-label="筛选浏览器书签"]').setValue('One')
    await wrapper.setProps({ availableSlots: 1 })

    expect(wrapper.findAll('.browser-bookmark-link').map((link) => link.text())).toEqual(['One'])
    expect(wrapper.get('.bookmark-bulk-actions .button-primary').element).toHaveProperty('disabled', true)
    await wrapper.get('[aria-label="清空书签选择"]').trigger('click')

    expect(wrapper.text()).toContain('已选 0 / 可添加 1')
    expect(wrapper.get('.bookmark-bulk-actions .button-primary').element).toHaveProperty('disabled', true)
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
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 500, importBookmarks: vi.fn() } })
    await flushPromises()
    expect(wrapper.find('.browser-bookmark-link').exists()).toBe(true)

    permissionRemoved.fire()
    await flushPromises()
    expect(wrapper.find('.browser-bookmark-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('连接当前浏览器的书签')
  })

  it('ignores an old permission check that finishes after permission was revoked', async () => {
    const oldPermissionCheck = deferred<boolean>()
    const permissionRemoved = {
      listeners: new Set<(...args: unknown[]) => void>(),
      addListener(listener: (...args: unknown[]) => void) { this.listeners.add(listener) },
      removeListener(listener: (...args: unknown[]) => void) { this.listeners.delete(listener) },
      fire() { this.listeners.forEach((listener) => listener()) },
    }
    const contains = vi.fn().mockReturnValueOnce(oldPermissionCheck.promise).mockResolvedValueOnce(false)
    const getTree = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains, request: vi.fn(), onRemoved: permissionRemoved },
      bookmarks: { getTree, onCreated: { addListener: vi.fn(), removeListener: vi.fn() } },
    })
    wrapper = mount(BookmarksPanel, { props: { availableSlots: 500, importBookmarks: vi.fn() } })
    permissionRemoved.fire()
    await flushPromises()
    oldPermissionCheck.resolve(true)
    await flushPromises()

    expect(wrapper.text()).toContain('连接当前浏览器的书签')
    expect(wrapper.find('.browser-bookmark-link').exists()).toBe(false)
    expect(getTree).not.toHaveBeenCalled()
  })
})
