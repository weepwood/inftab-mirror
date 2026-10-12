import { afterEach, describe, expect, it, vi } from 'vitest'
import { launcherItems } from '../data/defaults'
import { launcherPanelRoutes, panelPlugins, shortcutPanelRoutes } from './registry'
import { availableHomeWidgetIds, availablePanelIds } from './ids'
import { homeWidgetPlugins } from './widgetRegistry'
import { defaultFocusTimerState } from '../data/focusTimer'

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
    expect(Object.keys(panelPlugins).sort()).toEqual([...availablePanelIds].sort())
    for (const [id, plugin] of Object.entries(panelPlugins)) {
      expect(plugin.title, `${id} title`).toBeTruthy()
      expect(plugin.description, `${id} description`).toBeTruthy()
      expect(plugin.component, `${id} component`).toBeTruthy()
      expect(typeof plugin.props, `${id} props adapter`).toBe('function')
      expect(typeof plugin.listeners, `${id} event adapter`).toBe('function')
    }
  })

  it('keeps every registered home widget connected to a valid panel', () => {
    expect(Object.keys(homeWidgetPlugins).sort()).toEqual([...availableHomeWidgetIds].sort())
    for (const [id, widget] of Object.entries(homeWidgetPlugins)) {
      expect(widget.title, `${id} title`).toBeTruthy()
      expect(widget.description, `${id} description`).toBeTruthy()
      if (widget.panel) expect(panelPlugins[widget.panel], `${id} panel`).toBeTruthy()
      expect(widget.component, `${id} component`).toBeTruthy()
      expect(typeof widget.props, `${id} props adapter`).toBe('function')
    }
  })

  it('passes the selected weather city to its homepage widget plugin', () => {
    expect(homeWidgetPlugins['weather-summary'].panel).toBe('weather')
    expect(homeWidgetPlugins['weather-summary'].props({ weatherCity: '杭州' } as never)).toEqual({ city: '杭州' })
  })

  it('passes shared focus timer state to its panel and homepage widget', () => {
    const state = { ...defaultFocusTimerState, completedSessions: 2 }
    expect(panelPlugins['focus-timer'].props({ focusTimer: state } as never)).toEqual({ state })
    expect(homeWidgetPlugins['focus-timer-summary'].props({ focusTimer: state } as never)).toEqual({ state })
    expect(homeWidgetPlugins['focus-timer-summary'].panel).toBe('focus-timer')
  })

  it('connects the optional browser bookmark widget to the permission-aware panel', () => {
    expect(homeWidgetPlugins['bookmarks-summary'].panel).toBe('bookmarks')
    expect(homeWidgetPlugins['bookmarks-summary'].props()).toEqual({})
  })

  it('connects the optional history widget to its panel', () => {
    expect(homeWidgetPlugins['history-summary'].panel).toBe('history')
    expect(homeWidgetPlugins['history-summary'].props()).toEqual({})
  })

  it('routes the legacy wallpaper shortcut to settings', () => {
    expect(shortcutPanelRoutes.wallpapers).toBe('settings')
  })

  it('adapts bookmark actions through the plugin context', () => {
    const addShortcut = vi.fn()
    const listeners = panelPlugins.bookmarks.listeners({ openShortcutFromBookmark: addShortcut } as never)

    listeners.addShortcut?.('Vue Docs', 'https://vuejs.org/')
    expect(addShortcut).toHaveBeenCalledWith('Vue Docs', 'https://vuejs.org/')
  })
})
