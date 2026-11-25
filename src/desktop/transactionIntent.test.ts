import {describe,it,expect} from 'vitest'
import {canReplay,replayIntent,transactionKeys,type TransactionValues,type TransactionIntent} from './transactionIntent'
const values=(value:string|null)=>Object.fromEntries(transactionKeys.map(key=>[key,value])) as TransactionValues
const intent:TransactionIntent={id:'test',createdAt:1,before:values(null),after:values('[]')}
function storage(initial:TransactionValues){
 const data={...initial}
 return {data,getItem:(k:string)=>data[k as keyof TransactionValues]??null,setItem:(k:string,v:string)=>{data[k as keyof TransactionValues]=v},removeItem:(k:string)=>{data[k as keyof TransactionValues]=null}}
}
describe('desktop transaction replay',()=>{
 it('restores mixed known keys in either direction including absent keys',()=>{
  const partial={...intent.before,[transactionKeys[0]]:'[]'}
  expect(canReplay(intent,partial)).toBe(true)
  const a=storage(partial);replayIntent(intent,'complete',a);expect(a.data).toEqual(intent.after)
  replayIntent(intent,'rollback',a);expect(a.data).toEqual(intent.before)
 })
 it('refuses unknown values without writing any keys',()=>{
  const partial={...intent.before,[transactionKeys[3]]:'newer'}
  const a=storage(partial)
  expect(()=>replayIntent(intent,'complete',a)).toThrow(/其他数据修改/)
  expect(a.data).toEqual(partial)
 })
})
