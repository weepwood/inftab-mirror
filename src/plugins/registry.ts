import type { Component } from 'vue'
import CountdownPanel from '../components/CountdownPanel.vue'
import NotesPanel from '../components/NotesPanel.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import TodoPanel from '../components/TodoPanel.vue'
import WeatherPanel from '../components/WeatherPanel.vue'
import type { WorkspaceBackup } from '../data/backup'
import type { CountdownItem, CustomSearchEngine, Note, Preferences, TodoItem } from '../types'

export const launcherPanelRoutes = {
  weather: 'weather',
  todos: 'todos',
  notes: 'notes',
  countdowns: 'countdowns',
  settings: 'settings',
  wallpaper: 'settings',
} as const

export type LauncherPanelAction = keyof typeof launcherPanelRoutes

export const shortcutPanelRoutes: Readonly<Record<string, PanelId>> = {
  wallpapers: 'settings',
}

export interface PanelPluginContext {
  preferences: Preferences
  backupExportError: string
  todos: TodoItem[]
  countdowns: CountdownItem[]
  notes: Note[]
  activeNoteId: string
  weatherCity: string
  customSearchEngines: CustomSearchEngine[]
  updatePreferences: (update: Partial<Preferences>) => void
  resetPreferences: () => void
  openShortcut: () => void
  openFolder: () => void
  exportBackup: () => void
  importBackup: (backup: WorkspaceBackup, mode: 'merge' | 'replace') => void
  addTodo: (title: string) => void
  toggleTodo: (id: string) => void
  updateTodo: (id: string, title: string) => void
  removeTodo: (id: string) => void
  clearCompletedTodos: () => void
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
}

export interface PanelPlugin {
  title: string
  description: string
  component: Component
  props: (context: PanelPluginContext) => Record<string, unknown>
  listeners: (context: PanelPluginContext) => Record<string, (...args: never[]) => void>
}

export const panelPlugins = {
  settings: {
    title: '设置',
    description: '按自己的习惯调整新标签页',
    component: SettingsPanel,
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
    component: TodoPanel,
    props: (context) => ({ items: context.todos }),
    listeners: (context) => ({
      add: context.addTodo,
      toggle: context.toggleTodo,
      update: context.updateTodo,
      remove: context.removeTodo,
      clearCompleted: context.clearCompletedTodos,
    }),
  },
  notes: {
    title: '笔记',
    description: '内容会自动保存在本地',
    component: NotesPanel,
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
    component: CountdownPanel,
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
    component: WeatherPanel,
    props: (context) => ({ city: context.weatherCity }),
    listeners: (context) => ({ 'update:city': context.updateWeatherCity }),
  },
} satisfies Record<string, PanelPlugin>

export type PanelId = keyof typeof panelPlugins
