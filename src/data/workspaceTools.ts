import type { WorkspaceBackup } from './backup'
import type { BookmarkShortcutCandidate, BookmarkShortcutImportResult, Shortcut } from '../types'
import type { HomeWorkspace } from './homeWorkspaces'

export type ShortcutBatch =
  | { ids: string[]; kind: 'move'; workspaceId: string }
  | { ids: string[]; kind: 'tag' | 'untag'; tag: string }
  | { ids: string[]; kind: 'delete' }

export interface WorkspaceTools {
  shortcuts: Shortcut[]
  workspaces: HomeWorkspace[]
  activeId: string
  getBackup: () => WorkspaceBackup
  restore: (backup: WorkspaceBackup, mode: 'merge' | 'replace') => string | undefined
  batch: (action: ShortcutBatch, expected?: string) => Promise<string | undefined>
  importBookmarks: (items: BookmarkShortcutCandidate[]) => BookmarkShortcutImportResult
}
