import {describe,expect,it} from 'vitest'
import {defaultPreferences} from './defaults'
import {parseWorkspaceBackup} from './backup'
import {planWorkspaceConflict} from './workspaceConflict'

function snapshot(){
 return parseWorkspaceBackup({format:'inftab-workspace',version:1,exportedAt:'',preferences:defaultPreferences,shortcuts:[],folders:[],launcherOrder:[],todos:[],notes:[{id:'n1',title:'Title',body:'Body',updatedAt:1},{id:'n2',title:'Other',body:'Other body',updatedAt:1}],activeNoteId:'n1',weatherCity:'上海'})
}
describe('workspace conflict planner',()=>{
 it('merges disjoint fields and records without changing inputs',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes[0]!.title='Local title';remote.notes[0]!.body='Remote body';remote.notes[1]!.title='Remote second'
  const result=planWorkspaceConflict(base,local,remote)
  expect(result.conflicts).toEqual([])
  expect(result.merged?.notes.map(n=>[n.title,n.body])).toEqual([['Local title','Remote body'],['Remote second','Other body']])
  expect(base.notes[0]!.title).toBe('Title')
 })
 it('refuses overlapping updates and deletion versus edit instead of resurrecting records',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes[0]!.title='Local';remote.notes[0]!.title='Remote'
  expect(planWorkspaceConflict(base,local,remote)).toEqual({conflicts:[{path:'/notes/n1/title',reason:'concurrent-edit'}]})
  local.notes=local.notes.filter(n=>n.id!=='n1');local.activeNoteId='n2'
  expect(planWorkspaceConflict(base,local,remote)).toEqual({conflicts:[{path:'/notes/n1',reason:'delete-edit'}]})
 })
 it('keeps independent deletions without restoring deleted notes',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes=local.notes.filter(n=>n.id!=='n2');remote.notes[0]!.body='Updated'
  const result=planWorkspaceConflict(base,local,remote)
  expect(result.conflicts).toEqual([])
  expect(result.merged?.notes.map(n=>n.id)).toEqual(['n1'])
 })
 it('refuses a merge whose reference validation would silently repair data',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes=local.notes.filter(n=>n.id!=='n2')
  remote.activeNoteId='n2'
  expect(planWorkspaceConflict(base,local,remote)).toEqual({conflicts:[{path:'/',reason:'reference'}]})
 })
 it('preserves insertion anchors when both sides insert independent notes',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes.splice(1,0,{id:'local',title:'Local',body:'',updatedAt:2})
  remote.notes.unshift({id:'remote',title:'Remote',body:'',updatedAt:3})
  const result=planWorkspaceConflict(base,local,remote)
  expect(result.conflicts).toEqual([])
  expect(result.merged?.notes.map(n=>n.id)).toEqual(['remote','n1','local','n2'])
 })
 it('refuses concurrent incompatible ordering',()=>{
  const base=snapshot(),local=structuredClone(base),remote=structuredClone(base)
  local.notes.reverse();remote.notes.push({id:'n3',title:'Third',body:'',updatedAt:2})
  expect(planWorkspaceConflict(base,local,remote)).toEqual({conflicts:[{path:'/notes',reason:'order'}]})
 })
})
