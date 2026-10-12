// @vitest-environment jsdom
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lazyPluginComponent } from './asyncComponent'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('lazy plugin component loading', () => {
  it('retries transient chunk failures automatically and offers another retry after exhaustion', async () => {
    const loadedComponent = defineComponent({ setup: () => () => h('p', 'Loaded plugin') })
    const loader = vi.fn(async () => {
      if (loader.mock.calls.length < 4) throw new Error('chunk unavailable')
      return loadedComponent
    })
    const plugin = lazyPluginComponent(loader, 'Loading plugin…', 'Plugin failed to load.')
    wrapper = mount(defineComponent({ setup: () => () => h('section', [h(plugin)]) }))

    expect(wrapper.get('[role="status"]').text()).toBe('Loading plugin…')
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3), { timeout: 2_000 })
    await vi.waitFor(() => expect(wrapper!.find('[role="alert"]').exists()).toBe(true), { timeout: 2_000 })

    expect(loader).toHaveBeenCalledTimes(3)
    expect(wrapper.get('[role="alert"]').text()).toContain('Plugin failed to load.')
    expect(wrapper.get('[aria-label="重试加载"]')).toBeTruthy()

    await wrapper.get('[aria-label="重试加载"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.text()).toBe('Loaded plugin'), { timeout: 1_000 })

    expect(loader).toHaveBeenCalledTimes(4)
  })
})
