// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchBar from './SearchBar.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('SearchBar keyboard navigation', () => {
  it('offers quick translation only when there is a query and outside local search', async () => {
    wrapper = mount(SearchBar, {
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: [] },
    })
    expect((wrapper.get('.quick-translate').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.setProps({ modelValue: 'hello' })
    expect((wrapper.get('.quick-translate').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.get('.quick-translate').trigger('click')
    expect(wrapper.emitted('translate')).toHaveLength(1)
    wrapper.vm.$.exposed?.showTranslationError()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('暂时无法加载')
    await wrapper.get('.quick-translate').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    await wrapper.setProps({ localSearch: true })
    expect(wrapper.find('.quick-translate').exists()).toBe(false)
  })

  it('shows localized search categories while retaining stable mode IDs', async () => {
    wrapper = mount(SearchBar, {
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: ['html', 'photos', 'news', 'videos', 'map'] },
    })
    expect(wrapper.findAll('.search-tab').map((tab) => tab.text())).toEqual(['网页', '图片', '新闻', '视频', '地图'])

    await wrapper.get('.search-tab:nth-child(3)').trigger('click')
    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['news'])
  })

  it('moves between search mode tabs with arrow keys', async () => {
    wrapper = mount(SearchBar, {
      attachTo: document.body,
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: ['html', 'news', 'videos'] },
    })
    const tabs = wrapper.findAll('.search-tab')
    const firstTab = tabs[0]!.element as HTMLButtonElement
    firstTab.focus()
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['news'])
    expect(document.activeElement).toBe(tabs[1]!.element)

    await wrapper.setProps({ mode: 'news' })
    await tabs[1]!.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['videos'])
    expect(document.activeElement).toBe(tabs[2]!.element)
  })

  it('supports arrow selection and Escape in the search engine listbox', async () => {
    wrapper = mount(SearchBar, {
      attachTo: document.body,
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: [] },
    })
    const picker = wrapper.get('.engine-picker')
    await picker.trigger('click')
    await wrapper.vm.$nextTick()
    const options = [...document.body.querySelectorAll<HTMLButtonElement>('.engine-menu [role="option"]')]
    expect(document.activeElement).toBe(options[0])

    options[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(options[1])
    options[1]!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:engine')?.at(-1)).toEqual(['google'])
    expect(document.activeElement).toBe(picker.element)

    await picker.trigger('click')
    await wrapper.vm.$nextTick()
    const selected = document.querySelector<HTMLButtonElement>('.engine-menu [aria-selected="true"]')!
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.engine-menu')).toBeNull()
    expect(document.activeElement).toBe(picker.element)
  })

  it('keeps the engine menu anchored when the page scrolls or the viewport resizes', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    wrapper = mount(SearchBar, {
      attachTo: document.body,
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: [] },
    })
    const bounds = { left: 20, bottom: 70, top: 16, right: 320, width: 300, height: 54, x: 20, y: 16, toJSON: () => ({}) }
    const getBounds = vi.spyOn(wrapper.get('.search-box').element, 'getBoundingClientRect').mockReturnValue(bounds)
    await wrapper.get('.engine-picker').trigger('click')
    await wrapper.vm.$nextTick()
    expect(addListener).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    const menu = document.querySelector<HTMLElement>('.engine-menu')!
    expect(menu.style.top).toBe('78px')
    expect(menu.style.left).toBe('28px')

    getBounds.mockReturnValue({ ...bounds, left: 46, bottom: 122, x: 46, y: 68 })
    window.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menu.style.top).toBe('130px')
    expect(menu.style.left).toBe('54px')

    getBounds.mockReturnValue({ ...bounds, left: 12, bottom: 96, x: 12, y: 42 })
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menu.style.top).toBe('104px')
    expect(menu.style.left).toBe('20px')

    await wrapper.get('.engine-picker').trigger('click')
    await wrapper.vm.$nextTick()
    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function), true)

    await wrapper.get('.engine-picker').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.unmount()
    wrapper = undefined
    expect(removeListener.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(2)
  })

  it('keeps a long custom-engine list inside a short viewport', async () => {
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    try {
      wrapper = mount(SearchBar, {
        attachTo: document.body,
        props: {
          modelValue: '',
          engine: 'baidu',
          mode: 'html',
          visibleModes: [],
          customEngines: Array.from({ length: 20 }, (_, index) => ({
            id: `custom-${index}`,
            name: `Custom ${index}`,
            template: `https://search${index}.example/?q={query}`,
          })),
        },
      })
      const bounds = { left: 740, bottom: 610, top: 570, right: 800, width: 60, height: 40, x: 740, y: 570, toJSON: () => ({}) }
      vi.spyOn(wrapper.get('.search-box').element, 'getBoundingClientRect').mockReturnValue(bounds)

      await wrapper.get('.engine-picker').trigger('click')
      await wrapper.vm.$nextTick()

      const menu = document.querySelector<HTMLElement>('.engine-menu')!
      expect(menu.style.top).toBe('8px')
      expect(menu.style.left).toBe('602px')
      expect(menu.style.maxHeight).toBe('554px')
      expect(menu.querySelectorAll('[role="option"]')).toHaveLength(27)
    } finally {
      if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor)
      else Reflect.deleteProperty(window, 'innerHeight')
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor)
      else Reflect.deleteProperty(window, 'innerWidth')
    }
  })

  it('closes the engine listbox on Tab and preserves logical forward and reverse focus order', async () => {
    wrapper = mount(SearchBar, {
      attachTo: document.body,
      props: { modelValue: '', engine: 'baidu', mode: 'html', visibleModes: [] },
    })
    const picker = wrapper.get('.engine-picker').element as HTMLButtonElement
    const searchInput = wrapper.get('input[type="search"]').element as HTMLInputElement
    await wrapper.get('.engine-picker').trigger('click')
    await wrapper.vm.$nextTick()

    const options = [...document.body.querySelectorAll<HTMLButtonElement>('.engine-menu [role="option"]')]
    options[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.engine-menu')).toBeNull()
    expect(document.activeElement).toBe(searchInput)

    await wrapper.get('.engine-picker').trigger('click')
    await wrapper.vm.$nextTick()
    const selected = document.querySelector<HTMLButtonElement>('.engine-menu [aria-selected="true"]')!
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.engine-menu')).toBeNull()
    expect(document.activeElement).toBe(picker)
  })

  it('offers custom engines and hides unsupported category tabs for them', async () => {
    wrapper = mount(SearchBar, {
      attachTo: document.body,
      props: {
        modelValue: '',
        engine: 'custom:wiki',
        mode: 'html',
        visibleModes: ['html', 'news'],
        customEngines: [{ id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }],
      },
    })
    expect(wrapper.findAll('.search-tab')).toHaveLength(0)
    expect(wrapper.find('.engine-initial').text()).toBe('W')

    await wrapper.get('.engine-picker').trigger('click')
    const options = [...document.body.querySelectorAll<HTMLButtonElement>('.engine-menu [role=\"option\"]')]
    expect(options.at(-1)?.textContent).toContain('Wiki')
    options.at(-1)?.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:engine')?.at(-1)).toEqual(['custom:wiki'])
  })

  it('keeps an astral Unicode character intact in the custom engine mark', () => {
    wrapper = mount(SearchBar, {
      props: {
        modelValue: '',
        engine: 'custom:emoji',
        mode: 'html',
        visibleModes: [],
        customEngines: [{ id: 'emoji', name: '🔎 Search', template: 'https://search.example/?q={query}' }],
      },
    })

    expect(wrapper.get('.engine-initial').text()).toBe('🔎')
  })
})
