import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'
import { createLocalId } from './createId'

export type HistoryReason = 'daily' | 'manual' | 'before-change'
export interface HistoryEntry { id: string; createdAt: number; reason: HistoryReason; bytes: number; shortcuts: number; content: string }
export type HistorySummary = Omit<HistoryEntry, 'content'>
export const maxHistoryEntries = 7
const maxSnapshotBytes = 8 * 1024 * 1024
const maxHistoryBytes = 24 * 1024 * 1024
const storeName = 'snapshots'
const dayKey = (time: number) => new Date(time).toDateString()

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持本地备份历史。')); return }
    const request = indexedDB.open('inftab-backup-history', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: 'id' }); request.result.createObjectStore('meta') }
    let blocked = false
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('无法打开备份历史。'))
    request.onblocked = () => { blocked = true; reject(new Error('备份数据库被其他标签页占用。')) }
  })
}

export function trimHistory(entries: HistoryEntry[]) {
  let bytes = 0, count = 0
  return [...entries].sort((a, b) => b.createdAt - a.createdAt).filter(entry => {
    if (count >= maxHistoryEntries || bytes + entry.bytes > maxHistoryBytes) return false
    bytes += entry.bytes
    count++
    return true
  })
}

export async function captureHistory(snapshot: WorkspaceBackup, reason: HistoryReason): Promise<void> {
  // Manual snapshots keep their original point-in-time content before opening IndexedDB.
  const entry = prepareSnapshot(snapshot)
  return persistHistory(() => entry, reason)
}

function prepareSnapshot(snapshot: WorkspaceBackup) {
  const content = JSON.stringify(snapshot)
  const bytes = new Blob([content]).size
  if (bytes > maxSnapshotBytes) throw new Error('快照超过 8 MiB，请先导出 JSON 备份。')
  return { content, bytes, shortcuts: snapshot.shortcuts.length }
}

export function captureDailyHistory(createSnapshot: () => WorkspaceBackup | undefined): Promise<void> {
  return persistHistory(() => {
    const snapshot = createSnapshot()
    return snapshot ? prepareSnapshot(snapshot) : undefined
  }, 'daily')
}

async function persistHistory(prepare: () => ReturnType<typeof prepareSnapshot> | undefined, reason: HistoryReason): Promise<void> {
  const db = await openHistory()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName, 'meta'], 'readwrite')
      const store = tx.objectStore(storeName)
      const meta = tx.objectStore('meta')
      tx.oncomplete = () => resolve()
      let preparationError: unknown
      tx.onabort = tx.onerror = () => reject(preparationError ?? tx.error ?? new Error('备份历史保存失败。'))
      const persist = () => {
        const all = store.getAll()
        all.onsuccess = () => {
        const entries = all.result as HistoryEntry[]
        const now = Date.now()
        if (reason === 'daily' && entries.some(entry => dayKey(entry.createdAt) === dayKey(now))) { meta.put(dayKey(now), 'lastDaily'); return }
        let payload: ReturnType<typeof prepareSnapshot> | undefined
        try { payload = prepare() } catch (error) { preparationError = error; tx.abort(); return }
        if (!payload) return
        const entry: HistoryEntry = { id: createLocalId(), createdAt: now, reason, ...payload }
        const keep = new Set(trimHistory([entry, ...entries]).map(item => item.id))
        if (!keep.has(entry.id)) { tx.abort(); return }
        store.put(entry)
        meta.put(dayKey(now), 'lastDaily')
        for (const existing of entries) if (!keep.has(existing.id)) store.delete(existing.id)
        }
      }
      if (reason !== 'daily') persist()
      else {
        const marker = meta.get('lastDaily')
        marker.onsuccess = () => { if (marker.result !== dayKey(Date.now())) persist() }
      }
    })
  } finally { db.close() }
}
export async function listHistory(): Promise<HistorySummary[]> {
  const db = await openHistory()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll()
      request.onsuccess = () => resolve((request.result as HistoryEntry[]).sort((a,b) => b.createdAt-a.createdAt).map(({content, ...entry}) => entry))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export async function readHistory(id: string): Promise<WorkspaceBackup> {
  const db = await openHistory()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get(id)
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('备份已不存在。')
          resolve(parseWorkspaceBackup(JSON.parse((request.result as HistoryEntry).content)))
        } catch (error) { reject(error) }
      }
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
