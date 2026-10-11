import { afterEach, describe, expect, it, vi } from 'vitest'
import { launcherItems } from '../data/defaults'
import { launcherPanelRoutes, panelPlugins, retryPanelLoad, shortcutPanelRoutes } from './registry'

afterEach(() => vi.useRealTimers())

describe('built-in panel plugin registry', () => {
  it('routes every launcher action to a registered panel', () => {
    const registeredPanels = new Set(Object.keys(panelPlugins))
    const actions = launcherItems.flatMap((item) => item.action ? [item.action] : [])

    expect(actions.every((action) => action in launcherPanelRoutes)).toBe(true)
    expect(Object.keys(launcherPanelRoutes)).toContain('wallpaper')
    for (const panel of Object.values(launcherPanelRoutes)) expect(registeredPanels.has(panel)).toBe(true)
  })

  it('provides render metadata and adapters for every panel', () => {
    for (const [id, plugin] of Object.entries(panelPlugins)) {
      expect(plugin.title, `${id} title`).toBeTruthy()
      expect(plugin.description, `${id} description`).toBeTruthy()
      expect(plugin.component, `${id} component`).toBeTruthy()
      expect(typeof plugin.props, `${id} props adapter`).toBe('function')
      expect(typeof plugin.listeners, `${id} event adapter`).toBe('function')
    }
  })

  it('routes the legacy wallpaper shortcut to settings', () => {
    expect(shortcutPanelRoutes.wallpapers).toBe('settings')
  })

  it('retries a failed panel chunk twice before showing the error state', () => {
    vi.useFakeTimers()
    const retry = vi.fn()
    const fail = vi.fn()
    const error = new Error('Failed to fetch dynamically imported module')

    retryPanelLoad(error, retry, fail, 1)
    vi.advanceTimersByTime(249)
    expect(retry).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(retry).toHaveBeenCalledOnce()
    expect(fail).not.toHaveBeenCalled()

    retryPanelLoad(error, retry, fail, 2)
    vi.advanceTimersByTime(500)
    expect(retry).toHaveBeenCalledTimes(2)

    retryPanelLoad(error, retry, fail, 3)
    expect(fail).toHaveBeenCalledOnce()
  })
})
