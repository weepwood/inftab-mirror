// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences, launcherItems, wallpaperChoices } from './data/defaults'
import WeatherPanel from './components/WeatherPanel.vue'
import App from './App.vue'

let wrapper: VueWrapper | undefined

async function flushLocalStorageWrites() {
  await nextTick()
  window.dispatchEvent(new Event('pagehide'))
}

async function openLauncher(id: string) {
  const builtin = launcherItems.find((item) => item.id === id || item.title === id)
  const trigger = builtin
    ? wrapper!.get(`[data-item-id="${builtin.id}"] .shortcut-open`)
    : wrapper!.get(`.shortcut-open[aria-label="打开${id}"]`)
  await trigger.trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper!.find('.panel-loading').exists()).toBe(false), { timeout: 5_000 })
}

async function openFolderDialog() {
  await wrapper!.get('.folder-add-button').trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(wrapper!.find('.folder-dialog').exists()).toBe(true), { timeout: 5_000 })
}

async function confirmPendingAction() {
  await flushPromises()
  await vi.waitFor(() => expect(wrapper!.find('.confirm-dialog').exists()).toBe(true), { timeout: 5_000 })
  await wrapper!.get('.confirm-dialog .confirm-danger').trigger('click')
  await flushPromises()
}

async function selectBackupFile(contents: unknown) {
  const file = new File(['backup'], 'inftab-backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => typeof contents === 'string' ? contents : JSON.stringify(contents) })
  const input = wrapper!.get('input[accept="application/json,.json"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}

function validBackup(overrides: Record<string, unknown> = {}) {
  return {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    preferences: { ...defaultPreferences },
    shortcuts: [],
    folders: [],
    launcherOrder: [],
    todos: [],
    countdowns: [],
    notes: [],
    activeNoteId: '',
    weatherCity: '上海',
    ...overrides,
  }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  localStorage.clear()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('new-tab landmarks', () => {
  it('provides a skip link and a screen-reader page heading', () => {
    wrapper = mount(App, { attachTo: document.body })

    expect(document.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content')
    expect(wrapper.get('main h1').text()).toBe('Infinity 新标签页')
    expect(wrapper.get('#main-content').attributes('tabindex')).toBe('-1')
  })
})

describe('new-tab keyboard launcher ordering', () => {
  it('moves a focused launcher and persists the new order', async () => {
    wrapper = mount(App, { attachTo: document.body })
    const weather = wrapper.get('[data-item-id="weather"] .shortcut-open')
    await weather.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await flushLocalStorageWrites()

    const order = JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[]
    expect(order.indexOf('weather')).toBe(order.indexOf('countdowns') + 1)
    await vi.waitFor(() => {
      const status = wrapper!.findAll('[role="status"]').find((item) => item.text().includes('已将天气移动到第2个位置'))
      expect(status?.text()).toContain('已将天气移动到第2个位置')
    })
  })
})

describe('new-tab short viewport layout', () => {
  it('fits launcher icons to a short mobile viewport', () => {
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    try {
      wrapper = mount(App, { attachTo: document.body })
      const homeStyle = wrapper.get('main.home').attributes('style') ?? ''
      const fittedIconSize = Number(homeStyle.match(/--fit-icon-size: ([\d.]+)px/)?.[1])

      expect(fittedIconSize).toBeCloseTo(31, 1)
      expect(homeStyle).toContain('--shortcut-gap-y: 4px')
    } finally {
      if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor)
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor)
    }
  })
})

describe('new-tab color theme', () => {
  it('applies an explicit dark theme and follows operating-system changes', async () => {
    const changeListeners = new Set<(event: MediaQueryListEvent) => void>()
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => changeListeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => changeListeners.delete(listener),
    }))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, themeMode: 'system' }))
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    expect(wrapper.get('main.home').classes()).not.toContain('theme-dark')

    changeListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    await nextTick()
    expect(wrapper.get('main.home').classes()).toContain('theme-dark')

    wrapper.unmount()
    wrapper = undefined
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, themeMode: 'dark' }))
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    expect(wrapper.get('main.home').classes()).toContain('theme-dark')
    await wrapper.get('.engine-picker').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.engine-menu')?.classList).toContain('theme-dark')
  })
})

