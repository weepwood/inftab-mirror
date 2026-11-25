/** Bounded, domain-only history. An external edit must never be overwritten by undo. */
export class OperationHistory<T> {
 private past:{before:T;after:T;bytes:number}[]=[]
 private future:{before:T;after:T;bytes:number}[]=[]
 constructor(private readonly signature:(value:T)=>string,private readonly limit=10,private readonly budget=4*1024*1024){}
 record(before:T,after:T){
  if(this.signature(before)===this.signature(after))return
  const bytes=2*(this.signature(before).length+this.signature(after).length)
  this.future=[]
  if(bytes>this.budget){this.past=[];return}
  this.past.push({before,after,bytes});this.past=this.past.slice(-this.limit)
  while(this.past.reduce((sum,entry)=>sum+entry.bytes,0)>this.budget)this.past.shift()
 }
 available(){return {undo:this.past.length>0,redo:this.future.length>0}}
 plan(direction:'undo'|'redo',current:T){
  const entry=(direction==='undo'?this.past:this.future).at(-1)
  if(!entry)return {error:'没有可'+(direction==='undo'?'撤销':'重做')+'的操作。'} as const
  const expected=direction==='undo'?entry.after:entry.before
  if(this.signature(current)!==this.signature(expected))return {error:'入口或布局已在其他位置修改，不能安全撤销或重做。'} as const
  return {value:direction==='undo'?entry.before:entry.after,complete:()=>{
   if(direction==='undo'){this.past.pop();this.future.push(entry)}
   else{this.future.pop();this.past.push(entry)}
  }} as const
 }
}
