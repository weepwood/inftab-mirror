import type { Ref } from 'vue'
import type { WorkspaceBackup } from '../data/backup'
import type { CountdownItem, CustomSearchEngine, Habit, Note, Preferences, Shortcut, ShortcutFolder, TodoItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { FocusTimerState } from '../data/focusTimerState'

export type BackupCells = {
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
}

export function createBackupActions(state:BackupCells){
  const { preferences, shortcuts, folders, launcherOrder, homeWorkspaces, activeHomeWorkspaceId, todos, habits, countdowns, notes, customSearchEngines, focusTimer, activeNoteId, weatherCity } = state
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

  let restoring=false
  async function restoreBackup(backup:WorkspaceBackup,mode:'merge'|'replace'):Promise<string|undefined>{
    if(restoring)return '已有备份正在导入，请稍后重试。'
    restoring=true
    try {
      const expected=JSON.stringify({...createBackup(),exportedAt:''})
      const { restoreWorkspaceBackup }=await import('./workspaceBackup')
      if(JSON.stringify({...createBackup(),exportedAt:''})!==expected)return '导入期间数据已变化，请重新确认。'
      return restoreWorkspaceBackup(state,backup,mode)
    }catch{return '导入失败：无法加载恢复模块，未修改当前工作区。'}
    finally{restoring=false}
  }
  return {createBackup,restoreBackup}
}
