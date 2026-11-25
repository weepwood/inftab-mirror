import { describe, it, expect } from 'vitest'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { planWorkspaceMove, planFolderMembership, planPaste } from './ownership'
function fixture() {
 const workspaces: HomeWorkspace[] = [
  { id:'a',name:'A',itemIds:['folder','one','two','other'],desktop:{version:1,snap:true,positions:{one:{x:0,y:0},other:{x:96,y:0}}}},
  { id:'b',name:'B',itemIds:['second','three'] },
 ]
 const folders = [
  {id:'folder',title:'F',shortcutIds:['one','two'],color:'#abc',mark:'F'},
  {id:'second',title:'S',shortcutIds:['three'],color:'#abc',mark:'S'},
 ]
 return {workspaces,folders,shortcutIds:['one','two','other','three']}
}
describe('desktop ownership plans',()=>{
 it('moves a folder and all members once, retaining the folder relationship and cleaning old coordinates',()=>{
  const state=fixture()
  const result=planWorkspaceMove(state,['folder','other'],'b')!
  expect(result.workspaces[0]?.itemIds).toEqual([])
  expect(result.workspaces[0]?.desktop?.positions).toEqual({})
  expect(result.workspaces[1]?.itemIds).toEqual(['second','three','one','two','folder','other'])
  expect(result.folders[0]?.shortcutIds).toEqual(['one','two'])
  expect(state.workspaces[0]?.itemIds).toHaveLength(4)
 })
 it('detaches links from their old folder and rejects stale selections without side effects',()=>{
  const state=fixture()
  expect(planWorkspaceMove(state,['one','missing'],'b')).toBeUndefined()
  const result=planWorkspaceMove(state,['one'],'b')!
  expect(result.folders[0]?.shortcutIds).toEqual(['two'])
  expect(state.folders[0]?.shortcutIds).toEqual(['one','two'])
 })
 it('rejects cross-workspace membership as a unit and allows valid batch changes',()=>{
  const state=fixture()
  expect(planFolderMembership(state,['other','three'],'folder')).toBeUndefined()
  expect(planFolderMembership(state,['other','one'],'folder')?.[0]?.shortcutIds).toEqual(['one','two','other'])
  expect(planFolderMembership(state,['one','two'],null)?.[0]?.shortcutIds).toEqual([])
 })
})

it('cuts and copies across folders with a validated source location',()=>{
 const state=fixture()
 const source={mode:'cut' as const,ids:['one'],workspaceId:'a',folderId:'folder'}
 const moved=planPaste(state,source,'b','second')!
 expect(moved.folders[0]?.shortcutIds).toEqual(['two'])
 expect(moved.folders[1]?.shortcutIds).toEqual(['three','one'])
 expect(planPaste({...state,...moved},source,'a',null)).toBeUndefined()
 const copied=planPaste(state,{...source,mode:'copy'},'b','second',['copy-one'])!
 expect(copied.folders[0]?.shortcutIds).toEqual(['one','two'])
 expect(copied.folders[1]?.shortcutIds).toEqual(['three','copy-one'])
})

it('moves an entire nested folder subtree and preserves its links',()=>{
 const state=fixture()
 state.folders.push({id:'child',title:'Child',mark:'F',color:'#abc',shortcutIds:['other'],parentId:'folder'} as typeof state.folders[number])
 state.workspaces[0]!.itemIds.push('child')
 const result=planWorkspaceMove(state,['folder'],'b')!
 expect(result.workspaces[0]?.itemIds).toEqual([])
 expect(result.workspaces[1]?.itemIds).toEqual(expect.arrayContaining(['child','folder','one','two','other']))
 expect(result.folders.find(f=>f.id==='child')).toMatchObject({parentId:'folder',shortcutIds:['other']})
})
