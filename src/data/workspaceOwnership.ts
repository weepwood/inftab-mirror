import { defaultHomeWorkspaceId, type HomeWorkspace } from './homeWorkspaces'

/** Reconcile ownership after concurrent edits without duplicating custom items. */
export function mergeHomeWorkspaceChanges(
  builtInLauncherIds: readonly string[],
  current: HomeWorkspace[],
  previous: HomeWorkspace[],
  external: HomeWorkspace[],
  mergeDefault: (current: HomeWorkspace[], previous: HomeWorkspace[], external: HomeWorkspace[]) => HomeWorkspace[],
) {
  const merged = mergeDefault(current, previous, external)
  const builtInIds = new Set(builtInLauncherIds)
  const getOwners = (workspaces: HomeWorkspace[]) => {
    const owners = new Map<string, string>()
    for (const workspace of workspaces) {
      for (const itemId of workspace.itemIds) {
        if (!builtInIds.has(itemId) && !owners.has(itemId)) owners.set(itemId, workspace.id)
      }
    }
    return owners
  }
  const previousOwners = getOwners(previous)
  const currentOwners = getOwners(current)
  const externalOwners = getOwners(external)
  const allItemIds = new Set([...previousOwners.keys(), ...currentOwners.keys(), ...externalOwners.keys()])
  const ownerByItem = new Map<string, string | undefined>()

  for (const itemId of allItemIds) {
    const previousOwner = previousOwners.get(itemId)
    const currentOwner = currentOwners.get(itemId)
    const externalOwner = externalOwners.get(itemId)
    const localChanged = currentOwner !== previousOwner
    const externalChanged = externalOwner !== previousOwner
    ownerByItem.set(itemId, externalChanged ? externalOwner : localChanged ? currentOwner : previousOwner)
  }

  const mergedWorkspaceIds = new Set(merged.map((workspace) => workspace.id))
  for (const [itemId, ownerId] of ownerByItem) {
    if (ownerId && !mergedWorkspaceIds.has(ownerId)) ownerByItem.set(itemId, defaultHomeWorkspaceId)
  }
  const resolvedItemsByWorkspace = new Map<string, string[]>()
  for (const [itemId, ownerId] of ownerByItem) {
    if (!ownerId || !mergedWorkspaceIds.has(ownerId)) continue
    const resolvedItems = resolvedItemsByWorkspace.get(ownerId) ?? []
    resolvedItems.push(itemId)
    resolvedItemsByWorkspace.set(ownerId, resolvedItems)
  }

  return merged.map((workspace) => ({
    ...workspace,
    itemIds: [
      ...workspace.itemIds.filter((itemId) => !ownerByItem.has(itemId)),
      ...(resolvedItemsByWorkspace.get(workspace.id) ?? []),
    ],
  }))
}
