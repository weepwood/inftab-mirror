import { describe, expect, it } from 'vitest'
import { activeWindow, activateWindow, closeWindow, emptyWindows, maxWindows, openWindow, updateWindow, reconcileWindowSpaces } from './windowManager'
describe('desktop window manager', () => {
  it('opens independent locations and reactivates without duplicating windows', () => {
    let s = openWindow(emptyWindows(), { workspaceId: 'default' })
    s = openWindow(s, { workspaceId: 'default', folderId: 'folder' })
    expect(activeWindow(s)).toBe(2)
    s = openWindow(s, { workspaceId: 'default' })
    expect(s.windows.map(w => w.id)).toEqual([2, 1])
    expect(activeWindow(s)).toBe(1)
  })
  it('minimizes, restores and closes with deterministic focus order', () => {
    let s = openWindow(emptyWindows(), { workspaceId: 'a' })
    s = openWindow(s, { workspaceId: 'b' })
    s = updateWindow(s, 2, { minimized: true })
    expect(activeWindow(s)).toBe(1)
    s = activateWindow(s, 2)
    expect(activeWindow(s)).toBe(2)
    expect(s.windows.at(-1)?.minimized).toBe(false)
    s = closeWindow(s, 2)
    expect(activeWindow(s)).toBe(1)
  })
  it('bounds window count without silently evicting user state', () => {
    let s = emptyWindows()
    for (let i = 0; i < maxWindows + 2; i++) s = openWindow(s, { workspaceId: String(i) })
    expect(s.windows).toHaveLength(maxWindows)
    expect(s.nextId).toBe(maxWindows + 1)
  })
})

it('keeps tools separate from Finder and reuses singleton tool windows across workspaces',()=>{
 let state=openWindow(emptyWindows(),{workspaceId:'a'})
 state=openWindow(state,{workspaceId:'a',panelId:'notes'})
 state=openWindow(state,{workspaceId:'b',panelId:'notes'})
 expect(state.windows).toHaveLength(2)
 expect(state.windows.at(-1)?.panelId).toBe('notes')
})

it('isolates active windows by space and rehomes removed spaces',()=>{
 let state=openWindow(emptyWindows(),{workspaceId:'a'})
 state=openWindow(state,{workspaceId:'b',panelId:'notes'})
 expect(activeWindow(state,'a')).toBe(1)
 expect(activeWindow(state,'b')).toBe(2)
 state=updateWindow(state,2,{spaceId:'a'})
 expect(activeWindow(state,'b')).toBeUndefined()
 expect(activeWindow(state,'a')).toBe(2)
 expect(reconcileWindowSpaces(state,['b'],'b').windows.every(w=>w.spaceId==='b')).toBe(true)
})
