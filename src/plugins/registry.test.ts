import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences, launcherItems } from '../data/defaults'
import { getPanelContextForPlugin, getPanelListeners, getPanelProps, launcherPanelRoutes, panelPlugins, shortcutPanelRoutes, type PanelContextById, type PanelPluginContext } from './registry'
import { availableHomeWidgetIds, availablePanelIds, type PanelId } from './ids'
import { getHomeWidgetContextForPlugin, getHomeWidgetProps, homeWidgetPlugins, type HomeWidgetContext, type HomeWidgetContextById } from './widgetRegistry'
import { defaultFocusTimerState } from '../data/focusTimer'

afterEach(() => vi.useRealTimers())

// @ts-expect-error Panels with no declared state must reject accidental context growth.
const invalidEmptyPanelContext: PanelContextById['history'] = { todos: [] }
// @ts-expect-error Standalone widgets with no declared state must reject accidental context growth.
const invalidEmptyWidgetContext: HomeWidgetContextById['calendar-summary'] = { todos: [] }
void invalidEmptyPanelContext
void invalidEmptyWidgetContext

function createPanelContext(): PanelPluginContext {
  return {
    preferences: defaultPreferences,
    backupExportError: '',
    todos: [],
    habits: [],
    countdowns: [],
    notes: [],
    activeNoteId: '',
    weatherCity: '上海',
    customSearchEngines: [],
    focusTimer: defaultFocusTimerState,
    updatePreferences: vi.fn(),
    resetPreferences: vi.fn(),
    openShortcut: vi.fn(),
    openShortcutFromBookmark: vi.fn(),
    importBookmarks: vi.fn(),
    availableShortcutSlots: 500,
    openFolder: vi.fn(),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    addTodo: vi.fn(),
    toggleTodo: vi.fn(),
    updateTodo: vi.fn(),
    removeTodo: vi.fn(),
    clearCompletedTodos: vi.fn(),
    addHabit: vi.fn(),
    updateHabit: vi.fn(),
    toggleHabitToday: vi.fn(),
    removeHabit: vi.fn(),
    addCountdown: vi.fn(),
    updateCountdown: vi.fn(),
    removeCountdown: vi.fn(),
    addNote: vi.fn(),
    selectNote: vi.fn(),
    updateNote: vi.fn(),
    removeNote: vi.fn(),
    updateWeatherCity: vi.fn(),
    addCustomSearchEngine: vi.fn(),
    removeCustomSearchEngine: vi.fn(),
    startFocusTimer: vi.fn(),
    pauseFocusTimer: vi.fn(),
    resetFocusTimer: vi.fn(),
    setFocusDuration: vi.fn(),
  }
}

const homeWidgetContext: HomeWidgetContext = {
  todos: [],
  habits: [],
  countdowns: [],
  notes: [],
  activeNoteId: '',
  weatherCity: '上海',
  focusTimer: defaultFocusTimerState,
}

const expectedPanelAdapters = {
  bookmarks: { props: ['availableSlots', 'importBookmarks'], events: ['addShortcut'] },
  history: { props: [], events: [] },
  calculator: { props: [], events: [] },
  calendar: { props: [], events: [] },
  settings: {
    props: ['preferences', 'exportError', 'customEngines'],
    events: ['update', 'reset', 'addShortcut', 'addFolder', 'exportBackup', 'importBackup', 'addSearchEngine', 'removeSearchEngine'],
  },
  todos: { props: ['items'], events: ['add', 'toggle', 'update', 'remove', 'clearCompleted'] },
  habits: { props: ['items'], events: ['add', 'update', 'toggleToday', 'remove'] },
  'focus-timer': { props: ['state'], events: ['start', 'pause', 'reset', 'setDuration'] },
  notes: { props: ['notes', 'activeId'], events: ['add', 'select', 'update', 'remove'] },
  countdowns: { props: ['items'], events: ['add', 'update', 'remove'] },
  weather: { props: ['city'], events: ['update:city'] },
} satisfies Record<PanelId, { props: string[]; events: string[] }>

const expectedPanelContextKeys = {
  bookmarks: ['openShortcutFromBookmark', 'importBookmarks', 'availableShortcutSlots'],
  history: [],
  calculator: [],
  calendar: [],
  settings: ['preferences', 'backupExportError', 'customSearchEngines', 'updatePreferences', 'resetPreferences', 'openShortcut', 'openFolder', 'exportBackup', 'importBackup', 'addCustomSearchEngine', 'removeCustomSearchEngine'],
  todos: ['todos', 'addTodo', 'toggleTodo', 'updateTodo', 'removeTodo', 'clearCompletedTodos'],
  habits: ['habits', 'addHabit', 'updateHabit', 'toggleHabitToday', 'removeHabit'],
  'focus-timer': ['focusTimer', 'startFocusTimer', 'pauseFocusTimer', 'resetFocusTimer', 'setFocusDuration'],
  notes: ['notes', 'activeNoteId', 'addNote', 'selectNote', 'updateNote', 'removeNote'],
  countdowns: ['countdowns', 'addCountdown', 'updateCountdown', 'removeCountdown'],
  weather: ['weatherCity', 'updateWeatherCity'],
} satisfies Record<PanelId, string[]>

