import { describe, it, expect } from 'vitest'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { planWorkspaceMove, planFolderMembership } from './ownership'
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
