// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note } from '../types'
import NotesPanel from './NotesPanel.vue'

let wrapper: VueWrapper | undefined
const notes: Note[] = [
  { id: 'first', title: '第一条', body: '第一条内容', updatedAt: 1 },
  { id: 'second', title: '第二条', body: '第二条内容', updatedAt: 2 },
]

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('NotesPanel', () => {
  it('offers creating a note from the empty state', async () => {
    wrapper = mount(NotesPanel, { props: { notes: [], activeId: '' } })
    expect(wrapper.get('.notes-empty').text()).toContain('新建一条笔记')
    expect(wrapper.find('.note-editor').exists()).toBe(false)
    expect(wrapper.get('.note-blank').text()).toContain('选择或新建')
    await wrapper.get('.note-add').trigger('click')
    expect(wrapper.emitted('add')).toEqual([[]])
  })

  it('renders the active note and forwards selection of another note', async () => {
    wrapper = mount(NotesPanel, { props: { notes, activeId: 'second' } })
    expect(wrapper.get<HTMLInputElement>('[aria-label="笔记标题"]').element.value).toBe('第二条')
    expect(wrapper.get('.note-list-item.active').text()).toContain('第二条')
    await wrapper.findAll('.note-list-item')[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['first']])
    await wrapper.setProps({ activeId: 'first' })
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="笔记内容"]').element.value).toBe('第一条内容')
  })

  it('falls back to the first note when the selected record disappears', async () => {
    wrapper = mount(NotesPanel, { props: { notes, activeId: 'second' } })
    await wrapper.setProps({ notes: [notes[0]!] })
    expect(wrapper.get<HTMLInputElement>('[aria-label="笔记标题"]').element.value).toBe('第一条')
    expect(wrapper.get('.note-list-item').classes()).toContain('active')
  })

  it('forwards title, body, and deletion events without modifying the input records', async () => {
    wrapper = mount(NotesPanel, { props: { notes, activeId: 'second' } })
    const title = wrapper.get('[aria-label="笔记标题"]')
    const body = wrapper.get('[aria-label="笔记内容"]')
    expect(title.attributes('maxlength')).toBe('500')
    expect(body.attributes('maxlength')).toBe('500000')
    await title.setValue('新标题')
    await body.setValue('第一行\n第二行 😀')
    await wrapper.get('[aria-label="删除笔记"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([
      ['second', 'title', '新标题'],
      ['second', 'body', '第一行\n第二行 😀'],
    ])
    expect(wrapper.emitted('remove')).toEqual([['second']])
    expect(notes[1]!.title).toBe('第二条')
    expect(notes[1]!.body).toBe('第二条内容')
  })

  it('labels untitled and empty notes without injecting their contents as HTML', () => {
    wrapper = mount(NotesPanel, {
      props: { notes: [{ id: 'blank', title: '', body: '', updatedAt: 0 }, { id: 'text', title: '<script>bad()</script>', body: '<b>text</b>', updatedAt: 1 }], activeId: 'blank' },
    })
    const rows = wrapper.findAll('.note-list-item')
    expect(rows[0]!.text()).toContain('未命名笔记')
    expect(rows[0]!.text()).toContain('空白笔记')
    expect(rows[1]!.text()).toContain('<script>bad()</script>')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
  })

  it('enforces the 500-note limit while leaving existing notes editable', async () => {
    const manyNotes = Array.from({ length: 500 }, (_, index) => ({ ...notes[0]!, id: `note-${index}` }))
    wrapper = mount(NotesPanel, { props: { notes: manyNotes, activeId: 'note-0' } })
    expect(wrapper.get<HTMLButtonElement>('.note-add').element.disabled).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('500 条笔记上限')
    expect(wrapper.get<HTMLInputElement>('[aria-label="笔记标题"]').element.disabled).toBe(false)
    await wrapper.setProps({ notes: manyNotes.slice(1) })
    expect(wrapper.get<HTMLButtonElement>('.note-add').element.disabled).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})


