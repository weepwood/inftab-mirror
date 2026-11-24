import type { Preferences } from '../types'
import { isRecord, boundedInteger } from './validation'

export type WorkspaceLayout = Pick<Preferences, 'columns' | 'rows' | 'iconSize' | 'iconRadius' | 'showNames'>
export type WorkspaceLayoutOverrides = Partial<WorkspaceLayout>
const limits = { columns: [2, 12], rows: [1, 8], iconSize: [32, 160], iconRadius: [0, 100] } as const

export function sanitizeWorkspaceLayout(value: unknown): WorkspaceLayoutOverrides | undefined {
  if (!isRecord(value)) return undefined
  const result: WorkspaceLayoutOverrides = {}
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const item = value[key]
    const [min, max] = limits[key]
    if (typeof item === 'number' && Number.isFinite(item)) result[key] = boundedInteger(item, min, min, max)
  }
  if (typeof value.showNames === 'boolean') result.showNames = value.showNames
  return Object.keys(result).length ? result : undefined
}

export function resolveWorkspaceLayout(global: WorkspaceLayout, local?: WorkspaceLayoutOverrides): WorkspaceLayout {
  const { columns, rows, iconSize, iconRadius, showNames } = global
  return { columns, rows, iconSize, iconRadius, showNames, ...local }
}
