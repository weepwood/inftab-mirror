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
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开备份历史。'))
    request.onblocked = () => reject(new Error('备份数据库被其他标签页占用。'))
  })
}

export function trimHistory(entries: HistoryEntry[]) {
  let bytes = 0
  return [...entries].sort((a, b) => b.createdAt - a.createdAt).filter((entry, index) => {
    if (index >= maxHistoryEntries || bytes + entry.bytes > maxHistoryBytes) return false
    bytes += entry.bytes
    return true
  })
}

export async function captureHistory(snapshot: WorkspaceBackup, reason: HistoryReason): Promise<void> {
  const content = JSON.stringify(snapshot)
  const bytes = new Blob([content]).size
  if (bytes > maxSnapshotBytes) throw new Error('快照超过 8 MiB，请先导出 JSON 备份。')
  const db = await openHistory()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const all = store.getAll()
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('备份历史保存失败。'))
      all.onsuccess = () => {
        const entries = all.result as HistoryEntry[]
        const now = Date.now()
        if (reason === 'daily' && entries.some(entry => dayKey(entry.createdAt) === dayKey(now))) return
        const entry: HistoryEntry = { id: createLocalId(), createdAt: now, reason, bytes, shortcuts: snapshot.shortcuts.length, content }
        const keep = new Set(trimHistory([entry, ...entries]).map(item => item.id))
        store.put(entry)
        for (const existing of entries) if (!keep.has(existing.id)) store.delete(existing.id)
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
