import {describe,it,expect} from 'vitest'
import {OperationHistory} from './operationHistory'
describe('desktop undo history',()=>{
 it('does not consume history before a guarded operation succeeds',()=>{
  const h=new OperationHistory<number>(String)
  h.record(1,2)
  const plan=h.plan('undo',2)
  expect(plan.value).toBe(1)
  expect(h.available()).toEqual({undo:true,redo:false})
  plan.complete?.()
  expect(h.plan('redo',1).value).toBe(2)
 })
 it('refuses stale domain changes, bounds history, and invalidates redo on new edits',()=>{
  const h=new OperationHistory<number>(String,2)
  h.record(0,1);h.record(1,2);h.record(2,3)
  expect(h.plan('undo',9).error).toContain('其他位置')
  h.plan('undo',3).complete?.();h.plan('undo',2).complete?.()
  expect(h.available()).toEqual({undo:false,redo:true})
  h.record(1,5);expect(h.available()).toEqual({undo:true,redo:false})
 })
})

it('clears incompatible history if an operation is too large to retain',()=>{
 const history=new OperationHistory<string>(String,10,20)
 history.record('a','b')
 history.record('b','a'.repeat(20))
 expect(history.available()).toEqual({undo:false,redo:false})
})