describe('NotesPanel search, sorting, and focus', () => {
  it('searches both title and body without silently changing the selected note', async () => {
    const searchable = [
      { ...notes[0]!, title: 'Release plan', body: 'English and 中文' },
      { ...notes[1]!, title: '想法', body: 'A NEEDLE in the body' },
    ]
    wrapper = mount(NotesPanel, { props: { notes: searchable, activeId: 'first' } })
    const search = wrapper.get('[aria-label="查找笔记"]')
    await search.setValue('  needle  ')
    expect(wrapper.findAll('.note-list-item')).toHaveLength(1)
    expect(wrapper.get('.note-list-item').text()).toContain('想法')
    expect(wrapper.get('.notes-result-count').text()).toBe('找到 1 / 2 条笔记')
    expect(wrapper.get<HTMLInputElement>('[aria-label="笔记标题"]').element.value).toBe('Release plan')
    expect(wrapper.emitted('select')).toBeUndefined()

    await search.setValue('RELEASE')
    expect(wrapper.get('.note-list-item.active').text()).toContain('Release plan')
    await search.setValue('中文')
    expect(wrapper.findAll('.note-list-item')).toHaveLength(1)
    await search.setValue('不存在')
    expect(wrapper.get('.collection-empty').text()).toContain('没有匹配')
    expect(wrapper.find('.note-editor').exists()).toBe(true)
    await wrapper.get('.collection-empty button').trigger('click')
    expect(wrapper.findAll('.note-list-item')).toHaveLength(2)
    expect(searchable[0]!.body).toBe('English and 中文')
  })

  it('sorts copies by update time or title and can return to the saved order', async () => {
    const records = [
      { id: 'z', title: 'Zulu', body: '', updatedAt: 5 },
      { id: 'a', title: 'Alpha', body: '', updatedAt: 10 },
      { id: 'b', title: 'Beta', body: '', updatedAt: 20 },
    ]
    wrapper = mount(NotesPanel, { props: { notes: records, activeId: 'z' } })
    const titles = () => wrapper!.findAll('.note-list-item strong').map((item) => item.text())
    const sort = wrapper.get('[aria-label="笔记排序"]')
    await sort.setValue('updated')
    expect(titles()).toEqual(['Beta', 'Alpha', 'Zulu'])
    await sort.setValue('title')
    expect(titles()).toEqual(['Alpha', 'Beta', 'Zulu'])
    await sort.setValue('original')
    expect(titles()).toEqual(['Zulu', 'Alpha', 'Beta'])
    expect(records.map((note) => note.id)).toEqual(['z', 'a', 'b'])
    expect(wrapper.get('.note-list-item.active').attributes('aria-current')).toBe('true')
  })

  it('clears search and selects the new title for immediate typing after creation', async () => {
    const created = { id: 'new', title: '', body: '', updatedAt: 3 }
    wrapper = mount(NotesPanel, {
      attachTo: document.body,
      props: {
        notes,
        activeId: 'first',
        onAdd: () => { void wrapper!.setProps({ notes: [created, ...notes], activeId: 'new' }) },
      },
    })
    await wrapper.get('[aria-label="查找笔记"]').setValue('无匹配')
    await wrapper.get('.note-add').trigger('click')
    const title = wrapper.get<HTMLInputElement>('[aria-label="笔记标题"]')
    expect(wrapper.get<HTMLInputElement>('[aria-label="查找笔记"]').element.value).toBe('')
    expect(wrapper.findAll('.note-list-item')).toHaveLength(3)
    expect(document.activeElement).toBe(title.element)
    expect(title.element.value).toBe('')
    expect(wrapper.get('.note-list-item.active').text()).toContain('未命名笔记')
  })

  it('bounds list previews without breaking Unicode and counts body code points', () => {
    const body = '字'.repeat(139) + '😀' + 'X'.repeat(1000)
    wrapper = mount(NotesPanel, {
      props: { notes: [{ id: 'unicode', title: '😀', body, updatedAt: 1 }], activeId: 'unicode' },
    })
    expect(wrapper.get('.note-list-item span').text()).toBe('字'.repeat(139) + '😀')
    expect(wrapper.get('.note-meta').text()).toContain('1140 字符')
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="笔记内容"]').element.value).toBe(body)
  })

  it('uses Escape to clear only a nonempty search before propagating it', async () => {
    wrapper = mount(NotesPanel, { props: { notes, activeId: 'first' } })
    let bubbled = 0
    wrapper.element.addEventListener('keydown', () => { bubbled += 1 })
    const search = wrapper.get('[aria-label="查找笔记"]')
    await search.setValue('无匹配')
    await search.trigger('keydown', { key: 'Escape' })
    expect(wrapper.findAll('.note-list-item')).toHaveLength(2)
    expect(bubbled).toBe(0)
    await search.trigger('keydown', { key: 'Escape' })
    expect(bubbled).toBe(1)
  })
})
