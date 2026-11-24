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
type IndexOptions = Omit<SearchOptions, 'query' | 'allWorkspaces' | 'activeWorkspaceId'>
interface IndexedMatch {
  match: LauncherSearchMatch
  title: string
  url: string
  text: string
}
const normalize = (value: string) => value.normalize('NFKC').toLowerCase()

/** Construct once per source-data revision; typing never rebuilds the index. */
export function createLauncherSearchIndex(options: IndexOptions) {
  const hidden = new Set(options.hiddenItemIds)
  const byId = new Map(options.items.map((item, index) => [item.id, { item, index }]))
  const normalized = new Map(options.items.map(item => [item.id, {
    title: normalize(item.title),
    url: normalize(item.shortcut?.url ?? ''),
    tags: normalize(item.shortcut?.tags?.join(' ') ?? ''),
  }]))
  const rows = options.workspaces.map(workspace => {
    const members = new Set(workspace.itemIds)
    // Preserve source-folder order, including the last-wins rule for duplicate membership.
    const folderNames = new Map(options.folders.filter(folder => members.has(folder.id))
      .flatMap(folder => folder.shortcutIds.map(id => [id, folder.title] as const)))
    const entries = [...members].flatMap(id => {
      const record = byId.get(id)
      return record && !hidden.has(id) ? [record] : []
    }).sort((a,b) => a.index-b.index).map(({item}): IndexedMatch => {
      const folderTitle = item.shortcut ? folderNames.get(item.id) : undefined
      const {title, url, tags} = normalized.get(item.id)!
      const context = normalize(`${folderTitle ?? ''} ${item.action ? '' : workspace.name} ${tags}`)
      return {match:{item,workspaceId:workspace.id,workspaceName:workspace.name,folderTitle},title,url,text:`${title} ${url} ${context}`}
    })
    return { id: workspace.id, entries }
  })
  const workspaceById = new Map(rows.map(row => [row.id,row]))
  return {
    search(query: string, activeWorkspaceId: string, allWorkspaces = false): LauncherSearchMatch[] {
      const needle = normalize(query).trim()
      if (!needle) return []
      const terms = needle.split(/\s+/u)
      const active = workspaceById.get(activeWorkspaceId)
      const scopes = [...(active ? [active] : []), ...(allWorkspaces ? rows.filter(row => row.id !== activeWorkspaceId) : [])]
      const seen = new Set<string>()
      const buckets: LauncherSearchMatch[][] = [[],[],[],[],[]]
      for (const scope of scopes) for (const entry of scope.entries) {
        if (seen.has(entry.match.item.id)) continue
        seen.add(entry.match.item.id)
        if (!terms.every(term => entry.text.includes(term))) continue
        const score = entry.title === needle ? 0 : entry.title.startsWith(needle) ? 1
          : terms.every(term => entry.title.includes(term)) ? 2
            : terms.every(term => entry.url.includes(term)) ? 3 : 4
        buckets[score]!.push(entry.match)
      }
      return buckets.flat()
    },
  }
}

export function findLauncherMatches(options: SearchOptions): LauncherSearchMatch[] {
  if (!options.query.trim()) return []
  return createLauncherSearchIndex(options).search(options.query, options.activeWorkspaceId, options.allWorkspaces)
}
