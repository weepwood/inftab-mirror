import {describe,it,expect} from 'vitest'
import {normalizeFolderTree,folderParents,planFolderParent,maxFolderDepth} from './folderTree'
import {sanitizeFolders} from './sanitize'
const f=(id:string,parentId?:string)=>({id,title:id,mark:'F',color:'#abc',shortcutIds:[],parentId})
const space={id:'a',name:'A',itemIds:['a','b','c']}
describe('folder tree',()=>{
 it('flattens missing parents and cycles without deleting records',()=>{
  const result=normalizeFolderTree([f('a','b'),f('b','a'),f('c','missing')])
  expect(result.map(x=>x.id)).toEqual(['a','b','c'])
  expect(result.every(x=>!x.parentId)).toBe(true)
 })
 it('preserves valid edges through sanitizer and prevents cycles and cross-space nesting',()=>{
  const folders=sanitizeFolders([f('a'),f('b','a'),f('c','b')],[])
  expect(folderParents(folders,space).get('c')).toBe('b')
  expect(planFolderParent(folders,space,['a'],'c')).toBeUndefined()
  expect(planFolderParent(folders,{...space,itemIds:['a','b']},['a'],'c')).toBeUndefined()
  expect(planFolderParent(folders,space,['b'],null)?.[1]?.parentId).toBeUndefined()
 })
 it('bounds deeply nested imported records',()=>{
  const all=Array.from({length:maxFolderDepth+2},(_,i)=>f(String(i),i?String(i-1):undefined))
  const result=normalizeFolderTree(all)
  expect(result).toHaveLength(all.length)
  expect(result[maxFolderDepth]?.parentId).toBeUndefined()
 })
})
