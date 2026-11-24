import type { WorkspaceBackup } from './backup'
import type { ShortcutBatch } from './workspaceTools'
import { sanitizeShortcutTags, maxShortcutTags } from './shortcutTags'

export function planShortcutBatch(snapshot: WorkspaceBackup, action: ShortcutBatch): WorkspaceBackup {
  const ids = new Set(action.ids)
  if (!ids.size || [...ids].some(id => !snapshot.shortcuts.some(item => item.id === id))) throw new Error('所选入口已变化，请重新选择。')
  const workspaces = snapshot.homeWorkspaces ?? []
  if (action.kind === 'tag' || action.kind === 'untag') {
    const tag = sanitizeShortcutTags([action.tag])[0]
    if (!tag) throw new Error('请输入有效标签。')
    const key = tag.toLowerCase()
    const shortcuts = snapshot.shortcuts.map(item => {
      if (!ids.has(item.id)) return item
      const tags = sanitizeShortcutTags(item.tags)
      const exists = tags.some(value => value.toLowerCase() === key)
      if (action.kind === 'untag') return { ...item, tags: tags.filter(value => value.toLowerCase() !== key) }
      if (exists) return item
      if (tags.length >= maxShortcutTags) throw new Error('所选入口中已有 12 个标签，请先删除部分标签。')
      return { ...item, tags: [...tags, tag] }
    })
    return { ...snapshot, shortcuts }
  }
  if (action.kind === 'move') {
    const destination = workspaces.find(item => item.id === action.workspaceId)
    if (!destination) throw new Error('目标工作区已不存在。')
    return { ...snapshot,
      homeWorkspaces: workspaces.map(item => item.id === destination.id
        ? { ...item, itemIds: [...new Set([...item.itemIds, ...ids])] }
        : { ...item, itemIds: item.itemIds.filter(id => !ids.has(id)) }),
      folders: snapshot.folders.map(folder => destination.itemIds.includes(folder.id) ? folder
        : { ...folder, shortcutIds: folder.shortcutIds.filter(id => !ids.has(id)) }),
    }
  }
  return { ...snapshot,
    shortcuts: snapshot.shortcuts.filter(item => !ids.has(item.id)),
    homeWorkspaces: workspaces.map(item => ({ ...item, itemIds: item.itemIds.filter(id => !ids.has(id)) })),
    folders: snapshot.folders.map(folder => ({ ...folder, shortcutIds: folder.shortcutIds.filter(id => !ids.has(id)) })),
    launcherOrder: snapshot.launcherOrder.filter(id => !ids.has(id)),
    preferences: { ...snapshot.preferences, dockItemIds: snapshot.preferences.dockItemIds.filter(id => !ids.has(id)) },
  }
}
