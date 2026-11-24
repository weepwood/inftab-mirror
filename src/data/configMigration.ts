import type { Preferences } from '../types'
import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'

export const migrationGroups = ['appearance', 'layout', 'widgets', 'entries'] as const
export type MigrationGroup = typeof migrationGroups[number]
const appearanceKeys = ['themeMode','themePalette','customTheme','themePresets','wallpaper','customWallpaper','wallpaperRotation','wallpaperRotationLastAt','shade'] as const satisfies readonly (keyof Preferences)[]
const layoutKeys = ['columns','rows','iconSize','iconRadius','showNames','gridGapX','gridGapY','gridTopGap','searchWidth','searchHeight','showSearchBar','showClock','pageTransitionMs','pageTransitionEffect','hoverGlow'] as const satisfies readonly (keyof Preferences)[]
const widgetKeys = ['homeWidgetIds','homeWidgetSizes'] as const satisfies readonly (keyof Preferences)[]
const entryKeys = ['dockItemIds','hiddenLauncherIds','dockMagnification','dockFollowLauncherSize','dockIconSize','dockIconGap'] as const satisfies readonly (keyof Preferences)[]

/** Replace selected groups only. Entry membership, folders, order and Dock are inseparable. */
export function planConfigMigration(current: WorkspaceBackup, source: WorkspaceBackup, selected: readonly MigrationGroup[]): WorkspaceBackup {
  if (!selected.length || selected.some(group => !migrationGroups.includes(group))) throw new Error('请选择有效的迁移分类。')
  const preferences = { ...current.preferences }
  function copy(keys: readonly (keyof Preferences)[]) {
    for (const key of keys) Object.assign(preferences, { [key]: source.preferences[key] })
  }
  if (selected.includes('appearance')) {
    copy(appearanceKeys)
    // An older file has no custom theme or presets; retain local optional fields.
    if (source.preferences.customTheme === undefined) preferences.customTheme = current.preferences.customTheme
    if (source.preferences.themePresets === undefined) preferences.themePresets = current.preferences.themePresets
  }
  if (selected.includes('layout')) copy(layoutKeys)
  if (selected.includes('widgets')) copy(widgetKeys)
  const entries = selected.includes('entries')
  if (entries) copy(entryKeys)
  const next: WorkspaceBackup = {
    ...current, preferences,
    ...(entries ? { shortcuts: source.shortcuts, folders: source.folders, launcherOrder: source.launcherOrder, homeWorkspaces: source.homeWorkspaces, activeHomeWorkspaceId: source.activeHomeWorkspaceId } : {}),
  }
  // Validate the entire assembled snapshot before any state writes.
  return parseWorkspaceBackup(next)
}
