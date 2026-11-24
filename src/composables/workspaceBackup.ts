import type { Ref } from 'vue'
import type { WorkspaceBackup } from '../data/backup'
import type { CountdownItem, CustomSearchEngine, Habit, Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'
import { defaultPreferences } from '../data/defaults'
import { defaultHomeWorkspace, maxHomeWorkspaces, sanitizeActiveHomeWorkspaceId, sanitizeHomeWorkspaces, type HomeWorkspace } from '../data/homeWorkspaces'
import { sanitizeActiveNoteId, sanitizeCountdowns, sanitizeCustomSearchEngines, sanitizeFolders, sanitizeHabits, sanitizeLauncherOrder, sanitizeNotes, sanitizePreferences, sanitizeShortcuts, sanitizeTodos, sanitizeWeatherCity } from '../data/sanitize'
import { defaultFocusTimerState, sanitizeFocusTimerState, type FocusTimerState } from '../data/focusTimerState'
import { maxHabits } from '../data/habits'
import { mergeById } from '../data/mergeById'

/** Backup snapshot and validated import orchestration. The public format remains v1. */
export function createBackupActions(state: {
  preferences: Ref<Preferences>
  shortcuts: Ref<Shortcut[]>
  folders: Ref<ShortcutFolder[]>
  launcherOrder: Ref<string[]>
  homeWorkspaces: Ref<HomeWorkspace[]>
  activeHomeWorkspaceId: Ref<string>
  builtInLauncherIds: string[]
  todos: Ref<TodoItem[]>
  habits: Ref<Habit[]>
  countdowns: Ref<CountdownItem[]>
  notes: Ref<Note[]>
  customSearchEngines: Ref<CustomSearchEngine[]>
  focusTimer: Ref<FocusTimerState>
  activeNoteId: Ref<string>
  weatherCity: Ref<string>
}, detached = false) {
  const { preferences, shortcuts, folders, launcherOrder, homeWorkspaces, activeHomeWorkspaceId, todos, habits, countdowns, notes, customSearchEngines, focusTimer, activeNoteId, weatherCity, builtInLauncherIds } = state
  function createBackup(): WorkspaceBackup {
    const snapshot: WorkspaceBackup = {
      format: 'inftab-workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: preferences.value,
      shortcuts: shortcuts.value,
      folders: folders.value,
      launcherOrder: [...launcherOrder.value],
      todos: todos.value,
      habits: habits.value,
      countdowns: countdowns.value,
      notes: notes.value,
      customSearchEngines: customSearchEngines.value,
      focusTimer: focusTimer.value,
      activeNoteId: activeNoteId.value,
      weatherCity: weatherCity.value,
      homeWorkspaces: homeWorkspaces.value,
      activeHomeWorkspaceId: activeHomeWorkspaceId.value,
    }
    return JSON.parse(JSON.stringify(snapshot)) as WorkspaceBackup
  }

  function restoreBackup(backup: WorkspaceBackup, mode: 'merge' | 'replace'): string | undefined {
    if (!detached) {
      const { builtInLauncherIds, ...live } = state
      const staged = Object.fromEntries(Object.entries(live).map(([key, cell]) => [key, { value: JSON.parse(JSON.stringify(cell.value)) }])) as typeof live
      try {
        const error = createBackupActions({ ...staged, builtInLauncherIds }, true).restoreBackup(backup, mode)
        if (error) return error
      } catch {
        return '导入失败：备份数据无效，未修改当前工作区。'
      }
      // Apply the fully computed result only after every section validates.
      // Order dependent references after their owning collections.
      for (const key of ['customSearchEngines', 'shortcuts', 'folders', 'launcherOrder', 'homeWorkspaces', 'activeHomeWorkspaceId', 'todos', 'habits', 'countdowns', 'notes', 'activeNoteId', 'weatherCity', 'focusTimer', 'preferences'] as const) {
        const cell = live[key] as Ref<unknown>
        if (JSON.stringify(cell.value) !== JSON.stringify(staged[key].value)) cell.value = staged[key].value
      }
      return undefined
    }
    if (backup.homeWorkspaces && backup.homeWorkspaces.length > maxHomeWorkspaces) {
      return `导入失败：主页工作区超过数量上限（最多 ${maxHomeWorkspaces} 组），未导入任何数据。`
    }
    const importedShortcuts = sanitizeShortcuts(backup.shortcuts)
    const importedFolders = sanitizeFolders(backup.folders, importedShortcuts)
    const importedTodos = sanitizeTodos(backup.todos)
    const importedHabits = sanitizeHabits(backup.habits ?? [])
    const importedCountdowns = sanitizeCountdowns(backup.countdowns)
    const importedNotes = sanitizeNotes(backup.notes)
    const importedCustomSearchEngines = sanitizeCustomSearchEngines(backup.customSearchEngines ?? [])
    if (mode === 'replace') {
      customSearchEngines.value = importedCustomSearchEngines
      shortcuts.value = importedShortcuts
      folders.value = importedFolders
      launcherOrder.value = sanitizeLauncherOrder(backup.launcherOrder, importedShortcuts, importedFolders)
      todos.value = importedTodos
      habits.value = importedHabits
      countdowns.value = importedCountdowns
      notes.value = importedNotes
      activeNoteId.value = sanitizeActiveNoteId(backup.activeNoteId, importedNotes)
      weatherCity.value = sanitizeWeatherCity(backup.weatherCity)
      focusTimer.value = backup.focusTimer ? sanitizeFocusTimerState(backup.focusTimer) : structuredClone(defaultFocusTimerState)
      preferences.value = sanitizePreferences(backup.preferences)
      const allowedWorkspaceItemIds = new Set([
        ...builtInLauncherIds,
        ...importedShortcuts.map((item) => item.id),
        ...importedFolders.map((item) => item.id),
      ])
      homeWorkspaces.value = sanitizeHomeWorkspaces(
        backup.homeWorkspaces ?? [defaultHomeWorkspace(backup.launcherOrder)],
        backup.launcherOrder,
        builtInLauncherIds,
        allowedWorkspaceItemIds,
      )
      activeHomeWorkspaceId.value = sanitizeActiveHomeWorkspaceId(backup.activeHomeWorkspaceId, homeWorkspaces.value)
      if (preferences.value.engine.startsWith('custom:')
        && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
        preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
      }
      return undefined
    }
    const existingFolderIds = new Set(folders.value.map((folder) => folder.id))
    const existingShortcutIds = new Set(shortcuts.value.map((shortcut) => shortcut.id))
    const hasCrossTypeIdConflict = importedShortcuts.some((shortcut) => existingFolderIds.has(shortcut.id))
      || importedFolders.some((folder) => existingShortcutIds.has(folder.id))
    if (hasCrossTypeIdConflict) {
      return '合并失败：导入内容与现有文件夹或快捷入口使用了相同的入口 ID，未导入任何数据。请修改备份中的冲突 ID 后重试。'
    }
    const mergeLimits = [
      { label: '快捷入口', current: shortcuts.value, incoming: importedShortcuts, limit: 500 },
      { label: '文件夹', current: folders.value, incoming: importedFolders, limit: 500 },
      { label: '待办事项', current: todos.value, incoming: importedTodos, limit: 500 },
      { label: '习惯', current: habits.value, incoming: importedHabits, limit: maxHabits },
      { label: '纪念日', current: countdowns.value, incoming: importedCountdowns, limit: 500 },
      { label: '笔记', current: notes.value, incoming: importedNotes, limit: 500 },
      { label: '自定义搜索引擎', current: customSearchEngines.value, incoming: importedCustomSearchEngines, limit: 20 },
    ]
    const overLimitSections = mergeLimits.flatMap(({ label, current, incoming, limit }) => {
      const currentIds = new Set(current.map((item) => item.id))
      const newIds = new Set(incoming.map((item) => item.id).filter((id) => !currentIds.has(id)))
      return current.length + newIds.size > limit ? [label] : []
    })
    if (overLimitSections.length) {
      return `合并失败：${overLimitSections.join('、')}将超过数量上限，未导入任何数据。请先整理现有内容，或选择覆盖导入。`
    }
    const existingById = new Map(shortcuts.value.map(item => [item.id, item]))
    const mergedShortcutItems = sanitizeShortcuts(mergeById(shortcuts.value, importedShortcuts.map(item => item.tags === undefined && existingById.get(item.id)?.tags !== undefined ? { ...item, tags: existingById.get(item.id)!.tags } : item)))
    const mergedFolderItems = sanitizeFolders(mergeById(folders.value, importedFolders), mergedShortcutItems)
    const allowedWorkspaceItemIds = new Set([
      ...builtInLauncherIds,
      ...mergedShortcutItems.map((item) => item.id),
      ...mergedFolderItems.map((item) => item.id),
    ])
    const incomingWorkspaces = sanitizeHomeWorkspaces(
      backup.homeWorkspaces ?? [defaultHomeWorkspace(backup.launcherOrder)],
      backup.launcherOrder,
      builtInLauncherIds,
      allowedWorkspaceItemIds,
    )
    const mergedWorkspaceIds = new Set([
      ...homeWorkspaces.value.map((workspace) => workspace.id),
      ...incomingWorkspaces.map((workspace) => workspace.id),
    ])
    if (mergedWorkspaceIds.size > maxHomeWorkspaces) {
      return `合并失败：主页工作区将超过数量上限（最多 ${maxHomeWorkspaces} 组），未导入任何数据。`
    }
    customSearchEngines.value = sanitizeCustomSearchEngines(mergeById(customSearchEngines.value, importedCustomSearchEngines))
    shortcuts.value = mergedShortcutItems
    folders.value = mergedFolderItems
    const incomingWorkspaceById = new Map(incomingWorkspaces.map((workspace) => [workspace.id, workspace]))
    const existingWorkspaceIds = new Set(homeWorkspaces.value.map((workspace) => workspace.id))
    const mergedWorkspaces = homeWorkspaces.value.map((existing) => {
      const incoming = incomingWorkspaceById.get(existing.id)
      return incoming
        ? { ...incoming, ...(incoming.layout === undefined && existing.layout ? { layout: existing.layout } : {}), ...(incoming.desktop === undefined && existing.desktop ? { desktop: existing.desktop } : {}), itemIds: [...new Set([...existing.itemIds, ...incoming.itemIds])] }
        : existing
    })
    for (const incoming of incomingWorkspaces) {
      if (!existingWorkspaceIds.has(incoming.id)) mergedWorkspaces.push(incoming)
    }
    const importedActiveWorkspaceId = incomingWorkspaceById.has(backup.activeHomeWorkspaceId ?? '')
      ? backup.activeHomeWorkspaceId
      : activeHomeWorkspaceId.value
    homeWorkspaces.value = sanitizeHomeWorkspaces(mergedWorkspaces, launcherOrder.value, builtInLauncherIds, allowedWorkspaceItemIds)
    activeHomeWorkspaceId.value = sanitizeActiveHomeWorkspaceId(importedActiveWorkspaceId, homeWorkspaces.value)
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...backup.launcherOrder], shortcuts.value, folders.value)
    todos.value = sanitizeTodos(mergeById(todos.value, importedTodos))
    habits.value = sanitizeHabits(mergeById(habits.value, importedHabits))
    countdowns.value = sanitizeCountdowns(mergeById(countdowns.value, importedCountdowns))
    notes.value = sanitizeNotes(mergeById(notes.value, importedNotes))
    preferences.value = sanitizePreferences({ ...preferences.value, ...backup.preferences })
    if (preferences.value.engine.startsWith('custom:')
      && !customSearchEngines.value.some((engine) => 'custom:' + engine.id === preferences.value.engine)) {
      preferences.value = sanitizePreferences({ ...preferences.value, engine: defaultPreferences.engine })
    }
    const preferredNoteId = backup.notes.some((note) => note.id === backup.activeNoteId) ? backup.activeNoteId : activeNoteId.value
    activeNoteId.value = sanitizeActiveNoteId(preferredNoteId, notes.value)
    weatherCity.value = sanitizeWeatherCity(backup.weatherCity || weatherCity.value)
    if (backup.focusTimer) focusTimer.value = sanitizeFocusTimerState(backup.focusTimer)
    return undefined
  }

  return { createBackup, restoreBackup }
}
