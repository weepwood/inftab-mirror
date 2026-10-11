// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import SearchBar from './SearchBar.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('SearchBar keyboard navigation', () => {
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
})
