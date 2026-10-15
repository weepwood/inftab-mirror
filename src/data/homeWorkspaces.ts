import { truncateCodePoints } from './text'

export const defaultHomeWorkspaceId = 'default'
export const maxHomeWorkspaces = 20
export const maxHomeWorkspaceNameLength = 40

export interface HomeWorkspace {
  id: string
  name: string
  itemIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function uniqueName(name: string, used: Set<string>, fallback: string): string {
  const base = truncateCodePoints(name.trim() || fallback, maxHomeWorkspaceNameLength)
  if (!used.has(base.toLocaleLowerCase())) {
    used.add(base.toLocaleLowerCase())
    return base
  }
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const tail = ` (${suffix})`
    const candidate = `${truncateCodePoints(base, maxHomeWorkspaceNameLength - tail.length)}${tail}`
    if (!used.has(candidate.toLocaleLowerCase())) {
      used.add(candidate.toLocaleLowerCase())
      return candidate
    }
  }
  return `工作区 ${used.size + 1}`
}

function parseWorkspace(value: unknown): HomeWorkspace | undefined {
  if (!isRecord(value) || !validId(value.id) || !Array.isArray(value.itemIds)) return undefined
  return {
    id: value.id,
    name: typeof value.name === 'string' ? truncateCodePoints(value.name.trim(), maxHomeWorkspaceNameLength) : '',
    itemIds: [...new Set(value.itemIds.filter(validId))],
  }
}

export function defaultHomeWorkspace(itemIds: string[] = []): HomeWorkspace {
  return { id: defaultHomeWorkspaceId, name: '主页', itemIds: [...new Set(itemIds.filter(validId))] }
}

export function sanitizeHomeWorkspaces(
  value: unknown,
  fallbackItemIds: string[] = [],
  builtInItemIds: string[] = [],
  allowedItemIds?: ReadonlySet<string>,
): HomeWorkspace[] {
  const candidates = Array.isArray(value) ? value.map(parseWorkspace).filter((item): item is HomeWorkspace => item !== undefined) : []
  const defaultCandidate = candidates.find((item) => item.id === defaultHomeWorkspaceId)
    ?? defaultHomeWorkspace(fallbackItemIds)
  const rest = candidates.filter((item) => item.id !== defaultHomeWorkspaceId)
  const capped = [defaultCandidate, ...rest].slice(0, maxHomeWorkspaces)
  const usedIds = new Set<string>()
  const usedNames = new Set<string>()
  const assignedItemIds = new Set<string>()
  const builtInIds = new Set(builtInItemIds.filter(validId))

  return capped.flatMap((workspace, index) => {
    if (usedIds.has(workspace.id)) return []
    usedIds.add(workspace.id)
    const rawIds = allowedItemIds
      ? workspace.itemIds.filter((id) => allowedItemIds.has(id))
      : workspace.itemIds
    const itemIds = [...new Set(rawIds.filter((id) => builtInIds.has(id) || !assignedItemIds.has(id)))]
    itemIds.filter((id) => !builtInIds.has(id)).forEach((id) => assignedItemIds.add(id))
    itemIds.push(...builtInItemIds.filter((id) => validId(id) && !itemIds.includes(id)))
    return [{
      id: workspace.id,
      name: uniqueName(workspace.name, usedNames, index === 0 ? '主页' : `工作区 ${index + 1}`),
      itemIds,
    }]
  })
}

export function sanitizeActiveHomeWorkspaceId(value: unknown, workspaces: HomeWorkspace[]): string {
  return typeof value === 'string' && workspaces.some((workspace) => workspace.id === value)
    ? value
    : workspaces[0]?.id ?? defaultHomeWorkspaceId
}
