import { describe, it, expect } from 'vitest'
import { fitPoint, defaultPoint, normalizeLayout, arrangeFromRight } from './layout'
describe('desktop layout', () => {
  it('clamps view without mutating saved coordinates', () => {
    const p={x:700,y:400}
    expect(fitPoint(p,300,300)).toEqual({x:204,y:204})
    expect(p).toEqual({x:700,y:400})
  })
  it('snaps and bounds',()=>expect(fitPoint({x:110,y:-4},500,500,true)).toEqual({x:96,y:0}))
  it('rejects malformed records',()=>expect(Object.keys(normalizeLayout({version:1,positions:{bad:{x:NaN,y:2},good:{x:2,y:3}}}).positions)).toEqual(['good']))
  it('handles narrow surfaces',()=>expect(defaultPoint(2,50)).toEqual({x:0,y:192}))
})

import { resolvePoints, createOccupancy } from './layout'
describe('desktop collision resolution', () => {
  it('preserves non-overlapping free coordinates even when spatial buckets intersect',()=>{
    const saved={a:{x:5,y:5},b:{x:102,y:5},c:{x:5,y:101}}
    expect(resolvePoints(['a','b','c'],saved,480,480)).toEqual(saved)
  })
  it('still relocates genuine free-coordinate overlaps',()=>{
    const saved={a:{x:5,y:5},b:{x:100,y:5}}
    const points=resolvePoints(['a','b'],saved,480,480)
    expect(points.a).toEqual(saved.a)
    expect(points.b).not.toEqual(saved.b)
    expect(Math.abs(points.a!.x-points.b!.x)>=96||Math.abs(points.a!.y-points.b!.y)>=96).toBe(true)
  })

  it('resolves duplicate and clamped slots without changing the saved layout', () => {
    const saved = {a:{x:960,y:0},b:{x:960,y:0}}
    const points=resolvePoints(['a','b','c'],saved,192,300)
    expect(new Set(Object.values(points).map(p=>p.x+':'+p.y)).size).toBe(3)
    expect(saved.a).toEqual({x:960,y:0})
  })
  for(const count of [50,200,1000]) it('allocates '+count+' non-overlapping grid slots',()=>{
    const ids=Array.from({length:count},(_,i)=>'item-'+i)
    const points=resolvePoints(ids,{},1200,800)
    expect(new Set(Object.values(points).map(p=>p.x+':'+p.y)).size).toBe(count)
  })
})

import { translateGroup } from './layout'
describe('desktop group movement', () => {
  it('preserves offsets and clamps the entire group at the edge', () => {
    const source = { a: { x: 0, y: 96 }, b: { x: 96, y: 192 } }
    expect(translateGroup(source, { x: 400, y: -100 }, 384, 384, true)).toEqual({ a: { x: 192, y: 0 }, b: { x: 288, y: 96 } })
    expect(source.a).toEqual({ x: 0, y: 96 })
  })
  it('preserves unsnapped geometry and handles an empty group', () => {
    expect(translateGroup({ a: { x: 14, y: 22 }, b: { x: 115, y: 25 } }, { x: -20, y: 13 }, 400, 400)).toEqual({ a: { x: 0, y: 35 }, b: { x: 101, y: 38 } })
    expect(translateGroup({}, { x: 10, y: 10 }, 400, 400)).toEqual({})
  })
})

describe('explicit right-aligned arrangement',()=>{
 it('fills rightmost column first and preserves every item on overflow',()=>{
  expect(arrangeFromRight(['a','b','c','d','e'],192,192)).toEqual({a:{x:96,y:0},b:{x:96,y:96},c:{x:0,y:0},d:{x:0,y:96},e:{x:96,y:192}})
 })
 it('has no collisions on small screens and large collections',()=>{
  const ids=Array.from({length:1000},(_,i)=>String(i))
  const positions=arrangeFromRight(ids,40,40)
  expect(Object.keys(positions)).toHaveLength(ids.length)
  expect(new Set(Object.values(positions).map(p=>p.x+':'+p.y)).size).toBe(ids.length)
 })
})

describe('desktop drag occupancy',()=>{
 it('recognizes exact edges and negative-direction bucket crossings',()=>{
  const {overlaps,add}=createOccupancy([{x:101,y:101}])
  expect(overlaps({x:5,y:101})).toBe(false)
  expect(overlaps({x:6,y:101})).toBe(true)
  expect(overlaps({x:101,y:197})).toBe(false)
  add({x:300,y:300})
  expect(overlaps({x:299,y:299})).toBe(true)
 })
 it('indexes stationary icons without treating moving peers as obstacles',()=>{
  const moving={a:{x:0,y:0},b:{x:96,y:0}}
  const {overlaps}=createOccupancy([{x:384,y:0}])
  const safe=translateGroup(moving,{x:37,y:125},960,480)
  expect(Object.values(safe).some(overlaps)).toBe(false)
  const blocked=translateGroup(moving,{x:288,y:0},960,480,true)
  expect(Object.values(blocked).some(overlaps)).toBe(true)
 })
})
