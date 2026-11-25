export interface WindowGeometry { x:number; y:number; width:number; height:number }
export type WindowSnap = 'left' | 'right' | null
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
export function validGeometry(value:unknown):WindowGeometry|undefined {
 if(!value||typeof value!=='object')return
 const g=value as Partial<WindowGeometry>
 if(!finite(g.x)||!finite(g.y)||!finite(g.width)||!finite(g.height)||g.width<1||g.height<1||g.width>10000||g.height>10000||Math.abs(g.x)>10000||Math.abs(g.y)>10000)return
 return {x:g.x,y:g.y,width:g.width,height:g.height}
}
export function fitWindow(g:WindowGeometry,w:number,h:number):WindowGeometry {
 const mx=Math.min(12,Math.max(0,w/4)), top=Math.min(48,Math.max(0,h/4)), bottom=Math.min(48,Math.max(0,h/4))
 const width=Math.min(Math.max(280,g.width),Math.max(1,w-2*mx))
 const height=Math.min(Math.max(240,g.height),Math.max(1,h-top-bottom))
 return {width,height,x:Math.max(mx,Math.min(w-width-mx,g.x)),y:Math.max(top,Math.min(h-height-bottom,g.y))}
}
export function dockWindow(side:Exclude<WindowSnap,null>,w:number,h:number):WindowGeometry {
 const width=Math.max(1,(w-36)/2)
 if(w<600)return fitWindow({x:12,y:48,width:w-24,height:h-96},w,h)
 return fitWindow({x:side==='left'?12:w-width-12,y:48,width,height:h-96},w,h)
}
const key='inftab.window-geometry.v1'
export function readGeometry(id:string,storage:Pick<Storage,'getItem'>):WindowGeometry|undefined {
 try{const value=JSON.parse(storage.getItem(key)??'{}');return Object.hasOwn(value,id)?validGeometry(value[id]):undefined}catch{return undefined}
}
export function saveGeometry(id:string,value:WindowGeometry,storage:Pick<Storage,'getItem'|'setItem'>) {
 try{
  const raw=JSON.parse(storage.getItem(key)??'{}')
  const entries=Object.entries(raw??{}).filter(([k,v])=>k!==id&&!!validGeometry(v)).slice(-31)
  storage.setItem(key,JSON.stringify(Object.fromEntries([...entries,[id,value]])))
 }catch{/* optional presentation state; never block the application */}
}

export type ResizeEdges={left?:boolean;right?:boolean;top?:boolean;bottom?:boolean}
/** Resize about the opposite edge, even when the minimum or viewport is hit. */
export function resizeWindow(g:WindowGeometry,delta:{left:number;right:number;top:number;bottom:number},edges:ResizeEdges,w:number,h:number):WindowGeometry{
 const base=fitWindow(g,w,h),bounds=fitWindow({x:0,y:0,width:w,height:h},w,h)
 const min=fitWindow({x:0,y:0,width:1,height:1},w,h)
 const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
 const right=base.x+base.width,bottom=base.y+base.height
 const x=edges.left?clamp(base.x+delta.left,bounds.x,right-min.width):base.x
 const y=edges.top?clamp(base.y+delta.top,bounds.y,bottom-min.height):base.y
 return {x,y,width:edges.left?right-x:edges.right?clamp(right+delta.right,x+min.width,bounds.x+bounds.width)-x:base.width,height:edges.top?bottom-y:edges.bottom?clamp(bottom+delta.bottom,y+min.height,bounds.y+bounds.height)-y:base.height}
}
