import { describe, expect, it } from 'vitest'
import { launcherItems } from '../data/defaults'
import { launcherPanelRoutes, panelPlugins, shortcutPanelRoutes } from './registry'

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
})
