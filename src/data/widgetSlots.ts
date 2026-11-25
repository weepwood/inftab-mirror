import { type HomeWidgetId } from '../plugins/ids'
import type { HomeWidgetSize } from '../types'
import type { Point } from '../desktop/layout'
export type WidgetSlot = Point & {canvas?:Point}
export type WidgetSlots = Partial<Record<HomeWidgetId, WidgetSlot>>
const columns=3,rows=16
export function widgetSpan(size:HomeWidgetSize){return size==='full'?3:size==='wide'?2:1}
export function canPlaceWidget(id:HomeWidgetId,p:Point,slots:WidgetSlots,sizes:Record<HomeWidgetId,HomeWidgetSize>){
 const span=widgetSpan(sizes[id])
 return Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x+span<=columns&&p.y<rows&&!Object.entries(slots).some(([other,q])=>other!==id&&q.y===p.y&&q.x<p.x+span&&p.x<q.x+widgetSpan(sizes[other as HomeWidgetId]))
}
export function resolveWidgetSlots(ids:HomeWidgetId[],saved:WidgetSlots,sizes:Record<HomeWidgetId,HomeWidgetSize>):WidgetSlots{
 const result:WidgetSlots={}
 for(const id of [...ids.filter(id=>saved[id]),...ids.filter(id=>!saved[id])]){
  const p=saved[id]
  if(p&&canPlaceWidget(id,p,result,sizes)){result[id]=p;continue}
  for(let i=0;i<columns*rows;i++){
   const candidate={x:i%columns,y:Math.floor(i/columns)}
   if(canPlaceWidget(id,candidate,result,sizes)){result[id]=candidate;break}
  }
 }
 return result
}
