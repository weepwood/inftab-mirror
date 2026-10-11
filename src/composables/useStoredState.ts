import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

export const storageWriteErrorEvent = 'inftab:storage-write-error'

export interface StoredStateOptions {
  /** Keep the incoming value intact for state where external edits should always win. */
  mergeConcurrentFields?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valuesEqual(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right)
}

// Preserve local fields untouched by the arriving update; conflicting incoming values win.
function mergeConcurrentObjectEdits<T>(current: T, previous: T, external: T, normalize: (value: unknown) => T): T {
  if (!isRecord(current) || !isRecord(previous) || !isRecord(external)) return external
  const merged: Record<string, unknown> = { ...external }
  for (const key of new Set([...Object.keys(current), ...Object.keys(previous)])) {
    const currentHasKey = Object.hasOwn(current, key)
    const previousHasKey = Object.hasOwn(previous, key)
    const externalHasKey = Object.hasOwn(external, key)
    const localChanged = currentHasKey !== previousHasKey
      || !valuesEqual(current[key], previous[key])
    const externalChanged = externalHasKey !== previousHasKey
      || !valuesEqual(external[key], previous[key])
    if (!localChanged || externalChanged) continue
    if (currentHasKey) merged[key] = current[key]
    else delete merged[key]
  }
  return normalize(merged)
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
    const hadPendingLocalWrite = persistTimer !== undefined
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
    if (options.mergeConcurrentFields !== false && event.key === key && hadPendingLocalWrite
      && (typeof event.oldValue === 'string' || event.oldValue === null)) {
      let previousValue: T
      try {
        previousValue = event.oldValue === null
          ? structuredClone(fallback)
          : normalize(JSON.parse(event.oldValue))
        nextValue = mergeConcurrentObjectEdits(value.value, previousValue, externalValue, normalize)
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
