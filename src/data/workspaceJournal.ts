/**
 * Transactional snapshot foundation. Not yet the production storage adapter.
 * Only one head and one recovery snapshot are retained, in the same IDB store.
 * A revision mismatch is an explicit conflict, never an implicit overwrite.
 */
export interface JournalEntry {
  revision: number
  content: string
}
export interface JournalState {
  head?: JournalEntry
  previous?: JournalEntry
}
export const journalName = 'inftab-workspace-journal'
const storeName = 'revisions'
const maxBytes = 8 * 1024 * 1024

function openJournal(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(journalName, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onblocked = () => { blocked = true; reject(new Error('事务数据库被其他标签页占用。')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

function validated(entry: unknown): JournalEntry | undefined {
  if (entry === undefined) return undefined
  const value = entry as JournalEntry | null
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.content !== 'string') throw new Error('事务记录损坏，拒绝覆盖。')
  return value
}

export async function readJournal(factory: IDBFactory = indexedDB): Promise<JournalState> {
  const db = await openJournal(factory)
  try {
    return await new Promise<JournalState>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const head = store.get('head'), previous = store.get('previous')
      tx.onabort = () => reject(tx.error ?? new Error('读取事务记录失败。'))
      tx.oncomplete = () => {
        try { resolve({ head: validated(head.result), previous: validated(previous.result) }) }
        catch (error) { reject(error) }
      }
    })
  } finally { db.close() }
}

export async function commitJournal(expected: number | null, content: string, factory: IDBFactory = indexedDB): Promise<JournalEntry> {
  if (expected !== null && (!Number.isSafeInteger(expected) || expected < 1 || expected >= Number.MAX_SAFE_INTEGER)) throw new Error('事务版本无效。')
  if (typeof content !== 'string' || new Blob([content]).size > maxBytes) throw new Error('事务快照超过限制。')
  const snapshot = JSON.parse(content)
  if (snapshot?.format !== 'inftab-workspace' || snapshot.version !== 1) throw new Error('事务快照格式无效。')
  const db = await openJournal(factory)
  try {
    return await new Promise<JournalEntry>((resolve, reject) => {
      let tx: IDBTransaction
      try { tx = db.transaction(storeName, 'readwrite', { durability: 'strict' }) }
      catch (error) {
        // Older engines may not support the durability hint. Do not swallow
        // permission, quota or other storage errors.
        if (!(error instanceof TypeError)) throw error
        tx = db.transaction(storeName, 'readwrite')
      }
      const store = tx.objectStore(storeName)
      const current = store.get('head')
      let failure: unknown
      let next: JournalEntry
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('事务已中止。'))
      tx.oncomplete = () => resolve(next)
      current.onsuccess = () => {
        try {
          const head = validated(current.result)
          if ((head?.revision ?? null) !== expected) throw new Error('版本冲突，请重新读取后再操作。')
          next = { revision: (expected ?? 0) + 1, content }
          if (head) store.put(head, 'previous')
          store.put(next, 'head')
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
    })
  } finally { db.close() }
}
