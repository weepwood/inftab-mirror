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
