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
  watch(value, (next) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The page remains usable if browser storage is full or unavailable.
    }
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
  if (targetWindow && getCurrentScope()) onScopeDispose(() => targetWindow.removeEventListener('storage', handleStorage))

  return value
}
