import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

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
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  function writeValue(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The page remains usable if browser storage is full or unavailable.
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
  const targetWindow = typeof window === 'undefined' ? undefined : window
  targetWindow?.addEventListener('storage', handleStorage)
  targetWindow?.addEventListener('pagehide', flushPendingWrite)
  if (targetWindow && getCurrentScope()) onScopeDispose(() => {
    targetWindow.removeEventListener('storage', handleStorage)
    targetWindow.removeEventListener('pagehide', flushPendingWrite)
    if (persistTimer) clearTimeout(persistTimer)
  })

  return value
}
