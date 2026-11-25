export interface Point { x: number; y: number }
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

// Resolve visible collisions without altering the canonical coordinates.
export function resolvePoints(ids: string[], saved: Record<string, Point>, width: number, height: number): Record<string, Point> {
  const result: Record<string, Point> = Object.create(null)
  const occupied = new Set<string>()
  const columns = Math.max(1, Math.floor(width / cell))
  const key = (x: number, y: number) => x + ':' + y
  function cells(p: Point) {
    const keys: string[] = []
    for (let y=Math.floor(p.y/cell); y<=Math.ceil((p.y+cell)/cell)-1; y++)
      for (let x=Math.floor(p.x/cell); x<=Math.ceil((p.x+cell)/cell)-1; x++) keys.push(key(x,y))
    return keys
  }
  let cursor=0
  for (const id of [...ids.filter(id=>Object.hasOwn(saved,id)), ...ids.filter(id=>!Object.hasOwn(saved,id))]) {
    let p = Object.hasOwn(saved,id) ? fitPoint(saved[id]!,width,height) : undefined
    if (!p || cells(p).some(k=>occupied.has(k))) {
      do { p = {x:cursor%columns*cell,y:Math.floor(cursor/columns)*cell}; cursor++ } while(cells(p).some(k=>occupied.has(k)))
    }
    result[id]=p
    cells(p).forEach(k=>occupied.add(k))
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
