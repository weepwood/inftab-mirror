import { describe,it,expect } from 'vitest'
import {fitWindow,dockWindow,resizeWindow,validGeometry,saveGeometry,readGeometry} from './windowGeometry'
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

describe('anchored resize',()=>{
 const g={x:200,y:180,width:640,height:480}
 it('keeps opposite edges fixed at min size and viewport bounds',()=>{
  expect(resizeWindow(g,{left:1000,top:1000,right:0,bottom:0},{left:true,top:true},1280,900)).toEqual({x:560,y:420,width:280,height:240})
  expect(resizeWindow(g,{left:-1000,top:-1000,right:0,bottom:0},{left:true,top:true},1280,900)).toEqual({x:12,y:48,width:828,height:612})
 })
 it('respects right and bottom bounds and a tiny viewport',()=>{
  expect(resizeWindow(g,{left:0,top:0,right:1000,bottom:1000},{right:true,bottom:true},1280,900)).toEqual({x:200,y:180,width:1068,height:672})
  expect(resizeWindow(g,{left:500,top:500,right:0,bottom:0},{left:true,top:true},250,220)).toEqual(fitWindow(g,250,220))
 })
})
