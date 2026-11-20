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
