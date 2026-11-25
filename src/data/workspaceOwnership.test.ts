import { describe,expect,it } from 'vitest'
import { mergeHomeWorkspaceChanges } from './workspaceOwnership'
import { mergeConcurrentEdits } from '../composables/concurrentState'
import { sanitizeHomeWorkspaces,type HomeWorkspace } from './homeWorkspaces'
describe('desktop concurrent ownership',()=>{
 it('preserves coordinates as pairs and combines disjoint icon edits',()=>{
  const before:HomeWorkspace[]=[{id:'default',name:'主页',itemIds:['a','b'],desktop:{version:1,snap:false,positions:{a:{x:0,y:0},b:{x:96,y:0}}}}]
  const local=structuredClone(before),external=structuredClone(before)
  local[0]!.desktop!.positions.a={x:50,y:0}
  local[0]!.desktop!.positions.b={x:100,y:40}
  external[0]!.desktop!.positions.a={x:0,y:70}
  const merged=mergeHomeWorkspaceChanges([],local,before,external,(a,b,c)=>mergeConcurrentEdits(a,b,c,sanitizeHomeWorkspaces))
  expect(merged[0]?.desktop?.positions).toEqual({a:{x:0,y:70},b:{x:100,y:40}})
 })
})
