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

  const previousById = new Map(previous.map(workspace => [workspace.id, workspace]))
  const currentById = new Map(current.map(workspace => [workspace.id, workspace]))
  const externalById = new Map(external.map(workspace => [workspace.id, workspace]))
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

  return merged.map((workspace) => {
    const beforeWorkspace=previousById.get(workspace.id),localWorkspace=currentById.get(workspace.id),remoteWorkspace=externalById.get(workspace.id)
    function mergeField<K extends 'layout'|'widgetSlots'|'widgetCanvas'>(key:K):HomeWorkspace[K]{
      const before=JSON.stringify(beforeWorkspace?.[key])
      if(remoteWorkspace&&JSON.stringify(remoteWorkspace[key])!==before)return remoteWorkspace[key]
      if(localWorkspace&&JSON.stringify(localWorkspace[key])!==before)return localWorkspace[key]
      return workspace[key]
    }
    const layout=mergeField('layout'),widgetSlots=mergeField('widgetSlots'),widgetCanvas=mergeField('widgetCanvas')
    const beforeDesktop=previousById.get(workspace.id)?.desktop
    const localDesktop=currentById.get(workspace.id)?.desktop
    const remoteDesktop=externalById.get(workspace.id)?.desktop
    const itemIds=[...workspace.itemIds.filter(id=>!ownerByItem.has(id)),...(resolvedItemsByWorkspace.get(workspace.id)??[])]
    const desktop=workspace.desktop
    const positions=desktop&&Object.fromEntries(itemIds.flatMap(id=>{
      const beforePoint=beforeDesktop?.positions[id],localPoint=localDesktop?.positions[id],remotePoint=remoteDesktop?.positions[id]
      const changedRemote=externalById.has(workspace.id)&&JSON.stringify(remotePoint)!==JSON.stringify(beforePoint)
      const changedLocal=currentById.has(workspace.id)&&JSON.stringify(localPoint)!==JSON.stringify(beforePoint)
      const point=changedRemote?remotePoint:changedLocal?localPoint:desktop.positions[id]
      return point?[[id,point]]:[]
    }))
    const { layout: _discarded, widgetSlots: _discardedWidgets, widgetCanvas:_discardedCanvas, ...rest } = workspace
    return {
      ...rest,
      ...(layout ? { layout } : {}),
      ...(widgetSlots ? {widgetSlots} : {}),
      ...(widgetCanvas ? {widgetCanvas} : {}),
      itemIds,
      ...(desktop&&positions?{desktop:{...desktop,positions}}:{}),
    }
  })
}
