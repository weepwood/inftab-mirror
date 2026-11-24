import { describe, it, expect } from 'vitest'
import { fitPoint, defaultPoint, normalizeLayout } from './layout'
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

import { resolvePoints } from './layout'
describe('desktop collision resolution', () => {
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
