import type { Preferences, HomeWidgetId, HomeWidgetSize } from '../types'
import type { HomeWorkspace } from './homeWorkspaces'
import { resolveWorkspaceLayout, sanitizeWorkspaceLayout, type WorkspaceLayout, type WorkspaceLayoutOverrides } from './workspaceLayout'

export interface LayoutEditorDraft {
  workspaceId: string
  baseline: string
  inherit: boolean
  layout: WorkspaceLayout
  widgetIds: HomeWidgetId[]
  widgetSizes: Record<HomeWidgetId, HomeWidgetSize>
}
export function layoutSignature(workspace: HomeWorkspace, preferences: Preferences) {
  return JSON.stringify([workspace.id, workspace.layout ?? null, resolveWorkspaceLayout(preferences), preferences.homeWidgetIds, preferences.homeWidgetSizes])
}
export function createLayoutDraft(workspace: HomeWorkspace, preferences: Preferences): LayoutEditorDraft {
  return {
    workspaceId: workspace.id,
    baseline: layoutSignature(workspace, preferences),
    inherit: !workspace.layout,
    layout: resolveWorkspaceLayout(preferences, workspace.layout),
    widgetIds: [...preferences.homeWidgetIds],
    widgetSizes: { ...preferences.homeWidgetSizes },
  }
}
export function moveWidget(ids: HomeWidgetId[], id: HomeWidgetId, direction: -1 | 1) {
  const from = ids.indexOf(id), to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

// Preserve existing partial overrides when a user only changes widgets.
export function getLayoutOverrides(workspace: HomeWorkspace, preferences: Preferences, draft: LayoutEditorDraft): WorkspaceLayoutOverrides | undefined {
  if (draft.inherit) return undefined
  const clean = sanitizeWorkspaceLayout(draft.layout)
  if (!clean) return undefined
  if (!workspace.layout) return clean
  const previous = resolveWorkspaceLayout(preferences, workspace.layout)
  const changes = Object.fromEntries(Object.entries(clean).filter(([key, value]) => previous[key as keyof WorkspaceLayout] !== value))
  return { ...workspace.layout, ...changes }
}
