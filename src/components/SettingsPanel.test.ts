// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from '../data/defaults'
import { defaultFocusTimerState } from '../data/focusTimerState'
import * as backupParsing from '../data/backup'
import * as imageProcessing from '../data/images'
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

describe('SettingsPanel built-in launcher visibility', () => {
  it('emits a hidden panel preference while keeping settings available', async () => {
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })

    const weatherRow = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('显示天气'))!
    const weatherToggle = weatherRow.get('input')
    expect((weatherToggle.element as HTMLInputElement).checked).toBe(true)
    await weatherToggle.setValue(false)

    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ hiddenLauncherIds: ['weather'] })
    expect(wrapper.findAll('label.toggle-row').some((row) => row.text().includes('显示设置'))).toBe(false)
  })
})

describe('SettingsPanel home widgets', () => {
  it('adds and removes registered widgets without disturbing their order', async () => {
    wrapper = mount(SettingsPanel, {
      props: { preferences: { ...defaultPreferences, homeWidgetIds: ['countdown-summary'] } },
    })
    const todoLabel = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('待办概览小组件'))!
    await todoLabel.get('input').setValue(true)
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ homeWidgetIds: ['countdown-summary', 'todo-summary'] })
    await wrapper.setProps({
      preferences: { ...defaultPreferences, homeWidgetIds: ['countdown-summary', 'todo-summary'] },
    })

    const countdownLabel = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('倒计时小组件'))!
    await countdownLabel.get('input').setValue(false)
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ homeWidgetIds: ['todo-summary'] })
  })
})

