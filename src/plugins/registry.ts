import type { Component } from 'vue'
import type { WorkspaceBackup } from '../data/backup'
import type { BookmarkShortcutCandidate, BookmarkShortcutImportResult, CountdownItem, CustomSearchEngine, Habit, Note, Preferences, TodoItem } from '../types'
import type { FocusTimerState } from '../data/focusTimer'
import type { PanelId } from './ids'
import { lazyPluginComponent } from './asyncComponent'

export type { PanelId } from './ids'

export const launcherPanelRoutes = {
  weather: 'weather',
  todos: 'todos',
  habits: 'habits',
  'focus-timer': 'focus-timer',
  notes: 'notes',
  countdowns: 'countdowns',
  settings: 'settings',
  wallpaper: 'settings',
  bookmarks: 'bookmarks',
  history: 'history',
  calculator: 'calculator',
  calendar: 'calendar',
} as const satisfies Record<string, PanelId>

export type LauncherPanelAction = keyof typeof launcherPanelRoutes

export const shortcutPanelRoutes: Readonly<Record<string, PanelId>> = {
  wallpapers: 'settings',
}

export interface PanelPluginContext {
  preferences: Preferences
  backupExportError: string
  todos: TodoItem[]
  habits: Habit[]
  countdowns: CountdownItem[]
  notes: Note[]
  activeNoteId: string
  weatherCity: string
  customSearchEngines: CustomSearchEngine[]
  focusTimer: FocusTimerState
  updatePreferences: (update: Partial<Preferences>) => void
  resetPreferences: () => void
  openShortcut: () => void
  openShortcutFromBookmark: (title: string, url: string) => void
  importBookmarks: (items: BookmarkShortcutCandidate[]) => BookmarkShortcutImportResult
  availableShortcutSlots: number
  openFolder: () => void
  exportBackup: () => void
  importBackup: (backup: WorkspaceBackup, mode: 'merge' | 'replace') => void
  addTodo: (title: string) => void
  toggleTodo: (id: string) => void
  updateTodo: (id: string, title: string) => void
  removeTodo: (id: string) => void
  clearCompletedTodos: () => void
  addHabit: (title: string) => void
  updateHabit: (id: string, title: string) => void
  toggleHabitToday: (id: string) => void
  removeHabit: (id: string) => void
  addCountdown: (title: string, date: string, recurrence: 'once' | 'yearly') => void
  updateCountdown: (id: string, title: string, date: string, recurrence: 'once' | 'yearly') => void
  removeCountdown: (id: string) => void
  addNote: () => void
  selectNote: (id: string) => void
  updateNote: (id: string, field: 'title' | 'body', value: string) => void
  removeNote: (id: string) => void
  updateWeatherCity: (city: string) => void
  addCustomSearchEngine: (name: string, template: string) => void
  removeCustomSearchEngine: (id: string) => void
  startFocusTimer: () => void
  pauseFocusTimer: () => void
  resetFocusTimer: () => void
  setFocusDuration: (minutes: number) => void
}

type NoProps = Record<string, never>
type NoContext = Record<string, never>

export interface PanelContextById {
  bookmarks: Pick<PanelPluginContext, 'openShortcutFromBookmark' | 'importBookmarks' | 'availableShortcutSlots'>
  history: NoContext
  calculator: NoContext
  calendar: NoContext
  settings: Pick<PanelPluginContext, 'preferences' | 'backupExportError' | 'customSearchEngines' | 'updatePreferences' | 'resetPreferences' | 'openShortcut' | 'openFolder' | 'exportBackup' | 'importBackup' | 'addCustomSearchEngine' | 'removeCustomSearchEngine'>
  todos: Pick<PanelPluginContext, 'todos' | 'addTodo' | 'toggleTodo' | 'updateTodo' | 'removeTodo' | 'clearCompletedTodos'>
  habits: Pick<PanelPluginContext, 'habits' | 'addHabit' | 'updateHabit' | 'toggleHabitToday' | 'removeHabit'>
  'focus-timer': Pick<PanelPluginContext, 'focusTimer' | 'startFocusTimer' | 'pauseFocusTimer' | 'resetFocusTimer' | 'setFocusDuration'>
  notes: Pick<PanelPluginContext, 'notes' | 'activeNoteId' | 'addNote' | 'selectNote' | 'updateNote' | 'removeNote'>
  countdowns: Pick<PanelPluginContext, 'countdowns' | 'addCountdown' | 'updateCountdown' | 'removeCountdown'>
  weather: Pick<PanelPluginContext, 'weatherCity' | 'updateWeatherCity'>
}

