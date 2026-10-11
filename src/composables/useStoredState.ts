import { ref, watch, type Ref } from 'vue'
import { sanitizeStoredValue } from '../data/sanitize'

export function useStoredState<T>(key: string, fallback: T, normalize: (value: unknown) => T = (value) => sanitizeStoredValue(value, fallback)): Ref<T> {
  let initial = fallback
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      initial = normalize(JSON.parse(saved))
    }
  } catch {
    // Keep the defaults when storage is blocked or contains invalid JSON.
  }

  const value = ref(initial) as Ref<T>
  watch(value, (next) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The page remains usable if browser storage is full or unavailable.
    }
  }, { deep: true })
  return value
}
