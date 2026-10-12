import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

export const storageWriteErrorEvent = 'inftab:storage-write-error'

export interface StoredStateOptions {
  /** Keep the incoming value intact for state where external changes should always win. */
  mergeConcurrentChanges?: boolean
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
  const targetDocument = targetWindow?.document
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let isProcessingStorageEvents = false
  const pendingStorageEvents: Array<{
    event: StorageEvent
    resolve: () => void
    reject: (reason?: unknown) => void
  }> = []
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
  const handleVisibilityChange = () => {
    if (targetDocument?.visibilityState === 'hidden') flushPendingWrite()
  }
  watch(value, () => {
    if (ignoreNextPersistence) return
    scheduleWrite()
    if (options.mergeConcurrentChanges !== false) void loadConcurrentState().catch(() => undefined)
  }, { deep: true, flush: 'sync' })

  const handleStorage = async (event: StorageEvent) => {
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
          nextValue = mergeConcurrentEdits(value.value, previousValue!, externalValue, normalize)
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