export interface PanelPropsById {
  bookmarks: { availableSlots: number; importBookmarks: (items: BookmarkShortcutCandidate[]) => BookmarkShortcutImportResult }
  history: NoProps
  calculator: NoProps
  calendar: NoProps
  settings: { preferences: Preferences; exportError: string; customEngines: CustomSearchEngine[] }
  todos: { items: TodoItem[] }
  habits: { items: Habit[] }
  'focus-timer': { state: FocusTimerState }
  notes: { notes: Note[]; activeId: string }
  countdowns: { items: CountdownItem[] }
  weather: { city: string }
}

export interface PanelEventsById {
  bookmarks: { addShortcut: (title: string, url: string) => void }
  history: NoProps
  calculator: NoProps
  calendar: NoProps
  settings: {
    update: (update: Partial<Preferences>) => void
    reset: () => void
    addShortcut: () => void
    addFolder: () => void
    exportBackup: () => void
    importBackup: (backup: WorkspaceBackup, mode: 'merge' | 'replace') => void
    addSearchEngine: (name: string, template: string) => void
    removeSearchEngine: (id: string) => void
  }
  todos: {
    add: (title: string) => void
    toggle: (id: string) => void
    update: (id: string, title: string) => void
    remove: (id: string) => void
    clearCompleted: () => void
  }
  habits: {
    add: (title: string) => void
    update: (id: string, title: string) => void
    toggleToday: (id: string) => void
    remove: (id: string) => void
  }
  'focus-timer': {
    start: () => void
    pause: () => void
    reset: () => void
    setDuration: (minutes: number) => void
  }
  notes: {
    add: () => void
    select: (id: string) => void
    update: (id: string, field: 'title' | 'body', value: string) => void
    remove: (id: string) => void
  }
  countdowns: {
    add: (title: string, date: string, recurrence: 'once' | 'yearly') => void
    update: (id: string, title: string, date: string, recurrence: 'once' | 'yearly') => void
    remove: (id: string) => void
  }
  weather: { 'update:city': (city: string) => void }
}

export interface PanelPlugin<Id extends PanelId = PanelId> {
  title: string
  description: string
  component: Component
  props: (context: PanelContextById[Id]) => PanelPropsById[Id]
  listeners: (context: PanelContextById[Id]) => PanelEventsById[Id]
}

export type PanelPluginRegistry = { [Id in PanelId]: PanelPlugin<Id> }

function lazyPanel(loader: () => Promise<{ default: Component }>) {
  return lazyPluginComponent(loader, '正在加载面板…', '面板加载失败，请重试。')
}

export const panelPlugins = {
  bookmarks: {
    title: '浏览器书签',
    description: '查看当前浏览器中保存的书签',
    component: lazyPanel(() => import('../components/BookmarksPanel.vue')),
    props: (context) => ({ availableSlots: context.availableShortcutSlots, importBookmarks: context.importBookmarks }),
    listeners: (context) => ({ addShortcut: context.openShortcutFromBookmark }),
  },
  history: {
    title: '浏览历史',
    description: '搜索当前浏览器的访问记录',
    component: lazyPanel(() => import('../components/HistoryPanel.vue')),
    props: (_context) => ({}),
    listeners: (_context) => ({}),
  },
  calculator: {
    title: '计算器',
    description: '离线进行四则运算',
    component: lazyPanel(() => import('../components/CalculatorPanel.vue')),
    props: (_context) => ({}),
    listeners: (_context) => ({}),
  },
  calendar: {
    title: '日历',
    description: '查看日期和星期',
    component: lazyPanel(() => import('../components/CalendarPanel.vue')),
    props: (_context) => ({}),
    listeners: (_context) => ({}),
  },
  settings: {
    title: '设置',
    description: '按自己的习惯调整新标签页',
    component: lazyPanel(() => import('../components/SettingsPanel.vue')),
    props: (context) => ({ preferences: context.preferences, exportError: context.backupExportError, customEngines: context.customSearchEngines }),
    listeners: (context) => ({
      update: context.updatePreferences,
      reset: context.resetPreferences,
      addShortcut: context.openShortcut,
      addFolder: context.openFolder,
      exportBackup: context.exportBackup,
      importBackup: context.importBackup,
      addSearchEngine: context.addCustomSearchEngine,
      removeSearchEngine: context.removeCustomSearchEngine,
    }),
  },
  todos: {
    title: '待办事项',
    description: '内容会自动保存在本地',
    component: lazyPanel(() => import('../components/TodoPanel.vue')),
    props: (context) => ({ items: context.todos }),
    listeners: (context) => ({
      add: context.addTodo,
      toggle: context.toggleTodo,
      update: context.updateTodo,
      remove: context.removeTodo,
      clearCompleted: context.clearCompletedTodos,
    }),
  },
  habits: {
    title: '习惯打卡',
    description: '记录每天坚持的小习惯',
    component: lazyPanel(() => import('../components/HabitsPanel.vue')),
    props: (context) => ({ items: context.habits }),
    listeners: (context) => ({
      add: context.addHabit,
      update: context.updateHabit,
      toggleToday: context.toggleHabitToday,
      remove: context.removeHabit,
    }),
  },
  'focus-timer': {
    title: '专注计时',
    description: '专注一段时间，再给自己片刻休息',
    component: lazyPanel(() => import('../components/FocusTimerPanel.vue')),
    props: (context) => ({ state: context.focusTimer }),
    listeners: (context) => ({
      start: context.startFocusTimer,
      pause: context.pauseFocusTimer,
      reset: context.resetFocusTimer,
      setDuration: context.setFocusDuration,
    }),
  },
  notes: {
    title: '笔记',
    description: '内容会自动保存在本地',
    component: lazyPanel(() => import('../components/NotesPanel.vue')),
    props: (context) => ({ notes: context.notes, activeId: context.activeNoteId }),
    listeners: (context) => ({
      add: context.addNote,
      select: context.selectNote,
      update: context.updateNote,
      remove: context.removeNote,
    }),
  },
  countdowns: {
    title: '纪念日与倒计时',
    description: '内容会自动保存在本地',
    component: lazyPanel(() => import('../components/CountdownPanel.vue')),
    props: (context) => ({ items: context.countdowns }),
    listeners: (context) => ({
      add: context.addCountdown,
      update: context.updateCountdown,
      remove: context.removeCountdown,
    }),
  },
  weather: {
    title: '天气',
    description: '内容会自动保存在本地',
    component: lazyPanel(() => import('../components/WeatherPanel.vue')),
    props: (context) => ({ city: context.weatherCity }),
    listeners: (context) => ({ 'update:city': context.updateWeatherCity }),
  },
} satisfies PanelPluginRegistry

