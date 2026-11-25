import type { PanelId } from '../plugins/ids'
export interface WindowLocation { workspaceId: string; folderId?: string; panelId?: PanelId }
export interface DesktopWindow extends WindowLocation {
  id: number
  minimized: boolean
  maximized: boolean
  cascade: number
  title: string
}
export interface WindowState {
  windows: DesktopWindow[]
  nextId: number
}
export const maxWindows = 8
export const emptyWindows = (): WindowState => ({ windows: [], nextId: 1 })
export function activeWindow(state: WindowState): number | undefined {
  return [...state.windows].reverse().find(window => !window.minimized)?.id
}
export function activateWindow(state: WindowState, id: number): WindowState {
  const window = state.windows.find(w => w.id === id)
  if (!window) return state
  if (state.windows.at(-1)?.id === id && !window.minimized) return state
  return { ...state, windows: [...state.windows.filter(w => w.id !== id), { ...window, minimized: false }] }
}
export function openWindow(state: WindowState, location: WindowLocation): WindowState {
  const existing = state.windows.find(w => location.panelId ? w.panelId === location.panelId : !w.panelId && w.workspaceId === location.workspaceId && w.folderId === location.folderId)
  if (existing) return activateWindow(state, existing.id)
  if (state.windows.length >= maxWindows) return state
  return {
    nextId: state.nextId + 1,
    windows: [...state.windows, { ...location, id: state.nextId, cascade: state.nextId % 5, title: location.panelId ?? 'Finder', minimized: false, maximized: false }],
  }
}
export function closeWindow(state: WindowState, id: number): WindowState {
  return { ...state, windows: state.windows.filter(w => w.id !== id) }
}
export function updateWindow(state: WindowState, id: number, patch: Partial<Pick<DesktopWindow, 'minimized' | 'maximized' | 'title'>>): WindowState {
  return { ...state, windows: state.windows.map(w => w.id === id ? { ...w, ...patch } : w) }
}
