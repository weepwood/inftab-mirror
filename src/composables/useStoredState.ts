import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

export const storageWriteErrorEvent = 'inftab:storage-write-error'

export interface StoredStateOptions {
  /** Keep the incoming value intact for state where external changes should always win. */
  mergeConcurrentChanges?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valuesEqual(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right)
}

function isIdentifiedRecord(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && typeof value.id === 'string'
}

function insertByReferenceOrder(base: string[], desired: Set<string>, referenceOrders: string[][]) {
  const result = [...new Set(base.filter((id) => desired.has(id)))]
  for (const order of referenceOrders) {
    order.forEach((id, index) => {
      if (!desired.has(id) || result.includes(id)) return
      const nextId = order.slice(index + 1).find((candidate) => result.includes(candidate))
      if (nextId) {
        result.splice(result.indexOf(nextId), 0, id)
        return
      }
      result.push(id)
    })
  }
  return result
}

function mergeConcurrentStringArrays(current: string[], previous: string[], external: string[]) {
  const currentSet = new Set(current)
  const previousSet = new Set(previous)
  const externalSet = new Set(external)
  const desired = new Set(external)
  for (const id of new Set([...current, ...previous])) {
    const localChanged = currentSet.has(id) !== previousSet.has(id)
    const externalChanged = externalSet.has(id) !== previousSet.has(id)
    if (!localChanged || externalChanged) continue
    if (currentSet.has(id)) desired.add(id)
    else desired.delete(id)
  }
  const localOrderChanged = !valuesEqual(current, previous)
  const externalOrderChanged = !valuesEqual(external, previous)
  const base = localOrderChanged && !externalOrderChanged ? current : external
  return insertByReferenceOrder(base, desired, [current, external])
}

function mergeConcurrentIdentifiedArrays(
  current: Array<Record<string, unknown> & { id: string }>,
  previous: Array<Record<string, unknown> & { id: string }>,
  external: Array<Record<string, unknown> & { id: string }>,
): Array<Record<string, unknown> & { id: string }> {
  const currentById = new Map(current.map((item) => [item.id, item]))
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const externalById = new Map(external.map((item) => [item.id, item]))
  const mergedById = new Map(externalById)
  for (const id of new Set([...currentById.keys(), ...previousById.keys()])) {
    const currentItem = currentById.get(id)
    const previousItem = previousById.get(id)
    const externalItem = externalById.get(id)
    const localChanged = !valuesEqual(currentItem, previousItem)
    const externalChanged = !valuesEqual(externalItem, previousItem)
    if (!localChanged) continue
    if (!currentItem) {
      if (!externalChanged) mergedById.delete(id)
    } else if (!previousItem) {
      if (!externalItem) mergedById.set(id, currentItem)
    } else if (externalItem) {
      mergedById.set(id, mergeConcurrentValue(currentItem, previousItem, externalItem) as Record<string, unknown> & { id: string })
    }
  }
  const currentIds = current.map((item) => item.id)
  const previousIds = previous.map((item) => item.id)
  const externalIds = external.map((item) => item.id)
  const localOrderChanged = !valuesEqual(currentIds, previousIds)
  const externalOrderChanged = !valuesEqual(externalIds, previousIds)
  const baseIds = localOrderChanged && !externalOrderChanged ? currentIds : externalIds
  const orderedIds = insertByReferenceOrder(baseIds, new Set(mergedById.keys()), [currentIds, externalIds])
  return orderedIds.flatMap((id) => {
    const item = mergedById.get(id)
    return item ? [item] : []
  })
}