type PanelContextAdapterRegistry = {
  [Id in PanelId]: (context: PanelPluginContext) => PanelContextById[Id]
}

const panelContextAdapters = {
  bookmarks: (context) => ({
    openShortcutFromBookmark: context.openShortcutFromBookmark,
    importBookmarks: context.importBookmarks,
    availableShortcutSlots: context.availableShortcutSlots,
  }),
  history: () => ({}),
  calculator: () => ({}),
  calendar: () => ({}),
  settings: (context) => ({
    preferences: context.preferences,
    backupExportError: context.backupExportError,
    customSearchEngines: context.customSearchEngines,
    updatePreferences: context.updatePreferences,
    resetPreferences: context.resetPreferences,
    openShortcut: context.openShortcut,
    openFolder: context.openFolder,
    exportBackup: context.exportBackup,
    importBackup: context.importBackup,
    addCustomSearchEngine: context.addCustomSearchEngine,
    removeCustomSearchEngine: context.removeCustomSearchEngine,
  }),
  todos: (context) => ({
    todos: context.todos,
    addTodo: context.addTodo,
    toggleTodo: context.toggleTodo,
    updateTodo: context.updateTodo,
    removeTodo: context.removeTodo,
    clearCompletedTodos: context.clearCompletedTodos,
  }),
  habits: (context) => ({
    habits: context.habits,
    addHabit: context.addHabit,
    updateHabit: context.updateHabit,
    toggleHabitToday: context.toggleHabitToday,
    removeHabit: context.removeHabit,
  }),
  'focus-timer': (context) => ({
    focusTimer: context.focusTimer,
    startFocusTimer: context.startFocusTimer,
    pauseFocusTimer: context.pauseFocusTimer,
    resetFocusTimer: context.resetFocusTimer,
    setFocusDuration: context.setFocusDuration,
  }),
  notes: (context) => ({
    notes: context.notes,
    activeNoteId: context.activeNoteId,
    addNote: context.addNote,
    selectNote: context.selectNote,
    updateNote: context.updateNote,
    removeNote: context.removeNote,
  }),
  countdowns: (context) => ({
    countdowns: context.countdowns,
    addCountdown: context.addCountdown,
    updateCountdown: context.updateCountdown,
    removeCountdown: context.removeCountdown,
  }),
  weather: (context) => ({ weatherCity: context.weatherCity, updateWeatherCity: context.updateWeatherCity }),
} satisfies PanelContextAdapterRegistry

export function getPanelContextForPlugin<Id extends PanelId>(id: Id, context: PanelPluginContext): PanelContextById[Id] {
  return panelContextAdapters[id](context) as PanelContextById[Id]
}

export function getPanelProps<Id extends PanelId>(id: Id, context: PanelPluginContext): PanelPropsById[Id] {
  const plugin = panelPlugins[id] as unknown as PanelPlugin<Id>
  const pluginContext = getPanelContextForPlugin(id, context)
  return plugin.props(pluginContext)
}

export function getPanelListeners<Id extends PanelId>(id: Id, context: PanelPluginContext): PanelEventsById[Id] {
  const plugin = panelPlugins[id] as unknown as PanelPlugin<Id>
  const pluginContext = getPanelContextForPlugin(id, context)
  return plugin.listeners(pluginContext)
}