describe('new-tab built-in launcher visibility', () => {
  it('hides a panel from the grid and restores it from settings', async () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, hiddenLauncherIds: ['weather'] }))
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    expect(wrapper.find('[data-item-id="weather"]').exists()).toBe(false)

    await wrapper.get('[aria-label="打开设置"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('.panel-loading').exists()).toBe(false), { timeout: 5_000 })
    const weatherRow = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('显示天气'))!
    const weatherToggle = weatherRow.get('input')
    expect((weatherToggle.element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('.panel-close').trigger('click')
    await nextTick()
    const settingsButton = wrapper.get('[data-item-id="settings"] .shortcut-open')
    await settingsButton.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await flushLocalStorageWrites()
    const reordered = JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[]
    expect(reordered.indexOf('weather')).toBe(0)

    await wrapper.get('[aria-label="打开设置"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('.panel-loading').exists()).toBe(false), { timeout: 5_000 })
    const restoredWeatherRow = wrapper.findAll('label.toggle-row').find((row) => row.text().includes('显示天气'))!
    await restoredWeatherRow.get('input').setValue(true)
    await nextTick()
    await flushLocalStorageWrites()
    expect(wrapper.find('[data-item-id="weather"]').exists()).toBe(true)
    const restoredOrder = JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[]
    expect(restoredOrder.indexOf('weather')).toBe(0)
  })
})

describe('new-tab wallpaper rotation', () => {
  it('rotates on schedule and persists the new wallpaper for the next tab', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-01T12:00:00Z').getTime()
    vi.setSystemTime(now)
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({
      ...defaultPreferences,
      wallpaperRotation: 'hourly',
      wallpaperRotationLastAt: now,
    }))
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    await flushPromises()
    expect(wrapper.get('main.home').attributes('style')).toContain('forest.webp')

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    await nextTick()
    expect(wrapper.get('main.home').attributes('style')).toContain('background-image: linear-gradient')
    await flushLocalStorageWrites()
    const savedPreferences = JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}') as typeof defaultPreferences
    expect(savedPreferences.wallpaper).toBe(wallpaperChoices[1]!.value)
    expect(savedPreferences.wallpaperRotationLastAt).toBe(now + 60 * 60 * 1000)
  })

  it('pauses automatic changes while a custom background is active', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-01-01T12:00:00Z').getTime()
    vi.setSystemTime(now)
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({
      ...defaultPreferences,
      wallpaperRotation: 'hourly',
      wallpaperRotationLastAt: now,
      customWallpaper: 'https://example.com/custom-wallpaper.webp',
    }))
    wrapper = mount(App, { attachTo: document.body })
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    await nextTick()
    expect(wrapper.get('main.home').attributes('style')).toContain('custom-wallpaper.webp')

    await flushLocalStorageWrites()
    const savedPreferences = JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}') as typeof defaultPreferences
    expect(savedPreferences.wallpaper).toBe(defaultPreferences.wallpaper)
    expect(savedPreferences.wallpaperRotationLastAt).toBe(now)
  })
})

