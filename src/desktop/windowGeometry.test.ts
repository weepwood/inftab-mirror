import { describe,it,expect } from 'vitest'
import {fitWindow,dockWindow,validGeometry,saveGeometry,readGeometry} from './windowGeometry'
describe('window geometry',()=>{
 it('fits a narrow viewport without mutating the preferred dimensions',()=>{
  const g={x:600,y:400,width:850,height:570}
  expect(fitWindow(g,420,560)).toEqual({x:12,y:48,width:396,height:464})
  expect(g.width).toBe(850)
 })
 it('docks independently and bounds invalid cached geometry',()=>{
  expect(dockWindow('right',1280,900).x).toBeGreaterThan(640)
  expect(validGeometry({x:0,y:0,width:Infinity,height:4})).toBeUndefined()
 })
 it('bounds presentation history and safely handles invalid storage',()=>{
  let raw='{}';const store={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value}}
  for(let i=0;i<40;i++)saveGeometry(String(i),{x:0,y:0,width:640,height:480},store)
  expect(Object.keys(JSON.parse(raw))).toHaveLength(32)
  expect(readGeometry('39',store)?.width).toBe(640)
  raw='bad';expect(readGeometry('39',store)).toBeUndefined()
 })
})
