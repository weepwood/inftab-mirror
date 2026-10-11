import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from '../data/defaults'
import { sanitizePreferences } from '../data/sanitize'
import { useStoredState } from './useStoredState'

function installMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  vi.stubGlobal('localStorage', storage)
  return values
}

afterEach(() => vi.unstubAllGlobals())

describe('useStoredState', () => {
  it('sanitizes stale persisted preference values before exposing them', () => {
    installMemoryStorage({ 'prefs.v1': JSON.stringify({ columns: 0, engine: 'unknown', showNames: false }) })
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)

    expect(preferences.value.columns).toBe(2)
    expect(preferences.value.engine).toBe(defaultPreferences.engine)
    expect(preferences.value.showNames).toBe(false)
  })

  it('recovers from malformed JSON and persists the next valid update', async () => {
    const storage = installMemoryStorage({ 'prefs.v1': '{invalid-json' })
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)
    preferences.value.columns = 8
    await nextTick()

    expect(preferences.value.columns).toBe(8)
    expect(JSON.parse(storage.get('prefs.v1') ?? '{}').columns).toBe(8)
  })
})