describe('focus timer lifecycle', () => {
  it('advances a finished session while its panel is closed', async () => {
    await import('./data/focusTimer')
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    localStorage.setItem('inftab.focus-timer.v1', JSON.stringify({
      phase: 'focus', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
      completedSessions: 0, remainingMs: 1_000, endsAt: now + 1_000,
    }))
    wrapper = mount(App, { attachTo: document.body })

    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    await flushLocalStorageWrites()

    expect(JSON.parse(localStorage.getItem('inftab.focus-timer.v1') ?? '{}')).toMatchObject({
      phase: 'short-break', completedSessions: 1, endsAt: null, remainingMs: 5 * 60_000,
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})

describe('new-tab keyboard search', () => {
  it('filters launcher shortcuts with Ctrl/Command+F and opens a selected result', async () => {
    wrapper = mount(App, { attachTo: document.body })
    const shortcut = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(shortcut)

    expect(shortcut.defaultPrevented).toBe(true)
    await nextTick()
    const input = wrapper.get('input[type="search"]')
    expect(input.attributes('placeholder')).toBe('搜索快捷入口名称或网址')
    await input.setValue('计算器')
    expect(wrapper.get('.local-search-results').text()).toContain('计算器')
    expect(wrapper.findAll('.local-search-result')).toHaveLength(1)

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get('.local-search-result').element)
    await wrapper.get('.local-search-result').trigger('click')
    await flushPromises()
    expect(wrapper.get('.side-panel[role="dialog"]').text()).toContain('计算器')
    expect(wrapper.find('.local-search-results').exists()).toBe(false)
  })

  it('keeps empty local searches local and exits with Escape', async () => {
    wrapper = mount(App, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    const input = wrapper.get('input[type="search"]')
    await input.setValue('there-is-no-matching-shortcut')
    expect(wrapper.get('.local-search-empty').text()).toContain('没有匹配')
    await wrapper.get('.search-box').trigger('submit')
    expect(wrapper.find('.side-panel').exists()).toBe(false)
    expect(wrapper.find('.local-search-empty').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.find('.local-search-results').exists()).toBe(false)
    expect(input.attributes('placeholder')).toBe('输入并搜索')
  })

  it('focuses search with slash or Ctrl/Command+K', () => {
    wrapper = mount(App, { attachTo: document.body })
    const input = wrapper.get('input[type="search"]').element

    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    window.dispatchEvent(slash)
    expect(slash.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)

    document.body.focus()
    const commandK = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(commandK)
    expect(commandK.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it('does not intercept typing shortcuts while a text field is active', () => {
    wrapper = mount(App, { attachTo: document.body })
    const input = wrapper.get('input[type="search"]').element as HTMLInputElement
    input.focus()

    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    input.dispatchEvent(slash)
    expect(slash.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  it('keeps page navigation compact and supports direct jumps on large shortcut collections', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: () => {}, removeListener: () => {} }))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, pageTransitionEffect: 'slide' }))
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify(Array.from({ length: 200 }, (_, index) => ({
      id: 'shortcut-' + index,
      title: 'Shortcut ' + index,
      url: `https://shortcut-${index}.example/`,
      color: '#abc',
      mark: 'S',
    }))))
    wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.findAll('.page-dots .page-dot')).toHaveLength(4)
    expect(wrapper.find('.page-ellipsis').exists()).toBe(true)
    expect(wrapper.get('.page-dots [aria-label="第12页"]').attributes('aria-current')).toBeUndefined()
    await wrapper.get('.page-dots [aria-label="第12页"]').trigger('click')

    expect(wrapper.get('.page-dots [aria-label="第12页"]').attributes('aria-current')).toBe('page')
    expect(wrapper.findAll('.page-dots .page-dot')).toHaveLength(4)
  })

  it('closes only the top shortcut dialog before its settings panel', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await wrapper.get('.settings-add-shortcut').trigger('click')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(wrapper.find('.shortcut-dialog').exists()).toBe(false)
    expect(wrapper.get('.side-panel[role="dialog"]').text()).toContain('设置')
  })

  it('keeps homepage search and page shortcuts inactive while the folder dialog is open', async () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, columns: 2, rows: 1, pageTransitionEffect: 'slide' }))
    wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('.home-actions .round-action[aria-label="打开设置"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('.panel-loading').exists()).toBe(false), { timeout: 5_000 })
    await openFolderDialog()
    const closeButton = wrapper.get('.folder-dialog [aria-label="关闭文件夹"]').element as HTMLButtonElement
    closeButton.focus()
    const currentPage = wrapper.get('.page-dots [aria-current="page"]').attributes('aria-label')

    for (const options of [
      { key: '/', ctrlKey: false },
      { key: 'k', ctrlKey: true },
      { key: 'ArrowRight', ctrlKey: false },
      { key: 'ArrowLeft', ctrlKey: false },
    ]) {
      const event = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true })
      closeButton.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(closeButton)
    }

    expect(wrapper.get('.page-dots [aria-current="page"]').attributes('aria-label')).toBe(currentPage)
    expect(wrapper.get('.search-box input[type="search"]').attributes('placeholder')).toBe('输入并搜索')
  })

  it('traps focus in an open side panel and restores it to the opener', async () => {
    wrapper = mount(App, { attachTo: document.body })
    const opener = wrapper.get('.shortcut-open[aria-label="打开设置"]').element as HTMLButtonElement
    opener.focus()
    await openLauncher('settings')
    await nextTick()

    const panel = wrapper.get('.side-panel[role="dialog"]')
    const focusable = panel.findAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    const first = focusable[0]!.element as HTMLElement
    const last = focusable.at(-1)!.element as HTMLElement
    expect(panel.element.contains(document.activeElement)).toBe(true)

    last.focus()
    const tabForward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last.dispatchEvent(tabForward)
    expect(tabForward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    const tabBackward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    first.dispatchEvent(tabBackward)
    expect(tabBackward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)

    await wrapper.get('.panel-close').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(opener)
  })

  it('connects plugin events with colons to the workspace state', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('weather')
    expect(wrapper.findComponent(WeatherPanel).exists()).toBe(true)

    wrapper.findComponent(WeatherPanel).vm.$emit('update:city', '广州')
    await flushLocalStorageWrites()

    expect(JSON.parse(localStorage.getItem('inftab.weather-city.v1') ?? '""')).toBe('广州')
  })

  it('routes the browser bookmarks launcher to its permission-aware panel', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('书签')
    expect(wrapper.get('.side-panel[role="dialog"]').text()).toContain('此功能需要浏览器扩展')
  })

  it('prepopulates a new shortcut from a browser bookmark', async () => {
    const bookmarkChange = { addListener: vi.fn(), removeListener: vi.fn() }
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn().mockResolvedValue(true) },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{
          id: '0', title: '', children: [{
            id: '1', title: 'Bookmarks Bar', children: [{ id: '2', title: 'Vue Docs', url: 'https://vuejs.org/' }],
          }],
        }]),
        onCreated: bookmarkChange,
        onChanged: bookmarkChange,
        onMoved: bookmarkChange,
        onRemoved: bookmarkChange,
        onChildrenReordered: bookmarkChange,
        onImportEnded: bookmarkChange,
      },
    })
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('书签')
    await wrapper.get('[aria-label="添加Vue Docs到快捷入口"]').trigger('click')

    expect((wrapper.get('input[placeholder="例如：GitHub"]').element as HTMLInputElement).value).toBe('Vue Docs')
    expect((wrapper.get('input[placeholder="https://example.com"]').element as HTMLInputElement).value).toBe('https://vuejs.org/')
    await wrapper.get('.shortcut-dialog').trigger('submit')
    await flushLocalStorageWrites()

    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')).toContainEqual(expect.objectContaining({
      title: 'Vue Docs', url: 'https://vuejs.org/',
    }))
  })

  it('routes the browser history launcher to its permission-aware panel', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('history')
    expect(wrapper.get('.side-panel[role="dialog"]').text()).toContain('此功能需要浏览器扩展')
  })

  it('loads the calendar as a built-in on-demand panel', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('日历')

    expect(wrapper.get('.side-panel[role="dialog"] h2').text()).toBe('日历')
    expect(wrapper.findAll('.calendar-day')).toHaveLength(42)
  })

  it('opens the focus timer from its built-in launcher', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('focus-timer')

    expect(wrapper.get('.side-panel[role="dialog"] h2').text()).toBe('专注计时')
    expect(wrapper.get('[role="timer"]').text()).toBe('25:00')
  })

  it('rejects unsafe shortcut URLs and restores a valid shortcut after remount', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await wrapper.get('.settings-add-shortcut').trigger('click')
    await wrapper.get('input[placeholder="例如：GitHub"]').setValue('Example')
    await wrapper.get('input[placeholder="https://example.com"]').setValue('javascript:alert(1)')
    await wrapper.get('.shortcut-dialog').trigger('submit')

    expect(wrapper.get('.shortcut-dialog [role="alert"]').text()).toContain('HTTP 或 HTTPS')
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').some((item: { title: string }) => item.title === 'Example')).toBe(false)

    await wrapper.get('input[placeholder="https://example.com"]').setValue('https://example.com@evil.example/')
    await wrapper.get('.shortcut-dialog').trigger('submit')
    expect(wrapper.get('.shortcut-dialog [role="alert"]').text()).toContain('有效的 HTTP 或 HTTPS 网址')
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').some((item: { title: string }) => item.title === 'Example')).toBe(false)

    await wrapper.get('input[placeholder="https://example.com"]').setValue('example.com')
    await wrapper.get('.shortcut-dialog').trigger('submit')
    await flushLocalStorageWrites()
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')).toContainEqual(expect.objectContaining({
      title: 'Example',
      url: 'https://example.com/',
    }))

    wrapper.unmount()
    wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).toContain(
      JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').find((item: { title: string }) => item.title === 'Example')?.id,
    )
  })

  it('creates a folder, opens it, and launches a contained shortcut', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    const columns = wrapper.findAll('.settings-content .range-label').find((label) => label.text().includes('每行图标'))
    await columns!.get('input').setValue('12')
    await openFolderDialog()
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    const folderChoices = wrapper.findAll('.folder-choice input[type="checkbox"]')
    await folderChoices[0]!.setValue(true)
    await folderChoices[1]!.setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')
    await flushLocalStorageWrites()

    const folders = JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')
    expect(folders).toHaveLength(1)
    expect(folders[0].shortcutIds).toEqual(['jd', 'tmall'])
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).toContain(folders[0].id)
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).not.toContain('jd')
    expect(wrapper.find('[data-item-id="jd"]').exists()).toBe(false)
    expect(wrapper.find('[data-item-id="tmall"]').exists()).toBe(false)

    await wrapper.get('.panel-close').trigger('click')
    await openLauncher('工作')
    expect(wrapper.get('.folder-dialog').text()).toContain('京东商城')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await wrapper.get('.folder-link').trigger('click')
    expect(open).toHaveBeenCalledWith('https://www.jd.com/', '_blank', 'noopener,noreferrer')
    await wrapper.get('.folder-toolbar button').trigger('click')
    expect(open).toHaveBeenCalledTimes(3)
    expect(open).toHaveBeenNthCalledWith(2, 'https://www.jd.com/', '_blank', 'noopener,noreferrer')
    expect(open).toHaveBeenNthCalledWith(3, 'https://www.tmall.com/', '_blank', 'noopener,noreferrer')
    const folderId = folders[0].id
    await wrapper.get('.folder-dialog .danger-action').trigger('click')
    await vi.waitFor(() => expect(wrapper!.find('[role="alertdialog"]').exists()).toBe(true), { timeout: 5_000 })
    expect(wrapper.find('[role="alertdialog"]').text()).toContain('其中的快捷入口会保留')
    await confirmPendingAction()
    await flushLocalStorageWrites()
    expect(JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').some((item: { id: string }) => item.id === 'jd')).toBe(true)
    expect(JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]')).not.toContain(folderId)
  })

  it('discards folder edits when cancelling', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    const columns = wrapper.findAll('.settings-content .range-label').find((label) => label.text().includes('每行图标'))
    await columns!.get('input').setValue('12')
    await openFolderDialog()
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')
    await flushLocalStorageWrites()
    await wrapper.get('.panel-close').trigger('click')
    await openLauncher('工作')
    await wrapper.get('.folder-dialog footer button.button-secondary:not(.danger-action)').trigger('click')

    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('未保存的名称')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(false)
    await wrapper.get('.folder-dialog footer .button-secondary:not(.danger-action)').trigger('click')

    expect(wrapper.get('#folder-view-title').text()).toBe('工作')
    expect(wrapper.get('.folder-link').text()).toContain('京东商城')
    expect(JSON.parse(localStorage.getItem('inftab.folders.v1') ?? '[]')[0].title).toBe('工作')
  })

  it('prevents adding a shortcut to multiple folders', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await openFolderDialog()
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('工作')
    await wrapper.get('.folder-choice input[type="checkbox"]').setValue(true)
    await wrapper.get('.folder-dialog button.button-primary').trigger('click')
    await openFolderDialog()
    await wrapper.get('.folder-dialog input[placeholder="例如：工作"]').setValue('生活')

    const assignedShortcut = wrapper.findAll('.folder-choice').find((choice) => choice.text().includes('京东商城'))
    expect(assignedShortcut?.get('input[type="checkbox"]').element).toHaveProperty('disabled', true)
    expect(assignedShortcut?.text()).toContain('已在其他文件夹')
  })

  it('loads image compression on demand when a shortcut icon is uploaded', async () => {
    const bitmap = { width: 400, height: 200, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['webp-icon'], { type: 'image/webp' })))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await wrapper.get('.settings-add-shortcut').trigger('click')

    const file = new File(['source-icon'], 'icon.png', { type: 'image/png' })
    const input = wrapper.get('.shortcut-dialog input[accept="image/png,image/jpeg,image/webp,image/gif"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    const iconField = wrapper.get('.shortcut-dialog input[placeholder="素材文件名、图片网址或 Base64"]')
    await vi.waitFor(() => expect((iconField.element as HTMLInputElement).value).toMatch(/^data:image\/webp;base64,/))

    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledOnce()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('keeps remote shortcut icons as image URLs in the extension build', async () => {
    vi.stubGlobal('location', { protocol: 'chrome-extension:' })
    const fetch = vi.spyOn(globalThis, 'fetch')
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await wrapper.get('.settings-add-shortcut').trigger('click')
    await wrapper.get('input[placeholder="例如：GitHub"]').setValue('Example')
    await wrapper.get('input[placeholder="https://example.com"]').setValue('https://example.com')
    await wrapper.get('.shortcut-dialog input[placeholder="素材文件名、图片网址或 Base64"]').setValue('https://images.example/icon.png')
    await wrapper.get('.shortcut-dialog').trigger('submit')
    await flushLocalStorageWrites()

    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')).toContainEqual(expect.objectContaining({
      title: 'Example',
      icon: 'https://images.example/icon.png',
    }))
  })

  it('restores a fresh copy of default preferences', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    const columns = wrapper.findAll('.settings-content .range-label').find((label) => label.text().includes('每行图标'))!
    await columns.get('input').setValue('10')
    await wrapper.get('.text-button').trigger('click')
    await confirmPendingAction()

    expect(columns.get('input').element).toHaveProperty('value', '6')
  })

  it('keeps the selected search mode visible when its tab visibility changes', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    let newsToggle = wrapper.findAll('.settings-content .toggle-row').find((row) => row.text().trim() === '新闻')!
    await newsToggle.get('input').setValue(true)
    expect(wrapper.get('.search-tab[aria-pressed="true"]').text()).toBe('新闻')

    newsToggle = wrapper.findAll('.settings-content .toggle-row').find((row) => row.text().trim() === '新闻')!
    await newsToggle.get('input').setValue(false)
    expect(wrapper.find('.search-tabs').exists()).toBe(false)
  })

  it('adds, selects, persists, and removes a custom search engine from settings', async () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, visibleSearchModes: ['html', 'news'] }))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await wrapper.get('input[placeholder="例如：维基百科"]').setValue('Wiki')
    await wrapper.get('input[placeholder="https://example.com/search?q={query}"]').setValue('https://example.com/search?q={query}')
    await wrapper.get('.custom-engine-form').trigger('submit')
    await flushLocalStorageWrites()

    const savedEngines = JSON.parse(localStorage.getItem('inftab.custom-search-engines.v1') ?? '[]')
    expect(savedEngines).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').engine).toBe('custom:' + savedEngines[0].id)
    expect(wrapper.get('.engine-initial').text()).toBe('W')
    expect(wrapper.find('.search-tabs').exists()).toBe(false)

    await wrapper.get('[aria-label="删除搜索引擎Wiki"]').trigger('click')
    await confirmPendingAction()
    await flushLocalStorageWrites()
    expect(JSON.parse(localStorage.getItem('inftab.custom-search-engines.v1') ?? '[]')).toEqual([])
    expect(JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').engine).toBe('baidu')
    expect(wrapper.get('.engine-picker').attributes('aria-label')).toContain('Baidu')
  })

  it('allows the homepage clock widget to be hidden from settings', async () => {
    wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('.home-clock').exists()).toBe(true)
    await openLauncher('settings')
    const clockToggle = wrapper.findAll('.settings-content .toggle-row').find((row) => row.text().includes('显示时间和日期'))!
    await clockToggle.get('input').setValue(false)

    expect(wrapper.find('.home-clock').exists()).toBe(false)
  })

  it('runs the todo add, edit, complete, and clear flow', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('待办事项')
    await wrapper.get('.inline-add input').setValue('  Review release  ')
    await wrapper.get('.inline-add').trigger('submit')
    expect(wrapper.get('.todo-list').text()).toContain('Review release')

    await wrapper.get('.todo-check').trigger('click')
    expect(wrapper.get('.todo-list li').classes()).toContain('done')
    await wrapper.get('.todo-list li .icon-action[aria-label=\"编辑待办\"]').trigger('click')
    await wrapper.get('input[aria-label=\"编辑待办\"]').setValue('Ship release')
    await wrapper.get('.todo-edit-form').trigger('submit')
    expect(wrapper.get('.todo-list').text()).toContain('Ship release')

    await wrapper.get('.todo-footer .text-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    await confirmPendingAction()
    expect(wrapper.find('.todo-list').exists()).toBe(false)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('cancels inline todo editing on Escape without closing its panel', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('待办事项')
    await wrapper.get('.inline-add input').setValue('保留在面板里的待办')
    await wrapper.get('.inline-add').trigger('submit')
    await wrapper.get('.todo-list li .icon-action[aria-label="编辑待办"]').trigger('click')

    await wrapper.get('input[aria-label="编辑待办"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('待办事项')
    expect(wrapper.find('input[aria-label="编辑待办"]').exists()).toBe(false)
    expect(wrapper.get('.todo-list').text()).toContain('保留在面板里的待办')
  })

  it('prevents new todos and notes when their backup-safe item limit is reached', async () => {
    localStorage.setItem('inftab.todos.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: 'todo-' + index,
      title: 'Task ' + index,
      done: false,
    }))))
    localStorage.setItem('inftab.notes.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: 'note-' + index,
      title: 'Note ' + index,
      body: '',
      updatedAt: 1,
    }))))
    wrapper = mount(App, { attachTo: document.body })

    await openLauncher('待办事项')
    expect(wrapper.get('.inline-add input').element).toHaveProperty('disabled', true)
    expect(wrapper.get('.todo-footer').text()).toContain('500 项上限')
    await wrapper.get('.panel-close').trigger('click')

    await openLauncher('笔记')
    expect(wrapper.get('.note-add').element).toHaveProperty('disabled', true)
    expect(wrapper.get('.notes-empty[role="status"]').text()).toContain('500 条笔记上限')
  })

  it('prevents adding shortcuts and folders when their backup-safe limits are reached', async () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: 'shortcut-' + index,
      title: 'Shortcut ' + index,
      url: `https://shortcut-${index}.example/`,
      color: '#abc',
      mark: 'S',
    }))))
    localStorage.setItem('inftab.folders.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: 'folder-' + index,
      title: 'Folder ' + index,
      shortcutIds: [],
      color: '#abc',
      mark: 'F',
    }))))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')

    await wrapper.get('.settings-add-shortcut').trigger('click')
    expect(wrapper.get('.shortcut-dialog').text()).toContain('最多只能保存 500 个快捷入口')
    expect(wrapper.get('.shortcut-dialog button[type="submit"]').element).toHaveProperty('disabled', true)
    await wrapper.get('.shortcut-dialog button[type="button"]').trigger('click')

    await openFolderDialog()
    expect(wrapper.get('.folder-dialog').text()).toContain('最多只能保存 500 个文件夹')
    expect(wrapper.get('.folder-dialog button.button-primary').element).toHaveProperty('disabled', true)
  })

  it('keeps the selected note stable while creating and deleting notes', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('笔记')
    await wrapper.get('.note-add').trigger('click')
    await wrapper.get('input[aria-label=\"笔记标题\"]').setValue('First note')
    await wrapper.get('textarea[aria-label=\"笔记内容\"]').setValue('Saved text')
    await wrapper.get('.note-add').trigger('click')
    await wrapper.get('input[aria-label=\"笔记标题\"]').setValue('Second note')

    expect(wrapper.findAll('.note-list-item')).toHaveLength(2)
    await wrapper.get('.note-delete').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.note-list-item')).toHaveLength(2)
    await wrapper.get('.confirm-dialog').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(wrapper.findAll('.note-list-item')).toHaveLength(2)
    await wrapper.get('.note-delete').trigger('click')
    await confirmPendingAction()
    expect(wrapper.get('input[aria-label=\"笔记标题\"]').element).toHaveProperty('value', 'First note')
    expect(wrapper.get('textarea[aria-label=\"笔记内容\"]').element).toHaveProperty('value', 'Saved text')
    expect(wrapper.findAll('.note-list-item')).toHaveLength(1)
  })

  it('creates, edits, removes, and persists annual countdowns', async () => {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + 30)
    const dateValue = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('纪念日')
    await wrapper.get('input[aria-label="纪念日名称"]').setValue('旅行')
    await wrapper.get('input[aria-label="纪念日日期"]').setValue(dateValue)
    await wrapper.get('.countdown-form').trigger('submit')

    expect(wrapper.get('.countdown-item').text()).toContain('还有 30 天')
    await wrapper.get('[aria-label="编辑旅行"]').trigger('click')
    await wrapper.get('input[aria-label="纪念日日期"]').setValue('')
    await wrapper.get('.countdown-form').trigger('submit')
    expect(wrapper.find('.countdown-item').exists()).toBe(true)

    await wrapper.get('input[aria-label="纪念日日期"]').setValue(dateValue)
    await wrapper.get('input[aria-label="纪念日名称"]').setValue('周年旅行')
    await wrapper.get('select[aria-label="重复频率"]').setValue('yearly')
    await wrapper.get('.countdown-form').trigger('submit')
    await flushLocalStorageWrites()

    const saved = JSON.parse(localStorage.getItem('inftab.countdowns.v1') ?? '[]')
    expect(saved).toEqual([expect.objectContaining({ title: '周年旅行', date: dateValue, recurrence: 'yearly' })])
    expect(wrapper.get('.countdown-item').text()).toContain('每年重复')

    await wrapper.get('[aria-label="编辑周年旅行"]').trigger('click')
    await wrapper.get('[aria-label="删除周年旅行"]').trigger('click')
    await confirmPendingAction()
    expect(wrapper.get('.countdown-form button[type="submit"]').text()).toContain('添加纪念日')
    await flushLocalStorageWrites()
    expect(JSON.parse(localStorage.getItem('inftab.countdowns.v1') ?? '[]')).toEqual([])
  })

  it('shows a recoverable warning when browser storage rejects a save', async () => {
    wrapper = mount(App, { attachTo: document.body })
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'inftab.preferences.v1') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return originalSetItem.call(this, key, value)
    })

    await openLauncher('settings')
    const clockToggle = wrapper.findAll('.settings-content .toggle-row').find((row) => row.text().includes('显示时间和日期'))!
    await clockToggle.get('input').setValue(false)
    await flushLocalStorageWrites()

    expect(setItem).toHaveBeenCalled()
    expect(wrapper.get('.storage-error-toast').text()).toContain('本地数据未能保存')
    await wrapper.get('.storage-error-toast button').trigger('click')
    expect(wrapper.find('.storage-error-toast').exists()).toBe(false)
  })

  it('previews and merges a selected backup without removing existing shortcuts', async () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'existing', title: 'Existing', url: 'https://existing.example/', color: '#369', mark: 'E' },
    ]))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await selectBackupFile(validBackup({
      shortcuts: [{ id: 'imported', title: 'Imported', url: 'https://imported.example/', color: '#936', mark: 'I' }],
      todos: [{ id: 'backup-todo', title: 'From backup', done: false }],
    }))

    expect(wrapper.get('.backup-dialog').text()).toContain('1 个快捷入口')
    expect(wrapper.get('.backup-dialog').text()).toContain('1 条待办')
    await wrapper.findAll('.backup-dialog button').find((button) => button.text().trim() === '合并导入')!.trigger('click')
    await flushLocalStorageWrites()

    const shortcuts = JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')
    const todos = JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')
    expect(shortcuts.map((shortcut: { id: string }) => shortcut.id)).toEqual(expect.arrayContaining(['existing', 'imported']))
    expect(todos).toContainEqual(expect.objectContaining({ id: 'backup-todo', title: 'From backup' }))
    expect(wrapper.find('.backup-dialog').exists()).toBe(false)
  })

  it('rejects an over-capacity backup merge without partially importing it', async () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: 'shortcut-' + index,
      title: 'Shortcut ' + index,
      url: `https://shortcut-${index}.example/`,
      color: '#abc',
      mark: 'S',
    }))))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ ...defaultPreferences, showClock: true }))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await selectBackupFile(validBackup({
      shortcuts: [{ id: 'imported', title: 'Imported', url: 'https://imported.example/', color: '#936', mark: 'I' }],
      preferences: { ...defaultPreferences, showClock: false },
    }))
    await wrapper.findAll('.backup-dialog button').find((button) => button.text().trim() === '合并导入')!.trigger('click')
    await flushLocalStorageWrites()

    expect(wrapper.find('.backup-dialog').exists()).toBe(false)
    expect(wrapper.get('.settings-content [role="alert"]').text()).toContain('快捷入口将超过数量上限')
    expect(JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')).toHaveLength(500)
    expect(JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').showClock).toBe(true)
  })

  it('replaces existing data only after backup confirmation and reports malformed files', async () => {
    localStorage.setItem('inftab.todos.v1', JSON.stringify([{ id: 'old-todo', title: 'Keep me?', done: false }]))
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await selectBackupFile(validBackup({ todos: [{ id: 'new-todo', title: 'Restored', done: false }] }))
    expect(JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')).toContainEqual(expect.objectContaining({ id: 'old-todo' }))
    await wrapper.findAll('.backup-dialog button').find((button) => button.text().trim() === '覆盖导入')!.trigger('click')
    await flushLocalStorageWrites()

    expect(JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')).toEqual([
      { id: 'new-todo', title: 'Restored', done: false },
    ])

    await selectBackupFile('{malformed json')
    expect(wrapper.get('.backup-error[role="alert"]').text().trim()).not.toBe('')
    expect(wrapper.find('.backup-dialog').exists()).toBe(false)
  })

  it('keeps keyboard focus inside the backup prompt and closes only that prompt on Escape', async () => {
    wrapper = mount(App, { attachTo: document.body })
    await openLauncher('settings')
    await selectBackupFile(validBackup())

    expect(document.activeElement).toBe(wrapper.get('.backup-dialog [aria-label="取消导入"]').element)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.activeElement!.dispatchEvent(escape)
    await nextTick()
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(wrapper.find('.backup-dialog').exists()).toBe(false)
    expect(wrapper.get('.side-panel[role="dialog"]').text()).toContain('设置')
    expect(document.activeElement).toBe(wrapper.get('.import-backup-button').element)
  })
})
