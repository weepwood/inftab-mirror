import type { WidgetSlots } from './widgetSlots'
import { availableHomeWidgetIds } from '../plugins/ids'
import { normalizeLayout, type DesktopLayout } from '../desktop/layout'
import { isRecord, isValidRecordId } from './validation'
import { truncateCodePoints } from './text'
import { sanitizeWorkspaceLayout, type WorkspaceLayoutOverrides } from './workspaceLayout'

export const defaultHomeWorkspaceId = 'default'
export const maxHomeWorkspaces = 20
export const maxHomeWorkspaceNameLength = 40

export interface HomeWorkspace {
  id: string
  name: string
  itemIds: string[]
  desktop?: DesktopLayout
  widgetSlots?: WidgetSlots
  layout?: WorkspaceLayoutOverrides
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

export function sanitizeWidgetSlots(value:unknown):WidgetSlots|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return
 const raw=value as WidgetSlots
 return Object.fromEntries(availableHomeWidgetIds.flatMap(id=>{
  const p=raw[id]
  return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?[[id,{x:Math.max(0,Math.min(2,Math.round(p.x))),y:Math.max(0,Math.min(15,Math.round(p.y)))}]]:[]
 }))
}

function parseWorkspace(value: unknown): HomeWorkspace | undefined {
  if (!isRecord(value) || !isValidRecordId(value.id) || !Array.isArray(value.itemIds)) return undefined
  const layout = sanitizeWorkspaceLayout(value.layout)
  const widgetSlots = sanitizeWidgetSlots(value.widgetSlots)
  return {
    ...(layout ? { layout } : {}),
    ...(widgetSlots ? { widgetSlots } : {}),
    ...(isRecord(value.desktop) && value.desktop.version === 1 ? { desktop: normalizeLayout(value.desktop) } : {}),
    id: value.id,
    name: typeof value.name === 'string' ? truncateCodePoints(value.name.trim(), maxHomeWorkspaceNameLength) : '',
    itemIds: [...new Set(value.itemIds.filter(isValidRecordId))],
  }
}

export function defaultHomeWorkspace(itemIds: string[] = []): HomeWorkspace {
  return { id: defaultHomeWorkspaceId, name: '主页', itemIds: [...new Set(itemIds.filter(isValidRecordId))] }
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
  const builtInIds = new Set(builtInItemIds.filter(isValidRecordId))

  return capped.flatMap((workspace, index) => {
    if (usedIds.has(workspace.id)) return []
    usedIds.add(workspace.id)
    const rawIds = allowedItemIds
      ? workspace.itemIds.filter((id) => allowedItemIds.has(id))
      : workspace.itemIds
    const itemIds = [...new Set(rawIds.filter((id) => builtInIds.has(id) || !assignedItemIds.has(id)))]
    itemIds.filter((id) => !builtInIds.has(id)).forEach((id) => assignedItemIds.add(id))
    itemIds.push(...builtInItemIds.filter((id) => isValidRecordId(id) && !itemIds.includes(id)))
    const allowedDesktopIds = new Set(itemIds)
    return [{
      id: workspace.id,
      name: uniqueName(workspace.name, usedNames, index === 0 ? '主页' : `工作区 ${index + 1}`),
      itemIds,
      ...(workspace.layout ? { layout: workspace.layout } : {}),
      ...(workspace.widgetSlots ? { widgetSlots: workspace.widgetSlots } : {}),
      ...(workspace.desktop ? { desktop: { ...workspace.desktop, positions: Object.fromEntries(Object.entries(workspace.desktop.positions).filter(([id]) => allowedDesktopIds.has(id))) } } : {}),
    }]
  })
}

export function sanitizeActiveHomeWorkspaceId(value: unknown, workspaces: HomeWorkspace[]): string {
  return typeof value === 'string' && workspaces.some((workspace) => workspace.id === value)
    ? value
    : workspaces[0]?.id ?? defaultHomeWorkspaceId
}
