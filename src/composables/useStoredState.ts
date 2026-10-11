import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

export const storageWriteErrorEvent = 'inftab:storage-write-error'

export function useStoredState<T>(key: string, fallback: T, normalize: (value: unknown) => T = (value) => sanitizeStoredValue(value, fallback)): Ref<T> {
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
  function writeValue(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      targetWindow?.dispatchEvent(new CustomEvent(storageWriteErrorEvent, { detail: { key } }))
    }
  }
  function flushPendingWrite() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = undefined
    writeValue(value.value)
  }
  watch(value, (next) => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      writeValue(next)
    }, 180)
  }, { deep: true })

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return
    try {
      value.value = event.newValue === null
        ? structuredClone(fallback)
        : normalize(JSON.parse(event.newValue))
    } catch {
      value.value = structuredClone(fallback)
    }
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
