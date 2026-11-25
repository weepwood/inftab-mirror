import type { Ref } from 'vue'
import type { Preferences, Shortcut, ShortcutFolder } from '../types'
import { defaultHomeWorkspaceId, maxHomeWorkspaceNameLength, maxHomeWorkspaces, type HomeWorkspace } from '../data/homeWorkspaces'
import { isValidLauncherColor, sanitizeShortcuts, sanitizeFolders, sanitizeLauncherOrder, sanitizePreferences } from '../data/sanitize'
import { createLocalId } from '../data/createId'
import { truncateCodePoints } from '../data/text'

export function createLauncherActions({ preferences, shortcuts, folders, launcherOrder, homeWorkspaces, activeHomeWorkspaceId, builtInLauncherIds }: {
  preferences: Ref<Preferences>
  shortcuts: Ref<Shortcut[]>
  folders: Ref<ShortcutFolder[]>
  launcherOrder: Ref<string[]>
  homeWorkspaces: Ref<HomeWorkspace[]>
  activeHomeWorkspaceId: Ref<string>
  builtInLauncherIds: string[]
}) {
  function updateWorkspaceLauncherMembership(id: string, workspaceId: string) {
    if (!homeWorkspaces.value.some((workspace) => workspace.id === workspaceId)) return false
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.id === workspaceId
        ? [...new Set([...workspace.itemIds, id])]
        : workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    return true
  }

  function createHomeWorkspace(name: string): string | undefined {
    if (homeWorkspaces.value.length >= maxHomeWorkspaces) return undefined
    const cleanName = truncateCodePoints(name.trim(), maxHomeWorkspaceNameLength)
    if (!cleanName || homeWorkspaces.value.some((workspace) => workspace.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return undefined
    const id = createLocalId()
    homeWorkspaces.value = [...homeWorkspaces.value, { id, name: cleanName, itemIds: [...builtInLauncherIds] }]
    activeHomeWorkspaceId.value = id
    return id
  }

  function renameHomeWorkspace(id: string, name: string): boolean {
    const cleanName = truncateCodePoints(name.trim(), maxHomeWorkspaceNameLength)
    if (!cleanName || homeWorkspaces.value.some((workspace) => workspace.id !== id && workspace.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return false
    const exists = homeWorkspaces.value.some((workspace) => workspace.id === id)
    if (!exists) return false
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => workspace.id === id ? { ...workspace, name: cleanName } : workspace)
    return true
  }

  function moveHomeWorkspace(id: string, direction: -1 | 1): boolean {
    const index = homeWorkspaces.value.findIndex((workspace) => workspace.id === id)
    const nextIndex = index + direction
    if (index <= 0 || nextIndex <= 0 || nextIndex >= homeWorkspaces.value.length) return false
    const next = [...homeWorkspaces.value]
    const [workspace] = next.splice(index, 1)
    if (!workspace) return false
    next.splice(nextIndex, 0, workspace)
    homeWorkspaces.value = next
    return true
  }

  function removeHomeWorkspace(id: string): boolean {
    if (id === defaultHomeWorkspaceId || !homeWorkspaces.value.some((workspace) => workspace.id === id)) return false
    const removed = homeWorkspaces.value.find((workspace) => workspace.id === id)!
    const defaultItems = removed.itemIds.filter((itemId) => !builtInLauncherIds.includes(itemId))
    homeWorkspaces.value = homeWorkspaces.value
      .filter((workspace) => workspace.id !== id)
      .map((workspace) => workspace.id === defaultHomeWorkspaceId
        ? { ...workspace, itemIds: [...new Set([...workspace.itemIds, ...defaultItems])] }
        : workspace)
    if (activeHomeWorkspaceId.value === id) activeHomeWorkspaceId.value = defaultHomeWorkspaceId
    return true
  }

  function saveShortcut(shortcut: Shortcut, workspaceId = activeHomeWorkspaceId.value): boolean {
    const targetWorkspace = homeWorkspaces.value.find((workspace) => workspace.id === workspaceId)
    if (!targetWorkspace
      || folders.value.some((folder) => folder.id === shortcut.id)
      || !isValidLauncherColor(shortcut.color)) return false
    const exists = shortcuts.value.some((item) => item.id === shortcut.id)
    const next = exists
      ? shortcuts.value.map((item) => item.id === shortcut.id ? shortcut : item)
      : [...shortcuts.value, shortcut]
    const sanitized = sanitizeShortcuts(next)
    if (!sanitized.some((item) => item.id === shortcut.id)) return false
    shortcuts.value = sanitized
    if (!exists && !launcherOrder.value.includes(shortcut.id)) launcherOrder.value = [...launcherOrder.value, shortcut.id]
    updateWorkspaceLauncherMembership(shortcut.id, workspaceId)
    // A link moved to another workspace must not stay hidden inside its old folder.
    folders.value = folders.value.map((folder) => !targetWorkspace.itemIds.includes(folder.id) && folder.shortcutIds.includes(shortcut.id)
      ? { ...folder, shortcutIds: folder.shortcutIds.filter((id) => id !== shortcut.id) }
      : folder)
    return true
  }

  function addShortcuts(items: Shortcut[], workspaceId = activeHomeWorkspaceId.value): boolean {
    if (!items.length || !homeWorkspaces.value.some((workspace) => workspace.id === workspaceId)
      || shortcuts.value.length + items.length > 500) return false
    const existingLauncherIds = new Set([
      ...shortcuts.value.map((item) => item.id),
      ...folders.value.map((item) => item.id),
      ...builtInLauncherIds,
    ])
    const incomingIds = new Set<string>()
    for (const item of items) {
      if (existingLauncherIds.has(item.id) || incomingIds.has(item.id)) return false
      incomingIds.add(item.id)
    }
    const next = sanitizeShortcuts([...shortcuts.value, ...items])
    if (next.length !== shortcuts.value.length + items.length) return false

    shortcuts.value = next
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...items.map((item) => item.id)], shortcuts.value, folders.value)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, itemIds: [...new Set([...workspace.itemIds, ...items.map((item) => item.id)])] }
      : workspace)
    return true
  }

  function removeShortcut(id: string) {
    shortcuts.value = shortcuts.value.filter((shortcut) => shortcut.id !== id)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    folders.value = sanitizeFolders(folders.value.map((folder) => ({
      ...folder,
      shortcutIds: folder.shortcutIds.filter((shortcutId) => shortcutId !== id),
    })), shortcuts.value)
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
    preferences.value = sanitizePreferences({ ...preferences.value, dockItemIds: preferences.value.dockItemIds.filter((itemId) => itemId !== id) })
  }

  function saveFolder(folder: ShortcutFolder, workspaceId = activeHomeWorkspaceId.value): boolean {
    if (!homeWorkspaces.value.some((workspace) => workspace.id === workspaceId) || !isValidLauncherColor(folder.color)) return false
    const exists = folders.value.some((item) => item.id === folder.id)
    const next = exists
      ? folders.value.map((item) => item.id === folder.id ? folder : item)
      : [...folders.value, folder]
    const sanitized = sanitizeFolders(next, shortcuts.value)
    if (!sanitized.some((item) => item.id === folder.id && item.parentId === folder.parentId)) return false
    folders.value = sanitized
    launcherOrder.value = sanitizeLauncherOrder([...launcherOrder.value, ...(exists ? [] : [folder.id])], shortcuts.value, folders.value)
    updateWorkspaceLauncherMembership(folder.id, workspaceId)
    return true
  }

  function removeFolder(id: string) {
    folders.value = folders.value.filter((folder) => folder.id !== id)
    homeWorkspaces.value = homeWorkspaces.value.map((workspace) => ({
      ...workspace,
      itemIds: workspace.itemIds.filter((itemId) => itemId !== id),
    }))
    launcherOrder.value = sanitizeLauncherOrder(launcherOrder.value.filter((itemId) => itemId !== id), shortcuts.value, folders.value)
    preferences.value = sanitizePreferences({ ...preferences.value, dockItemIds: preferences.value.dockItemIds.filter((itemId) => itemId !== id) })
  }

  function setVisibleLauncherOrder(visibleOrder: string[]) {
    const visibleIds = new Set(visibleOrder)
    const next = [...launcherOrder.value]
    const existingIds = new Set(next)
    for (const id of visibleOrder) {
      if (!existingIds.has(id)) {
        next.push(id)
        existingIds.add(id)
      }
    }
    let visibleIndex = 0
    for (let index = 0; index < next.length; index += 1) {
      if (visibleIds.has(next[index]!)) {
        next[index] = visibleOrder[visibleIndex++]!
      }
    }
    launcherOrder.value = next
  }

  function reorderLauncherItems(sourceId: string, targetId: string, currentIds: string[]) {
    const visibleOrder = [...currentIds]
    const sourceIndex = visibleOrder.indexOf(sourceId)
    const targetIndex = visibleOrder.indexOf(targetId)
    if (sourceId === targetId || sourceIndex < 0 || targetIndex < 0) return
    const [source] = visibleOrder.splice(sourceIndex, 1)
    if (!source) return
    visibleOrder.splice(visibleOrder.indexOf(targetId), 0, source)

    setVisibleLauncherOrder(visibleOrder)
  }

  return { createHomeWorkspace, renameHomeWorkspace, moveHomeWorkspace, removeHomeWorkspace, saveShortcut, addShortcuts, removeShortcut, saveFolder, removeFolder, setVisibleLauncherOrder, reorderLauncherItems }
}