describe('SettingsPanel home dock', () => {
  it('adds and removes permanent launcher shortcuts without changing their order', async () => {
    wrapper = mount(SettingsPanel, {
      props: { preferences: { ...defaultPreferences, dockItemIds: ['calendar'] } },
    })
    const weatherLabel = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('固定天气到 Dock'))!
    await weatherLabel.get('input').setValue(true)
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ dockItemIds: ['calendar', 'weather'] })

    await wrapper.setProps({ preferences: { ...defaultPreferences, dockItemIds: ['calendar', 'weather'] } })
    const calendarLabel = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('固定日历到 Dock'))!
    await calendarLabel.get('input').setValue(false)
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ dockItemIds: ['weather'] })
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
    const update = wrapper.emitted('update')?.map(([value]) => value as { customWallpaper?: string }).find((value) => value.customWallpaper)
    expect(update?.customWallpaper).toMatch(/^data:image\/webp;base64,/)
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('clears the local wallpaper when the user removes it', async () => {
    wrapper = mount(SettingsPanel, {
      props: { preferences: { ...defaultPreferences, customWallpaper: 'data:image/webp;base64,YWJj' } },
    })
    await wrapper.findAll('button').find((button) => button.text().trim() === '移除本地壁纸')!.trigger('click')
    expect(wrapper.emitted('update')).toContainEqual([{ customWallpaper: '' }])
  })

  it('does not let a slower image upload override the latest wallpaper choice', async () => {
    let resolveCompression!: (dataUrl: string) => void
    vi.spyOn(imageProcessing, 'compressImageBlob').mockImplementation(() => new Promise((resolve) => { resolveCompression = resolve }))
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const input = wrapper.get('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['image'], 'wallpaper.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    expect(imageProcessing.compressImageBlob).toHaveBeenCalledOnce()

    await wrapper.get('button[aria-label="暮色"]').trigger('click')
    resolveCompression('data:image/webp;base64,c3RhbGU=')
    await flushPromises()

    expect(wrapper.emitted('update')).toContainEqual([{ wallpaper: 'linear-gradient(135deg, #192a3a, #67526f 52%, #e0a777)' }])
    expect(wrapper.emitted('update')).toContainEqual([{ customWallpaper: '' }])
    expect(wrapper.emitted('update')?.some(([value]) => (value as { customWallpaper?: string }).customWallpaper?.startsWith('data:image/'))).toBe(false)
  })

  it('keeps the newest local image when compression completes out of order', async () => {
    const resolveCompression: Array<(dataUrl: string) => void> = []
    vi.spyOn(imageProcessing, 'compressImageBlob').mockImplementation(() => new Promise((resolve) => { resolveCompression.push(resolve) }))
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const input = wrapper.get('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['first'], 'first.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['second'], 'second.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    expect(resolveCompression).toHaveLength(2)

    resolveCompression[1]!('data:image/webp;base64,bmV3ZXI=')
    await flushPromises()
    resolveCompression[0]!('data:image/webp;base64,ZWxkZXI=')
    await flushPromises()

    const uploadedWallpapers = wrapper.emitted('update')
      ?.map(([value]) => (value as { customWallpaper?: string }).customWallpaper)
      .filter((value): value is string => Boolean(value?.startsWith('data:image/')))
    expect(uploadedWallpapers).toEqual(['data:image/webp;base64,bmV3ZXI='])
  })

  it('does not emit a wallpaper update after the settings panel unmounts', async () => {
    let resolveCompression!: (dataUrl: string) => void
    vi.spyOn(imageProcessing, 'compressImageBlob').mockImplementation(() => new Promise((resolve) => { resolveCompression = resolve }))
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const input = wrapper.get('input[accept="image/png,image/jpeg,image/webp,image/gif"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['image'], 'wallpaper.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    const panel = wrapper
    panel.unmount()
    resolveCompression('data:image/webp;base64,c3RhbGU=')
    await flushPromises()

    expect(panel.emitted('update')).toBeUndefined()
  })
})

describe('SettingsPanel wallpaper rotation', () => {
  it('starts rotation from the current time and resets its schedule on manual selection', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })

    await wrapper.get('select[aria-label="壁纸轮换"]').setValue('daily')
    expect(wrapper.emitted('update')).toContainEqual([{ wallpaperRotation: 'daily' }])
    expect(wrapper.emitted('update')).toContainEqual([{ wallpaperRotationLastAt: 1_800_000_000_000 }])

    await wrapper.get('button[aria-label="暮色"]').trigger('click')
    expect(wrapper.emitted('update')?.slice(-3).map(([value]) => value)).toEqual([
      { wallpaper: expect.any(String) },
      { customWallpaper: '' },
      { wallpaperRotationLastAt: 1_800_000_000_000 },
    ])
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

describe('SettingsPanel backup preview', () => {
  it('rejects oversized backup files before reading or parsing their contents', async () => {
    const parseBackup = vi.spyOn(backupParsing, 'parseWorkspaceBackup')
    const text = vi.fn()
    const oversizedFile = { size: 10 * 1024 * 1024 + 1, text } as unknown as File
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const input = wrapper.get('input[accept="application/json,.json"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [oversizedFile] })

    await input.trigger('change')

    expect(wrapper.get('[role="alert"]').text()).toBe('备份文件不能超过 10 MB。')
    expect(text).not.toHaveBeenCalled()
    expect(parseBackup).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"][aria-labelledby="backup-title"]').exists()).toBe(false)
  })

  it('shows the complete backup scope and previews habits and workspaces', async () => {
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    expect(wrapper.get('.backup-description').text()).toContain('习惯')
    expect(wrapper.get('.backup-description').text()).toContain('浏览器书签与历史不包含在内')

    const backup = {
      format: 'inftab-workspace',
      version: 1,
      exportedAt: '2026-10-12T00:00:00.000Z',
      preferences: { ...defaultPreferences },
      shortcuts: [],
      folders: [],
      launcherOrder: [],
      todos: [],
      habits: [{ id: 'read', title: '阅读', completedDates: [] }],
      countdowns: [],
      notes: [],
      activeNoteId: '',
      weatherCity: '上海',
      customSearchEngines: [],
      focusTimer: defaultFocusTimerState,
      homeWorkspaces: [
        { id: 'default', name: '主页', itemIds: [] },
        { id: 'work', name: '工作', itemIds: [] },
      ],
      activeHomeWorkspaceId: 'default',
    }
    const file = new File([JSON.stringify(backup)], 'workspace.json', { type: 'application/json' })
    const input = wrapper.get('input[accept="application/json,.json"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[role="dialog"][aria-labelledby="backup-title"]').text()).toContain('2 个主页工作区')
    expect(wrapper.get('[role="dialog"][aria-labelledby="backup-title"]').text()).toContain('1 个习惯')
    expect(wrapper.get('[role="dialog"][aria-labelledby="backup-title"]').text()).toContain('包含专注计时状态')
  })

  it('shows unknown instead of an invalid date for malformed backup timestamps', async () => {
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const backup = {
      format: 'inftab-workspace',
      version: 1,
      exportedAt: 'not-a-date',
      preferences: { ...defaultPreferences },
      shortcuts: [],
      folders: [],
      launcherOrder: [],
      todos: [],
      habits: [],
      countdowns: [],
      notes: [],
      activeNoteId: '',
      weatherCity: '上海',
      customSearchEngines: [],
    }
    const input = wrapper.get('input[accept="application/json,.json"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File([JSON.stringify(backup)], 'workspace.json', { type: 'application/json' })],
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('.backup-preview').text()).toBe('备份时间：未知')
  })

  it('keeps the latest selected backup when an earlier file read finishes later', async () => {
    const parseBackup = vi.spyOn(backupParsing, 'parseWorkspaceBackup')
    wrapper = mount(SettingsPanel, { props: { preferences: { ...defaultPreferences } } })
    const backup = (exportedAt: string) => JSON.stringify({
      format: 'inftab-workspace',
      version: 1,
      exportedAt,
      preferences: { ...defaultPreferences },
      shortcuts: [],
      folders: [],
      launcherOrder: [],
      todos: [],
      habits: [],
      countdowns: [],
      notes: [],
      activeNoteId: '',
      weatherCity: '上海',
      customSearchEngines: [],
    })
    let resolveFirst!: (content: string) => void
    const firstFile = {
      size: 1,
      text: () => new Promise<string>((resolve) => { resolveFirst = resolve }),
    } as File
    const latestExportedAt = '2026-10-14T00:00:00.000Z'
    const latestFile = new File([backup(latestExportedAt)], 'latest.json', { type: 'application/json' })
    const input = wrapper.get('input[accept="application/json,.json"]')

    Object.defineProperty(input.element, 'files', { configurable: true, value: [firstFile] })
    await input.trigger('change')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [latestFile] })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.get('.backup-preview').text()).toBe(`备份时间：${new Date(latestExportedAt).toLocaleString()}`)
    expect(parseBackup).toHaveBeenCalledOnce()

    resolveFirst(backup('2020-01-01T00:00:00.000Z'))
    await flushPromises()

    expect(wrapper.get('.backup-preview').text()).toBe(`备份时间：${new Date(latestExportedAt).toLocaleString()}`)
    expect(parseBackup).toHaveBeenCalledOnce()
  })
})
