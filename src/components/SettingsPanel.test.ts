// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from '../data/defaults'
import SettingsPanel from './SettingsPanel.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SettingsPanel theme preference', () => {
  it('emits the selected light, dark, or system theme', async () => {
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })

    await wrapper.get('select[aria-label=\"颜色主题\"]').setValue('dark')

    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ themeMode: 'dark' })
  })
})

describe('SettingsPanel local wallpaper upload', () => {
  it('compresses a selected image and emits it as an offline wallpaper', async () => {
    const bitmap = { width: 4000, height: 2000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['webp-image'], { type: 'image/webp' })))
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })

    const file = new File(['original-image'], 'wallpaper.png', { type: 'image/png' })
    const input = wrapper.get('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
    const inputElement = input.element as HTMLInputElement
    Object.defineProperty(inputElement, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper?.emitted('update')).toBeDefined())
    await flushPromises()

    expect(inputElement.files?.[0]?.name).toBe('wallpaper.png')
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledOnce()
    const update = wrapper.emitted('update')?.at(-1)?.[0] as { customWallpaper?: string }
    expect(update.customWallpaper).toMatch(/^data:image\/webp;base64,/)
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('clears the local wallpaper when the user removes it', async () => {
    wrapper = mount(SettingsPanel, {
      props: { preferences: { ...defaultPreferences, customWallpaper: 'data:image/webp;base64,YWJj' } },
    })
    await wrapper.findAll('button').find((button) => button.text().trim() === '移除本地壁纸')!.trigger('click')
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ customWallpaper: '' })
  })
})

describe('SettingsPanel custom search engines', () => {
  it('validates an HTTPS query template and emits a custom search engine', async () => {
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences }, customEngines: [] } })
    await wrapper.get('input[placeholder=\"例如：维基百科\"]').setValue('Wiki')
    await wrapper.get('input[placeholder=\"https://example.com/search?q={query}\"]').setValue('javascript:{query}')
    await wrapper.get('button[type=\"submit\"]').trigger('submit')
    expect(wrapper.get('[role=\"alert\"]').text()).toContain('HTTPS')
    expect(wrapper.emitted('addSearchEngine')).toBeUndefined()

    await wrapper.get('input[placeholder=\"https://example.com/search?q={query}\"]').setValue('https://example.com/search?q={query}')
    await wrapper.get('button[type=\"submit\"]').trigger('submit')
    expect(wrapper.emitted('addSearchEngine')?.at(-1)).toEqual(['Wiki', 'https://example.com/search?q={query}'])
  })

  it('emits removal for a listed custom search engine', async () => {
    wrapper = mount(SettingsPanel, {
      props: {
        preferences: { ...defaultPreferences },
        customEngines: [{ id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }],
      },
    })
    await wrapper.get('[aria-label=\"删除搜索引擎Wiki\"]').trigger('click')
    expect(wrapper.emitted('removeSearchEngine')?.at(-1)).toEqual(['wiki'])
  })
})
