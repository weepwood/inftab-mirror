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
