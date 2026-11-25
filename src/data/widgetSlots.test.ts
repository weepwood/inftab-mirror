import { describe, it, expect } from 'vitest'
import { canPlaceWidget,resolveWidgetSlots } from './widgetSlots'
import { defaultPreferences } from './defaults'
import { sanitizeHomeWorkspaces,sanitizeWidgetSlots } from './homeWorkspaces'
const sizes={...defaultPreferences.homeWidgetSizes,'todo-summary':'wide' as const}
describe('independent widget positions',()=>{
 it('rejects overlap and out of bounds for wide cards',()=>{
  const slots={'notes-summary':{x:2,y:0}}
  expect(canPlaceWidget('todo-summary',{x:1,y:0},slots,sizes)).toBe(false)
  expect(canPlaceWidget('todo-summary',{x:2,y:1},slots,sizes)).toBe(false)
  expect(canPlaceWidget('todo-summary',{x:0,y:1},slots,sizes)).toBe(true)
 })
 it('preserves saved positions and resolves collisions without losing widgets',()=>{
  expect(resolveWidgetSlots(['todo-summary','notes-summary'],{'todo-summary':{x:1,y:2},'notes-summary':{x:2,y:2}},sizes)).toEqual({'todo-summary':{x:1,y:2},'notes-summary':{x:0,y:0}})
 })
 it('sanitizes unknown IDs, coordinates and old workspace records',()=>{
  expect(sanitizeWidgetSlots({'todo-summary':{x:999,y:-1},unknown:{x:0,y:0},'notes-summary':{x:NaN,y:1}})).toEqual({'todo-summary':{x:2,y:0}})
  const result=sanitizeHomeWorkspaces([{id:'default',name:'主页',itemIds:[],widgetSlots:{}},{id:'work',name:'工作',itemIds:[],widgetSlots:{'todo-summary':{x:1,y:3}}}])
  expect(result[0]?.widgetSlots).toEqual({})
  expect(result[1]?.widgetSlots).toEqual({'todo-summary':{x:1,y:3}})
  expect(sanitizeHomeWorkspaces(undefined)[0]?.widgetSlots).toBeUndefined()
 })
})
