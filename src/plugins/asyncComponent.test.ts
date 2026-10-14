// @vitest-environment jsdom
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lazyPluginComponent, retryAsyncLoad } from './asyncComponent'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('lazy plugin component loading', () => {
  it('retries transient async module failures and rejects after the final attempt', async () => {
    vi.useFakeTimers()
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('temporary chunk failure'))
      .mockRejectedValueOnce(new Error('temporary chunk failure'))
      .mockResolvedValue('loaded')

    const result = retryAsyncLoad(loader)
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(500)
    await expect(result).resolves.toBe('loaded')
    expect(loader).toHaveBeenCalledTimes(3)

    const failingLoader = vi.fn(async () => { throw new Error('chunk unavailable') })
    const failure = expect(retryAsyncLoad(failingLoader)).rejects.toThrow('chunk unavailable')
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(500)
    await failure
    expect(failingLoader).toHaveBeenCalledTimes(3)
  })

  it('cancels a scheduled chunk retry when its wrapper unmounts', async () => {
    vi.useFakeTimers()
    const loader = vi.fn(async () => { throw new Error('chunk unavailable') })
    const plugin = lazyPluginComponent(loader, 'Loading plugin…', 'Plugin failed to load.')
    wrapper = mount(defineComponent({ setup: () => () => h('section', [h(plugin)]) }))
    await flushPromises()

    expect(loader).toHaveBeenCalledOnce()
    wrapper.unmount()
    wrapper = undefined
    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()

    expect(loader).toHaveBeenCalledOnce()
  })

  it('does not retry a chunk failure that arrives after its wrapper unmounts', async () => {
    vi.useFakeTimers()
    let rejectLoader!: (reason: Error) => void
    const loader = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectLoader = reject }))
    const plugin = lazyPluginComponent(loader, 'Loading plugin…', 'Plugin failed to load.')
    wrapper = mount(defineComponent({ setup: () => () => h('section', [h(plugin)]) }))
    await flushPromises()

    expect(loader).toHaveBeenCalledOnce()
    wrapper.unmount()
    wrapper = undefined
    rejectLoader(new Error('chunk unavailable'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()

    expect(loader).toHaveBeenCalledOnce()
  })

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

  it('contains plugin runtime errors and recovers when the user retries', async () => {
    const brokenComponent = defineComponent({ render: () => { throw new Error('plugin render failed') } })
    const loadedComponent = defineComponent({ setup: () => () => h('p', 'Recovered plugin') })
    const loader = vi.fn()
      .mockResolvedValueOnce(brokenComponent)
      .mockResolvedValueOnce(loadedComponent)
    const plugin = lazyPluginComponent(loader, 'Loading plugin…', 'Plugin failed to load.')
    wrapper = mount(defineComponent({
      setup: () => () => h('section', [h(plugin), h('p', { class: 'sibling' }, 'Other page content')]),
    }))
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('组件运行出错')
    expect(wrapper.get('.sibling').text()).toBe('Other page content')

    await wrapper.get('[aria-label="重试加载"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('section').text()).toContain('Recovered plugin')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