const expectedWidgetProps = {
  'todo-summary': ['items'],
  'habits-summary': ['items'],
  'countdown-summary': ['items'],
  'notes-summary': ['notes', 'activeId'],
  'calendar-summary': [],
  'weather-summary': ['city'],
  'focus-timer-summary': ['state'],
  'bookmarks-summary': [],
  'history-summary': [],
  'news-summary': [],
} satisfies Record<typeof availableHomeWidgetIds[number], string[]>

const expectedWidgetContextKeys = {
  'todo-summary': ['todos'],
  'habits-summary': ['habits'],
  'countdown-summary': ['countdowns'],
  'notes-summary': ['notes', 'activeNoteId'],
  'calendar-summary': [],
  'weather-summary': ['weatherCity'],
  'focus-timer-summary': ['focusTimer'],
  'bookmarks-summary': [],
  'history-summary': [],
  'news-summary': [],
} satisfies Record<typeof availableHomeWidgetIds[number], string[]>

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

  it('keeps every panel adapter aligned with its registered props and event contract', () => {
    const context = createPanelContext()

    for (const id of availablePanelIds) {
      expect(Object.keys(getPanelProps(id, context)).sort(), `${id} props`).toEqual([...expectedPanelAdapters[id].props].sort())
      expect(Object.keys(getPanelListeners(id, context)).sort(), `${id} events`).toEqual([...expectedPanelAdapters[id].events].sort())
    }
  })

  it('passes each built-in panel only its declared context at runtime', () => {
    const context = createPanelContext()
    for (const id of availablePanelIds) {
      expect(Object.keys(getPanelContextForPlugin(id, context)).sort(), `${id} context`).toEqual([...expectedPanelContextKeys[id]].sort())
    }
  })

  it('keeps every registered home widget connected to a valid panel', () => {
    expect(Object.keys(homeWidgetPlugins).sort()).toEqual([...availableHomeWidgetIds].sort())
    expect(Object.keys(defaultPreferences.homeWidgetSizes).sort()).toEqual([...availableHomeWidgetIds].sort())
    for (const [id, widget] of Object.entries(homeWidgetPlugins)) {
      expect(widget.title, `${id} title`).toBeTruthy()
      expect(widget.description, `${id} description`).toBeTruthy()
      if ('panel' in widget && widget.panel) expect(panelPlugins[widget.panel], `${id} panel`).toBeTruthy()
      expect(widget.component, `${id} component`).toBeTruthy()
      expect(typeof widget.props, `${id} props adapter`).toBe('function')
    }
  })

  it('passes the selected weather city to its homepage widget plugin', () => {
    expect(homeWidgetPlugins['weather-summary'].panel).toBe('weather')
    expect(homeWidgetPlugins['weather-summary'].props({ ...homeWidgetContext, weatherCity: '杭州' })).toEqual({ city: '杭州' })
  })

  it('keeps every homepage widget adapter aligned with its registered props contract', () => {
    for (const id of availableHomeWidgetIds) {
      expect(Object.keys(getHomeWidgetProps(id, homeWidgetContext)).sort(), `${id} props`).toEqual([...expectedWidgetProps[id]].sort())
    }
  })

  it('passes each homepage widget only its declared context at runtime', () => {
    for (const id of availableHomeWidgetIds) {
      expect(Object.keys(getHomeWidgetContextForPlugin(id, homeWidgetContext)).sort(), `${id} context`).toEqual([...expectedWidgetContextKeys[id]].sort())
    }
  })

  it('passes shared focus timer state to its panel and homepage widget', () => {
    const state = { ...defaultFocusTimerState, completedSessions: 2 }
    expect(panelPlugins['focus-timer'].props({ ...createPanelContext(), focusTimer: state })).toEqual({ state })
    expect(homeWidgetPlugins['focus-timer-summary'].props({ ...homeWidgetContext, focusTimer: state })).toEqual({ state })
    expect(homeWidgetPlugins['focus-timer-summary'].panel).toBe('focus-timer')
  })

  it('connects the optional browser bookmark widget to the permission-aware panel', () => {
    expect(homeWidgetPlugins['bookmarks-summary'].panel).toBe('bookmarks')
    expect(getHomeWidgetProps('bookmarks-summary', homeWidgetContext)).toEqual({})
  })

  it('connects the optional history widget to its panel', () => {
    expect(homeWidgetPlugins['history-summary'].panel).toBe('history')
    expect(getHomeWidgetProps('history-summary', homeWidgetContext)).toEqual({})
  })

  it('routes the legacy wallpaper shortcut to settings', () => {
    expect(shortcutPanelRoutes.wallpapers).toBe('settings')
  })

  it('adapts bookmark actions through the plugin context', () => {
    const addShortcut = vi.fn()
    const context = { ...createPanelContext(), openShortcutFromBookmark: addShortcut }
    const listeners = panelPlugins.bookmarks.listeners(context)

    listeners.addShortcut?.('Vue Docs', 'https://vuejs.org/')
    expect(addShortcut).toHaveBeenCalledWith('Vue Docs', 'https://vuejs.org/')
  })

  it('passes the available capacity and bulk-import callback to the bookmarks panel', () => {
    const importBookmarks = vi.fn()
    const context = { ...createPanelContext(), availableShortcutSlots: 12, importBookmarks }
    expect(panelPlugins.bookmarks.props(context)).toEqual({ availableSlots: 12, importBookmarks })
  })
})
