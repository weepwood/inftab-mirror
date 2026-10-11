import { effectScope, nextTick } from 'vue'
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

  it('keeps defaults isolated and follows changes from another tab', async () => {
    const listeners = new Map<string, (event: StorageEvent) => void>()
    const removeListener = vi.fn((type: string) => listeners.delete(type))
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: removeListener,
    })
    installMemoryStorage()
    const scope = effectScope()
    const preferences = scope.run(() => useStoredState('prefs.v1', defaultPreferences, sanitizePreferences))!
    preferences.value.columns = 9
    await nextTick()

    expect(defaultPreferences.columns).toBe(6)
    listeners.get('storage')!({ key: 'prefs.v1', newValue: JSON.stringify({ columns: 4, engine: 'invalid' }) } as StorageEvent)
    expect(preferences.value.columns).toBe(4)
    expect(preferences.value.engine).toBe(defaultPreferences.engine)

    scope.stop()
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })

  it('resets to cloned defaults when another tab clears storage', () => {
    const listeners = new Map<string, (event: StorageEvent) => void>()
    vi.stubGlobal('window', { addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener), removeEventListener: vi.fn() })
    installMemoryStorage()
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)
    preferences.value.columns = 10
    listeners.get('storage')!({ key: null, newValue: null } as StorageEvent)

    expect(preferences.value.columns).toBe(6)
    expect(defaultPreferences.columns).toBe(6)
  })
})
