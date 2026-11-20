// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as images from '../data/images'
import ShortcutEditor from './ShortcutEditor.vue'

let wrapper: VueWrapper
async function mountEditor(overrides: Record<string, unknown> = {}) {
  wrapper = mount(ShortcutEditor, {
    attachTo: document.body,
    props: {
      initialWorkspaceId: 'work',
      workspaces: [{ id: 'default', name: '主页', itemIds: [] }, { id: 'work', name: '工作', itemIds: [] }],
      ...overrides,
    },
  })
  await nextTick()
  return wrapper
}
async function fillRequired() {
  await wrapper.get('#shortcut-name').setValue('Example')
  await wrapper.get('#shortcut-url').setValue('example.com')
}
async function submit() {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
async function upload(file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shortcut editor fields and validation', () => {
  it('starts with the required information, native disclosure and labeled platform controls', async () => {
    await mountEditor()
    expect(document.activeElement).toBe(wrapper.get('#shortcut-name').element)
    expect(wrapper.get('details').element).toHaveProperty('open', false)
    expect(wrapper.get('summary').text()).toContain('图标与外观')
    expect(wrapper.get('form').attributes()).toHaveProperty('novalidate')
    expect(wrapper.get('#shortcut-name').attributes()).toMatchObject({ maxlength: '80', required: '' })
    expect(wrapper.get('#shortcut-url').attributes()).toMatchObject({ type: 'url', inputmode: 'url', maxlength: '2048', spellcheck: 'false' })
    expect(wrapper.get('label[for="shortcut-workspace"]').text()).toBe('所属工作区')
    expect(wrapper.get('#shortcut-workspace').element).toHaveProperty('value', 'work')
    expect(wrapper.get('button[type="submit"]').element).toHaveProperty('disabled', false)
  })

  it('does not focus an editable field when the pointer is coarse', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await mountEditor()
    expect(document.activeElement).not.toBe(wrapper.get('#shortcut-name').element)
  })

  it('validates whitespace on submit, describes both errors and focuses the first field', async () => {
    await mountEditor()
    await wrapper.get('#shortcut-name').setValue('   ')
    await submit()
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('#shortcut-name').attributes()).toMatchObject({ 'aria-invalid': 'true', 'aria-describedby': 'shortcut-name-error' })
    expect(wrapper.get('#shortcut-url').attributes('aria-describedby')).toContain('shortcut-url-error')
    expect(wrapper.get('#shortcut-name-error').text()).toContain('请输入快捷入口名称')
    expect(document.activeElement).toBe(wrapper.get('#shortcut-name').element)
    await wrapper.get('#shortcut-name').setValue('Fixed')
    expect(wrapper.get('#shortcut-name').attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.find('#shortcut-name-error').exists()).toBe(false)
    expect(wrapper.get('#shortcut-url').attributes('aria-invalid')).toBe('true')
  })

  it.each(['javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com', 'https://'])('rejects %s and focuses its recovery instruction', async (url) => {
    await mountEditor()
    await wrapper.get('#shortcut-name').setValue('Example')
    await wrapper.get('#shortcut-url').setValue(url)
    await submit()
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('#shortcut-url').element)
    expect(wrapper.get('#shortcut-url-error').text()).toContain('https://example.com')
  })

  it('normalizes bare domains and preserves the existing Unicode mark contract', async () => {
    await mountEditor()
    await wrapper.get('#shortcut-name').setValue('  😀小站  ')
    await wrapper.get('#shortcut-url').setValue('example.com/path?q=a+b')
    await submit()
    const [shortcut, workspace] = wrapper.emitted('save')![0]!
    expect(shortcut).toMatchObject({ title: '😀小站', url: 'https://example.com/path?q=a+b', mark: '😀小', color: '#3d82f6' })
    expect(workspace).toBe('work')
  })

  it('does not submit an input-method confirmation', async () => {
    await mountEditor()
    await fillRequired()
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
    wrapper.get('#shortcut-name').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('edits an existing item without changing its id or mutating incoming data', async () => {
    const shortcut = { id: 'existing', title: 'Old', url: 'https://old.example/', mark: 'O', color: '#467d68', icon: 'existing.png' }
    await mountEditor({ shortcut })
    await wrapper.get('#shortcut-name').setValue('New')
    await wrapper.get('#shortcut-workspace').setValue('default')
    await submit()
    expect(wrapper.emitted('save')![0]).toEqual([{ ...shortcut, title: 'New' }, 'default'])
    expect(shortcut.title).toBe('Old')
    expect(shortcut.icon).toBe('existing.png')
  })

  it('keeps bookmark-prefilled entries in creation mode without inventing an id', async () => {
    await mountEditor({ shortcut: { title: 'Vue Docs', url: 'https://vuejs.org/' } })
    await submit()
    expect(wrapper.emitted('save')![0]![0]).toMatchObject({ title: 'Vue Docs', url: 'https://vuejs.org/', id: expect.any(String) })
  })

  it('announces a save failure, focuses the form error and retains the draft', async () => {
    await mountEditor()
    await fillRequired()
    await wrapper.setProps({ saveError: '最多只能保存 500 个快捷入口，可先删除不用的入口。' })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('.shortcut-form-error').element)
    expect(wrapper.get('#shortcut-name').element).toHaveProperty('value', 'Example')
  })

  it('uses the remaining default workspace if another tab removes the selected workspace', async () => {
    await mountEditor()
    await fillRequired()
    await wrapper.setProps({ workspaces: [{ id: 'default', name: '主页', itemIds: [] }] })
    await submit()
    expect(wrapper.emitted('save')![0]![1]).toBe('default')
  })

  it('keeps an explanation and disables creation only at the existing item limit', async () => {
    await mountEditor({ limitReached: true })
    await fillRequired()
    await submit()
    expect(wrapper.get('button[type="submit"]').element).toHaveProperty('disabled', true)
    expect(wrapper.get('[role="alert"]').text()).toContain('可先删除不用的入口')
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})

describe('shortcut editor image feedback', () => {
  it('previews local inline images but never fetches a pasted image URL', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    await mountEditor()
    await wrapper.get('#shortcut-name').setValue('😀本地')
    expect(wrapper.get('.shortcut-icon-preview').text()).toBe('😀本')
    await wrapper.get('#shortcut-icon').setValue('https://images.example/icon.png')
    expect(wrapper.find('.shortcut-icon-preview img').exists()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    const local = 'data:image/png;base64,bG9jYWw='
    await wrapper.get('#shortcut-icon').setValue(local)
    expect(wrapper.get('.shortcut-icon-preview img').attributes('src')).toBe(local)
    await wrapper.get('.shortcut-icon-preview img').trigger('error')
    expect(wrapper.find('.shortcut-icon-preview img').exists()).toBe(false)
    expect(wrapper.get('.shortcut-icon-preview').text()).toBe('😀本')
  })

  it('reveals a collapsed image error and focuses the associated input', async () => {
    await mountEditor()
    await fillRequired()
    await wrapper.get('#shortcut-icon').setValue('https://user:password@images.example/icon.png')
    await submit()
    expect(wrapper.get('details').element).toHaveProperty('open', true)
    expect(document.activeElement).toBe(wrapper.get('#shortcut-icon').element)
    expect(wrapper.get('#shortcut-icon').attributes('aria-describedby')).toContain('shortcut-icon-error')
    expect(wrapper.get('#shortcut-icon-error').text()).toContain('上传本地图片')
  })

  it('keeps the busy save button focusable and prevents duplicate remote requests', async () => {
    let resolve!: (value: string) => void
    const download = vi.spyOn(images, 'fetchAndCompressImage').mockImplementation(() => new Promise((done) => { resolve = done }))
    await mountEditor()
    await fillRequired()
    await wrapper.get('#shortcut-icon').setValue('//images.example/icon.png')
    await submit()
    const save = wrapper.get('button[type="submit"]')
    expect(save.attributes('aria-disabled')).toBe('true')
    expect(save.element).toHaveProperty('disabled', false)
    expect(document.activeElement).toBe(save.element)
    expect(wrapper.get('[role="status"]').text()).toContain('正在转存图标')
    await submit()
    expect(download).toHaveBeenCalledExactlyOnceWith('https://images.example/icon.png', 192)
    resolve('data:image/webp;base64,bG9jYWw=')
    await flushPromises()
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('recovers a failed remote image without losing required fields or disabling retry', async () => {
    vi.spyOn(images, 'fetchAndCompressImage').mockRejectedValue(new TypeError('Failed to fetch'))
    await mountEditor()
    await fillRequired()
    await wrapper.get('#shortcut-icon').setValue('https://images.example/icon.png')
    await submit()
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.get('#shortcut-name').element).toHaveProperty('value', 'Example')
    expect(wrapper.get('#shortcut-icon-error').text()).toContain('上传本地图片')
    expect(document.activeElement).toBe(wrapper.get('#shortcut-icon').element)
    expect(wrapper.get('button[type="submit"]').attributes('aria-disabled')).toBeUndefined()
    await wrapper.get('.icon-file-actions .text-button').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('#shortcut-icon').element)
    expect(wrapper.get('#shortcut-icon').element).toHaveProperty('value', '')
    await submit()
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('links oversized upload errors to a recovery control', async () => {
    await mountEditor()
    const file = new File(['icon'], 'oversized.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 })
    await upload(file)
    expect(wrapper.get('#shortcut-icon-error').text()).toContain('请选择更小的图片')
    expect(wrapper.get('.icon-file-actions button').attributes('aria-describedby')).toContain('shortcut-icon-error')
  })

  it('turns a browser decode exception into a local-language recovery instruction', async () => {
    vi.spyOn(images, 'compressImageBlob').mockRejectedValue(new DOMException('The source image could not be decoded.', 'InvalidStateError'))
    await mountEditor()
    await upload(new File(['corrupt'], 'corrupt.png', { type: 'image/png' }))
    expect(wrapper.get('#shortcut-icon-error').text()).toBe('无法处理这张图片，请换一张后重试。')
    expect(wrapper.get('button[type="submit"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('does not overwrite a newer image choice when an older upload finishes', async () => {
    let resolve!: (value: string) => void
    vi.spyOn(images, 'compressImageBlob').mockImplementation(() => new Promise((done) => { resolve = done }))
    await mountEditor()
    await upload(new File(['icon'], 'icon.png', { type: 'image/png' }))
    expect(wrapper.get('[role="status"]').text()).toContain('正在压缩图片')
    await wrapper.get('#shortcut-icon').setValue('replacement.png')
    resolve('data:image/webp;base64,b2xk')
    await flushPromises()
    expect(wrapper.get('#shortcut-icon').element).toHaveProperty('value', 'replacement.png')
    expect(wrapper.get('button[type="submit"]').attributes('aria-disabled')).toBeUndefined()
  })
})
