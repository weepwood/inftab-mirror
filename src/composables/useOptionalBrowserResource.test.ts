// @vitest-environment jsdom
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOptionalBrowserResource, type OptionalBrowserResourceOptions } from './useOptionalBrowserResource'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

function mountResource(options: OptionalBrowserResourceOptions<string[]>) {
  let state: ReturnType<typeof useOptionalBrowserResource<string[]>> | undefined
  wrapper = mount(defineComponent({
    setup() {
      state = useOptionalBrowserResource(options)
      return () => h('output', `${state!.permissionGranted.value}|${state!.data.value.join(',')}|${state!.error.value}`)
    },
  }))
  return { getState: () => state!, wrapper }
}

function permissionOptions(overrides: Partial<OptionalBrowserResourceOptions<string[]>> = {}) {
  return {
    supported: true,
    initial: [],
    hasPermission: vi.fn().mockResolvedValue(true),
    subscribeToPermissionChanges: vi.fn(() => () => {}),
    load: vi.fn().mockResolvedValue(['saved item']),
    permissionError: 'Cannot verify permission.',
    resourceError: 'Cannot load data.',
    ...overrides,
  } satisfies OptionalBrowserResourceOptions<string[]>
}

describe('optional browser resource lifecycle', () => {
  it('does not load an optional resource when refresh is called without permission', async () => {
    const options = permissionOptions({ hasPermission: vi.fn().mockResolvedValue(false) })
    const { getState } = mountResource(options)
    await flushPromises()

    await getState().refresh()

    expect(getState().permissionGranted.value).toBe(false)
    expect(options.load).not.toHaveBeenCalled()
  })

  it('clears protected data and listeners if a permission recheck fails', async () => {
    let onPermissionChange: (() => void) | undefined
    let onResourceChange: (() => void) | undefined
    const stopResourceListener = vi.fn()
    const subscribeToChanges = vi.fn((listener: () => void) => {
      onResourceChange = listener
      return stopResourceListener
    })
    const hasPermission = vi.fn().mockResolvedValue(true)
    const options = permissionOptions({
      hasPermission,
      subscribeToPermissionChanges: vi.fn((listener: () => void) => {
        onPermissionChange = listener
        return vi.fn()
      }),
      subscribeToChanges,
    })
    const { wrapper: mounted } = mountResource(options)

    await vi.waitFor(() => expect(mounted.text()).toContain('true|saved item|'))
    hasPermission.mockRejectedValueOnce(new Error('permission API failed'))
    onPermissionChange?.()
    await vi.waitFor(() => expect(mounted.text()).toBe('false||Cannot verify permission.'))

    expect(stopResourceListener).toHaveBeenCalledOnce()
    expect(options.load).toHaveBeenCalledOnce()
    expect(onResourceChange).toBeTypeOf('function')
  })

  it('clears permission-scoped data immediately when permission changes during a load', async () => {
    let onPermissionChange: (() => void) | undefined
    let resolvePermissionRecheck!: (granted: boolean) => void
    let resolvePendingLoad!: (items: string[]) => void
    const hasPermission = vi.fn()
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(new Promise<boolean>((resolve) => { resolvePermissionRecheck = resolve }))
    const load = vi.fn()
      .mockReturnValueOnce(new Promise<string[]>((resolve) => { resolvePendingLoad = resolve }))
    const options = permissionOptions({
      hasPermission,
      load,
      subscribeToPermissionChanges: vi.fn((listener: () => void) => {
        onPermissionChange = listener
        return vi.fn()
      }),
    })
    const { getState } = mountResource(options)
    await flushPromises()
    expect(load).toHaveBeenCalledOnce()

    onPermissionChange?.()
    expect(getState().permissionGranted.value).toBe(false)
    expect(getState().data.value).toEqual([])
    expect(getState().loading.value).toBe(false)

    resolvePendingLoad(['stale protected item'])
    await flushPromises()
    expect(getState().data.value).toEqual([])

    resolvePermissionRecheck(false)
    await flushPromises()
    expect(getState().permissionGranted.value).toBe(false)
    expect(getState().data.value).toEqual([])
  })

  it('ignores resource events delivered after unmount', async () => {
    vi.useFakeTimers()
    let onResourceChange: (() => void) | undefined
    const options = permissionOptions({
      subscribeToChanges: vi.fn((listener: () => void) => {
        onResourceChange = listener
        return vi.fn()
      }),
    })
    const { wrapper: mounted } = mountResource(options)
    await flushPromises()
    await flushPromises()

    mounted.unmount()
    onResourceChange?.()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(options.load).toHaveBeenCalledOnce()
  })

  it('does not load after unmount while the permission check is pending', async () => {
    let resolvePermission: ((granted: boolean) => void) | undefined
    const options = permissionOptions({
      hasPermission: vi.fn(() => new Promise<boolean>((resolve) => { resolvePermission = resolve })),
      subscribeToChanges: vi.fn(() => () => {}),
    })
    const { wrapper: mounted } = mountResource(options)

    mounted.unmount()
    resolvePermission?.(true)
    await flushPromises()

    expect(options.load).not.toHaveBeenCalled()
    expect(options.subscribeToChanges).not.toHaveBeenCalled()
  })
})
