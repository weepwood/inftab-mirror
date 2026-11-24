import { expect, it } from 'vitest'
import { trimHistory, type HistoryEntry } from './backupHistory'
it('retains newest snapshots within count and byte budgets', () => {
  const rows: HistoryEntry[] = Array.from({length: 10},(_,index)=>({ id:String(index),createdAt:index,reason:'daily',bytes:4*1024*1024,shortcuts:1,content:'' }))
  expect(trimHistory(rows).map(item=>item.id)).toEqual(['9','8','7','6','5','4'])
  expect(trimHistory(rows.map(item=>({...item,bytes:1}))).map(item=>item.id)).toEqual(['9','8','7','6','5','4','3'])
})


it('uses remaining entry slots when a larger snapshot does not fit the remaining byte budget', () => {
  const rows: HistoryEntry[] = [8,8,7,8,1].map((size,index)=>({id:String(index),createdAt:10-index,reason:'manual',bytes:size*1024*1024,shortcuts:1,content:''}))
  expect(trimHistory(rows).map(item=>item.id)).toEqual(['0','1','2','4'])
})
