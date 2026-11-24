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
  const fit = (v: number, size: number) => Math.max(0, Math.min(Math.max(0, size-cell), snap ? Math.round(v/cell)*cell : v))
  return { x: fit(point.x,width), y: fit(point.y,height) }
}
export function defaultPoint(index: number, width: number): Point {
  const columns = Math.max(1, Math.floor(width/cell))
  return { x: index % columns * cell, y: Math.floor(index/columns)*cell }
}
