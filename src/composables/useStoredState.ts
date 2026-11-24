import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { localStorageAdapter, type StorageAdapter } from '../data/storageAdapter'
import { sanitizeStoredValue } from '../data/sanitize'

export const storageWriteErrorEvent = 'inftab:storage-write-error'
export const storageWriteSuccessEvent = 'inftab:storage-write-success'

export interface StoredStateOptions<T = unknown> {
  storageAdapter?: StorageAdapter
  /** Keep the incoming value intact for state where external changes should always win. */
  mergeConcurrentChanges?: boolean
  /** Resolve domain-specific conflicts after the standard concurrent edit merge. */
  resolveConcurrentChanges?: (
    current: T,
    previous: T,
    external: T,
    mergeDefault: (current: T, previous: T, external: T) => T,
  ) => T
  /** Use a clean default when another tab clears the entire local storage area. */
  clearFallback?: T
}

let concurrentStateModule: Promise<typeof import('./concurrentState')> | undefined

function loadConcurrentState() {
  concurrentStateModule ??= import('./concurrentState').catch((error: unknown) => {
    concurrentStateModule = undefined
    throw error
  })
  return concurrentStateModule
}

export function useStoredState<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T = (value) => sanitizeStoredValue(value, fallback),
  options: StoredStateOptions<T> = {},
): Ref<T> {
  const adapter = options.storageAdapter ?? localStorageAdapter
  let initial = structuredClone(fallback)
  try {
    const saved = adapter.read(key)
    if (saved) {
      initial = normalize(JSON.parse(saved))
    }
  } catch {
    // Use an independent default when storage is blocked or contains invalid JSON.
  }

  const value = ref(initial) as Ref<T>
  const targetWindow = typeof window === 'undefined' ? undefined : window
  const targetDocument = targetWindow?.document
  const targetStorage = adapter.storageArea()
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let isProcessingStorageEvents = false
  let isDisposed = false
  const pendingStorageEvents: Array<{
    event: StorageEvent
    resolve: () => void
    reject: (reason?: unknown) => void
  }> = []
  let ignoreNextPersistence = false
  let needsWrite = false
  function writeValue(next: T) {
    try {
      adapter.write(key, JSON.stringify(next))
      needsWrite = false
      targetWindow?.dispatchEvent?.(new CustomEvent(storageWriteSuccessEvent, { detail: { key } }))
    } catch {
      needsWrite = true
      targetWindow?.dispatchEvent?.(new CustomEvent(storageWriteErrorEvent, { detail: { key } }))
    }
  }
  function flushPendingWrite() {
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = undefined
    if (needsWrite) writeValue(value.value)
  }
  function scheduleWrite() {
    needsWrite = true
    if (isDisposed) {
      // A storage event already accepted before disposal can still be merging
      // concurrent edits. Persist it now instead of creating a timer whose
      // owner has already been torn down.
      writeValue(value.value)
      return
    }
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      writeValue(value.value)
    }, 180)
  }
  const handleVisibilityChange = () => {
    if (targetDocument?.visibilityState === 'hidden') flushPendingWrite()
  }
  watch(value, () => {
    if (ignoreNextPersistence) return
    scheduleWrite()
    if (options.mergeConcurrentChanges !== false) void loadConcurrentState().catch(() => undefined)
  }, { deep: true, flush: 'sync' })

  const handleStorage = async (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== targetStorage) return
    if (event.key !== key && event.key !== null) return
    let externalValue: T
    try {
      externalValue = event.key === null
        ? normalize(structuredClone(options.clearFallback ?? fallback))
        : event.newValue === null
          ? structuredClone(fallback)
          : normalize(JSON.parse(event.newValue))
    } catch {
      // A corrupt remote payload must not reset a valid in-memory state or
      // cancel a pending local edit. Explicit removal/clear is handled above.
      return
    }
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    persistTimer = undefined
    needsWrite = false
    let nextValue = externalValue
    let persistMergedValue = false
    if (options.mergeConcurrentChanges !== false && event.key === key
      && (typeof event.oldValue === 'string' || event.oldValue === null)) {
      let previousValue: T
      let hasPreviousValue = false
      try {
        previousValue = event.oldValue === null
          ? structuredClone(fallback)
          : normalize(JSON.parse(event.oldValue))
        hasPreviousValue = true
      } catch {
        // Ignore a malformed old value and apply the valid incoming state below.
      }
      if (hasPreviousValue && JSON.stringify(value.value) !== JSON.stringify(previousValue!)) {
        try {
          const { mergeConcurrentEdits, valuesEqual } = await loadConcurrentState()
          const mergeDefault = (current: T, previous: T, external: T) =>
            mergeConcurrentEdits(current, previous, external, normalize)
          nextValue = options.resolveConcurrentChanges
            ? options.resolveConcurrentChanges(value.value, previousValue!, externalValue, mergeDefault)
            : mergeDefault(value.value, previousValue!, externalValue)
          persistMergedValue = !valuesEqual(nextValue, externalValue)
        } catch {
          // Keep this tab's edits if the optional merge chunk cannot be loaded.
          nextValue = value.value
          persistMergedValue = JSON.stringify(nextValue) !== JSON.stringify(externalValue)
        }
      }
    }
    ignoreNextPersistence = true
    try {
      value.value = nextValue
    } finally {
      ignoreNextPersistence = false
    }
    if (persistMergedValue) scheduleWrite()
  }
  async function processStorageEvents() {
    if (isProcessingStorageEvents) return
    isProcessingStorageEvents = true
    try {
      while (pendingStorageEvents.length) {
        const pending = pendingStorageEvents.shift()!
        try {
          await handleStorage(pending.event)
          pending.resolve()
        } catch (error) {
          pending.reject(error)
        }
      }
    } finally {
      isProcessingStorageEvents = false
      if (pendingStorageEvents.length) void processStorageEvents()
    }
  }
  const queueStorageEvent = (event: StorageEvent) => new Promise<void>((resolve, reject) => {
    pendingStorageEvents.push({ event, resolve, reject })
    void processStorageEvents()
  })
  targetWindow?.addEventListener('storage', queueStorageEvent)
  targetWindow?.addEventListener('pagehide', flushPendingWrite)
  targetDocument?.addEventListener('visibilitychange', handleVisibilityChange)
  if (targetWindow && getCurrentScope()) onScopeDispose(() => {
    isDisposed = true
    targetWindow.removeEventListener('storage', queueStorageEvent)
    targetWindow.removeEventListener('pagehide', flushPendingWrite)
    targetDocument?.removeEventListener('visibilitychange', handleVisibilityChange)
    // A scope can be disposed before Vue flushes the watcher or the debounce
    // timer fires. Persist the latest value synchronously so short-lived
    // owners (for example, future plugin panels) cannot silently lose edits.
    flushPendingWrite()
  })

  return value
}
