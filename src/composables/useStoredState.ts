import { ref, watch, type Ref } from 'vue'

export function useStoredState<T>(key: string, fallback: T): Ref<T> {
  let initial = fallback
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved) as T
      initial = Array.isArray(fallback)
        ? (Array.isArray(parsed) ? parsed : fallback)
        : { ...fallback, ...parsed }
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
