import {describe,it,expect} from 'vitest'
import {sanitizeWindowSession} from './windowSession'
const spaces=[{id:'default',name:'主页',itemIds:[]},{id:'work',name:'工作',itemIds:['folder']}]
describe('desktop session restoration',()=>{
 it('keeps only supported tool windows and valid folder references',()=>{
  const result=sanitizeWindowSession({windows:[{panelId:'settings'},{panelId:'todos',workspaceId:'gone',spaceId:'work',minimized:true},{panelId:'todos'},{workspaceId:'work',folderId:'folder',spaceId:'gone',maximized:true},{workspaceId:'gone',folderId:'missing'}]},spaces,['folder'])
  expect(result.windows).toHaveLength(3)
  expect(result.windows[0]).toMatchObject({panelId:'todos',workspaceId:'default',spaceId:'work',minimized:true})
  expect(result.windows[1]).toMatchObject({folderId:'folder',spaceId:'default',maximized:true})
  expect(result.windows[2]?.folderId).toBeUndefined()
  expect(new Set(result.windows.map(w=>w.id)).size).toBe(3)
 })
 it('ignores corrupted and excessive records',()=>{
  expect(sanitizeWindowSession(null,spaces,[]).windows).toEqual([])
  expect(sanitizeWindowSession({windows:Array.from({length:100},()=>null)},spaces,[]).windows).toEqual([])
 })
})