function mergeConcurrentValue(current: unknown, previous: unknown, external: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(previous) && Array.isArray(external)) {
    if ([...current, ...previous, ...external].every((item) => typeof item === 'string')) {
      return mergeConcurrentStringArrays(current as string[], previous as string[], external as string[])
    }
    if ([...current, ...previous, ...external].every(isIdentifiedRecord)) {
      return mergeConcurrentIdentifiedArrays(
        current as Array<Record<string, unknown> & { id: string }>,
        previous as Array<Record<string, unknown> & { id: string }>,
        external as Array<Record<string, unknown> & { id: string }>,
      )
    }
    return external
  }
  if (isRecord(current) && isRecord(previous) && isRecord(external)) {
    const merged: Record<string, unknown> = { ...external }
    for (const key of new Set([...Object.keys(current), ...Object.keys(previous)])) {
      const currentHasKey = Object.hasOwn(current, key)
      const previousHasKey = Object.hasOwn(previous, key)
      const externalHasKey = Object.hasOwn(external, key)
      const localChanged = currentHasKey !== previousHasKey || !valuesEqual(current[key], previous[key])
      const externalChanged = externalHasKey !== previousHasKey || !valuesEqual(external[key], previous[key])
      if (!localChanged) continue
      if (!externalChanged) {
        if (currentHasKey) merged[key] = current[key]
        else delete merged[key]
      } else if (currentHasKey && previousHasKey && externalHasKey) {
        merged[key] = mergeConcurrentValue(current[key], previous[key], external[key])
      }
    }
    return merged
  }
  return external
}

// Preserve local edits when the incoming update leaves them untouched; conflicting values from incoming win.
function mergeConcurrentEdits<T>(current: T, previous: T, external: T, normalize: (value: unknown) => T): T {
  return normalize(mergeConcurrentValue(current, previous, external))
}

export function useStoredState<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T = (value) => sanitizeStoredValue(value, fallback),
  options: StoredStateOptions = {},
): Ref<T> {
  let initial = structuredClone(fallback)
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      initial = normalize(JSON.parse(saved))
    }
  } catch {
    // Use an independent default when storage is blocked or contains invalid JSON.
  }

  const value = ref(initial) as Ref<T>
  const targetWindow = typeof window === 'undefined' ? undefined : window
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let ignoreNextPersistence = false
  function writeValue(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      targetWindow?.dispatchEvent(new CustomEvent(storageWriteErrorEvent, { detail: { key } }))
    }
  }
  function flushPendingWrite() {
    if (persistTimer === undefined) return
    clearTimeout(persistTimer)
    persistTimer = undefined
    writeValue(value.value)
  }
  function scheduleWrite() {
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      writeValue(value.value)
    }, 180)
  }
  watch(value, () => {
    if (ignoreNextPersistence) return
    scheduleWrite()
  }, { deep: true, flush: 'sync' })

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = undefined
    let externalValue: T
    try {
      externalValue = event.newValue === null
        ? structuredClone(fallback)
        : normalize(JSON.parse(event.newValue))
    } catch {
      externalValue = structuredClone(fallback)
    }
    let nextValue = externalValue
    if (options.mergeConcurrentChanges !== false && event.key === key
      && (typeof event.oldValue === 'string' || event.oldValue === null)) {
      let previousValue: T
      try {
        previousValue = event.oldValue === null
          ? structuredClone(fallback)
          : normalize(JSON.parse(event.oldValue))
        nextValue = mergeConcurrentEdits(value.value, previousValue, externalValue, normalize)
      } catch {
        nextValue = externalValue
      }
    }
    ignoreNextPersistence = true
    try {
      value.value = nextValue
    } finally {
      ignoreNextPersistence = false
    }
    if (!valuesEqual(nextValue, externalValue)) scheduleWrite()
  }
  targetWindow?.addEventListener('storage', handleStorage)
  targetWindow?.addEventListener('pagehide', flushPendingWrite)
  if (targetWindow && getCurrentScope()) onScopeDispose(() => {
    targetWindow.removeEventListener('storage', handleStorage)
    targetWindow.removeEventListener('pagehide', flushPendingWrite)
    // A scope can be disposed before Vue flushes the watcher or the debounce
    // timer fires. Persist the latest value synchronously so short-lived
    // owners (for example, future plugin panels) cannot silently lose edits.
    flushPendingWrite()
  })

  return value
}
