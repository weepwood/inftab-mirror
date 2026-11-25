export interface Point { x: number; y: number }
export interface DesktopRect extends Point { width: number; height: number }
export interface DesktopLayout { version: 1; snap: boolean; positions: Record<string, Point> }
export const cell = 96
export const freshLayout = (): DesktopLayout => ({ version: 1, snap: true, positions: Object.create(null) })
export function normalizeLayout(value: unknown): DesktopLayout {
  const result = freshLayout()
  if (!value || typeof value !== 'object') return result
  const raw = value as Partial<DesktopLayout>
  if (raw.version !== 1) return result
  result.snap = raw.snap !== false
  for (const [id, point] of Object.entries(raw.positions ?? {}).slice(0, 2000)) {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y) && id.length <= 256)
      result.positions[id] = { x: Math.max(0, Math.min(100000, point.x)), y: Math.max(0, Math.min(100000, point.y)) }
  }
  return result
}
export function fitPoint(point: Point, width: number, height: number, snap = false): Point {
  const fit = (v: number, size: number) => Math.max(0, Math.min(Math.max(0, size-cell), snap ? Math.min(Math.floor(Math.max(0,size-cell)/cell)*cell, Math.round(v/cell)*cell) : v))
  return { x: fit(point.x,width), y: fit(point.y,height) }
}
export function defaultPoint(index: number, width: number): Point {
  const columns = Math.max(1, Math.floor(width/cell))
  return { x: index % columns * cell, y: Math.floor(index/columns)*cell }
}

/** Exact rectangle intersection, including non-grid widget sizes. */
export function rectsOverlap(a:DesktopRect,b:DesktopRect){
 return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height
}
export function createRectOccupancy(rects:DesktopRect[]=[]){
 const occupied=new Map<string,DesktopRect[]>()
 function cells(p:DesktopRect){
  const keys:string[]=[]
  for(let y=Math.floor(p.y/cell);y<Math.ceil((p.y+p.height)/cell);y++)
   for(let x=Math.floor(p.x/cell);x<Math.ceil((p.x+p.width)/cell);x++)keys.push(x+':'+y)
  return keys
 }
 function add(p:DesktopRect){
  for(const k of cells(p)){const bucket=occupied.get(k);if(bucket)bucket.push(p);else occupied.set(k,[p])}
 }
 const overlaps=(p:DesktopRect)=>cells(p).some(k=>occupied.get(k)?.some(q=>rectsOverlap(p,q)))
 rects.forEach(add)
 return {add,overlaps}
}
const iconRect=(p:Point):DesktopRect=>({...p,width:cell,height:cell})
export function createOccupancy(points:Point[]=[]){
 const index=createRectOccupancy(points.map(iconRect))
 return {add:(p:Point)=>index.add(iconRect(p)),overlaps:(p:Point)=>index.overlaps(iconRect(p))}
}

// Resolve visible collisions without altering the canonical coordinates.
export function resolvePoints(ids: string[], saved: Record<string, Point>, width: number, height: number, reserved:DesktopRect[]=[]): Record<string, Point> {
  const result: Record<string, Point> = Object.create(null)
  const index=createRectOccupancy(reserved)
  const add=(p:Point)=>index.add(iconRect(p)),overlaps=(p:Point)=>index.overlaps(iconRect(p))
  const columns = Math.max(1, Math.floor(width / cell))
  let cursor=0
  for (const id of [...ids.filter(id=>Object.hasOwn(saved,id)), ...ids.filter(id=>!Object.hasOwn(saved,id))]) {
    let p = Object.hasOwn(saved,id) ? fitPoint(saved[id]!,width,height) : undefined
    if (!p || overlaps(p)) {
      do { p = {x:cursor%columns*cell,y:Math.floor(cursor/columns)*cell}; cursor++ } while(overlaps(p))
    }
    result[id]=p
    add(p)
  }
  return result
}

/** Translate a selected group without distorting relative positions at viewport edges. */
export function translateGroup(points: Record<string, Point>, delta: Point, width: number, height: number, snap = false): Record<string, Point> {
  const entries = Object.entries(points)
  const result: Record<string, Point> = Object.create(null)
  if (!entries.length) return result
  const values = entries.map(([, point]) => point)
  function axis(key: 'x' | 'y', size: number) {
    const lo = -Math.min(...values.map(p => p[key]))
    const hi = Math.max(lo, size - cell - Math.max(...values.map(p => p[key])))
    const requested = delta[key]
    if (snap) {
      const lower = Math.ceil(lo / cell) * cell
      const upper = Math.floor(hi / cell) * cell
      if (lower <= upper) return Math.max(lower, Math.min(upper, Math.round(requested / cell) * cell))
    }
    return Math.max(lo, Math.min(hi, requested))
  }
  const dx = axis('x', width), dy = axis('y', height)
  for (const [id, point] of entries) result[id] = { x: point.x + dx, y: point.y + dy }
  return result
}

/** Explicit arrange operation: columns fill downwards, from the right edge.
 * Overflow remains accessible below the first screen; never discards an ID. */
export function arrangeFromRight(ids:string[],width:number,height:number):Record<string,Point>{
 const columns=Math.max(1,Math.floor(width/cell)),rows=Math.max(1,Math.floor(height/cell)),capacity=columns*rows
 return Object.fromEntries(ids.map((id,i)=>{
  const slot=i%capacity
  return [id,{x:(columns-1-Math.floor(slot/rows))*cell,y:(Math.floor(i/capacity)*rows+slot%rows)*cell}]
 }))
}
