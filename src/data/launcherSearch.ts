import type { HomeWorkspace } from './homeWorkspaces'
import type { LauncherItem, ShortcutFolder } from '../types'

export interface LauncherSearchMatch {
  item: LauncherItem
  workspaceId: string
  workspaceName: string
  folderTitle?: string
}

interface SearchOptions {
  items: LauncherItem[]
  folders: ShortcutFolder[]
  workspaces: HomeWorkspace[]
  activeWorkspaceId: string
  hiddenItemIds: string[]
  query: string
  allWorkspaces?: boolean
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()

// Search only local records. Keep the original launcher order for equal scores,
// prefer this workspace, and return shared built-in tools just once.
export function findLauncherMatches(options: SearchOptions): LauncherSearchMatch[] {
  const needle = normalize(options.query).trim()
  if (!needle) return []
  const terms = needle.split(/\s+/u)
  const hidden = new Set(options.hiddenItemIds)
  const seen = new Set<string>()
  const workspaces = [
    ...options.workspaces.filter((workspace) => workspace.id === options.activeWorkspaceId),
    ...(options.allWorkspaces ? options.workspaces.filter((workspace) => workspace.id !== options.activeWorkspaceId) : []),
  ]
  const matches: { match: LauncherSearchMatch; score: number }[] = []
  for (const workspace of workspaces) {
    const members = new Set(workspace.itemIds)
    const folderNames = new Map(options.folders.filter((folder) => members.has(folder.id))
      .flatMap((folder) => folder.shortcutIds.map((id) => [id, folder.title] as const)))
    for (const item of options.items) {
      if (!members.has(item.id) || hidden.has(item.id) || seen.has(item.id)) continue
      seen.add(item.id)
      const folderTitle = item.shortcut ? folderNames.get(item.id) : undefined
      const title = normalize(item.title)
      const url = normalize(item.shortcut?.url ?? '')
      const context = normalize(`${folderTitle ?? ''} ${item.action ? '' : workspace.name} ${item.shortcut?.tags?.join(' ') ?? ''}`)
      if (!terms.every((term) => `${title} ${url} ${context}`.includes(term))) continue
      const score = title === needle ? 0 : title.startsWith(needle) ? 1
        : terms.every((term) => title.includes(term)) ? 2
          : terms.every((term) => url.includes(term)) ? 3 : 4
      matches.push({ match: { item, workspaceId: workspace.id, workspaceName: workspace.name, folderTitle }, score })
    }
  }
  return matches.sort((left, right) => left.score - right.score).map(({ match }) => match)
}
