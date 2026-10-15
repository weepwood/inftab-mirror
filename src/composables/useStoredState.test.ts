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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useStoredState', () => {
  it('sanitizes stale persisted preference values before exposing them', () => {
    installMemoryStorage({ 'prefs.v1': JSON.stringify({ columns: 0, engine: 'unknown', showNames: false }) })
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)

    expect(preferences.value.columns).toBe(2)
    expect(preferences.value.engine).toBe(defaultPreferences.engine)
    expect(preferences.value.showNames).toBe(false)
  })

  it('recovers from malformed JSON and persists the next valid update', async () => {
    vi.useFakeTimers()
    const storage = installMemoryStorage({ 'prefs.v1': '{invalid-json' })
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)
    preferences.value.columns = 8
    await nextTick()
    await vi.advanceTimersByTimeAsync(180)

    expect(preferences.value.columns).toBe(8)
    expect(JSON.parse(storage.get('prefs.v1') ?? '{}').columns).toBe(8)
  })

  it('coalesces rapid edits into a single storage write', async () => {
    vi.useFakeTimers()
    const values = new Map<string, string>()
    const setItem = vi.fn((key: string, value: string) => values.set(key, value))
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => { values.delete(key) },
    })
    const preferences = useStoredState('prefs.v1', defaultPreferences, sanitizePreferences)
    preferences.value.columns = 7
    preferences.value.columns = 8
    preferences.value.columns = 9
    await nextTick()
    await vi.advanceTimersByTimeAsync(180)

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(values.get('prefs.v1') ?? '{}').columns).toBe(9)
  })

  it('flushes the latest edit when its effect scope is disposed before the debounce', () => {
    vi.useFakeTimers()
    const storage = installMemoryStorage()
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const scope = effectScope()
    const preferences = scope.run(() => useStoredState('prefs.v1', defaultPreferences, sanitizePreferences))!

    preferences.value.columns = 11
    scope.stop()

    expect(JSON.parse(storage.get('prefs.v1') ?? '{}').columns).toBe(11)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('flushes a pending write when the page becomes hidden', () => {
    vi.useFakeTimers()
    const storage = installMemoryStorage()
    const listeners = new Map<string, (event?: Event) => void>()
    const document = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: (event?: Event) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    }
    vi.stubGlobal('window', {
      document,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const scope = effectScope()
    const preferences = scope.run(() => useStoredState('prefs.v1', defaultPreferences, sanitizePreferences))!

    preferences.value.columns = 11
    document.visibilityState = 'hidden'
    listeners.get('visibilitychange')!()

    expect(JSON.parse(storage.get('prefs.v1') ?? '{}').columns).toBe(11)
    expect(vi.getTimerCount()).toBe(0)
    scope.stop()
    expect(document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('keeps defaults isolated and follows changes from another tab', async () => {
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
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
    await listeners.get('storage')!({ key: 'prefs.v1', newValue: JSON.stringify({ columns: 4, engine: 'invalid' }) } as StorageEvent)
    expect(preferences.value.columns).toBe(4)
    expect(preferences.value.engine).toBe(defaultPreferences.engine)

    scope.stop()
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })

  it('resets to cloned defaults when another tab clears storage', async () => {
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    vi.stubGlobal('window', { addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener), removeEventListener: vi.fn() })
    installMemoryStorage()
    const scope = effectScope()
    const preferences = scope.run(() => useStoredState('prefs.v1', defaultPreferences, sanitizePreferences))!
    preferences.value.columns = 10
    await listeners.get('storage')!({ key: null, newValue: null } as StorageEvent)

    expect(preferences.value.columns).toBe(6)
    expect(defaultPreferences.columns).toBe(6)
    scope.stop()
  })

  it('ignores matching keys and clear events from sessionStorage', async () => {
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    const removeListener = vi.fn()
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: removeListener,
    })
    installMemoryStorage()
    const scope = effectScope()
    const value = scope.run(() => useStoredState('prefs.v1', { theme: 'local' }))!
    const sessionStorage = {}

    await listeners.get('storage')!({
      key: 'prefs.v1',
      oldValue: null,
      newValue: JSON.stringify({ theme: 'session' }),
      storageArea: sessionStorage,
    } as StorageEvent)
    await listeners.get('storage')!({
      key: null,
      oldValue: null,
      newValue: null,
      storageArea: sessionStorage,
    } as StorageEvent)

    expect(value.value).toEqual({ theme: 'local' })
    scope.stop()
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })

  it('cancels stale writes and does not echo external storage updates', async () => {
    vi.useFakeTimers()
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    const values = new Map<string, string>()
    const setItem = vi.fn((key: string, value: string) => values.set(key, value))
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => { values.delete(key) },
    })
    const scope = effectScope()
    const preferences = scope.run(() => useStoredState('prefs.v1', defaultPreferences, sanitizePreferences))!

    preferences.value.columns = 9
    const externalValue = { ...defaultPreferences, columns: 4 }
    const previousValue = JSON.stringify(defaultPreferences)
    const serializedExternalValue = JSON.stringify(externalValue)
    values.set('prefs.v1', serializedExternalValue)
    await listeners.get('storage')!({ key: 'prefs.v1', oldValue: previousValue, newValue: serializedExternalValue } as StorageEvent)
    await vi.advanceTimersByTimeAsync(180)

    expect(preferences.value.columns).toBe(4)
    expect(setItem).not.toHaveBeenCalled()
    expect(values.get('prefs.v1')).toBe(serializedExternalValue)
    scope.stop()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('persists queued storage merges immediately when their scope is disposed', async () => {
    vi.useFakeTimers()
    const previousValue = JSON.stringify({ first: 'before', second: 'before' })
    const externalValue = JSON.stringify({ first: 'before', second: 'remote' })
    const values = new Map([['state.v1', previousValue]])
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    const setItem = vi.fn((key: string, value: string) => values.set(key, value))
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => { values.delete(key) },
    })
    const scope = effectScope()
    const state = scope.run(() => useStoredState('state.v1', { first: 'before', second: 'before' }))!
    state.value.first = 'local'
    values.set('state.v1', externalValue)
    const onStorage = listeners.get('storage')!
    const pendingMerge = onStorage({ key: 'state.v1', oldValue: previousValue, newValue: externalValue } as StorageEvent)
    const latestValue = JSON.stringify({ first: 'before', second: 'latest' })
    values.set('state.v1', latestValue)
    const queuedMerge = onStorage({ key: 'state.v1', oldValue: externalValue, newValue: latestValue } as StorageEvent)

    scope.stop()
    await Promise.all([pendingMerge, queuedMerge])

    const mergedValue = { first: 'local', second: 'latest' }
    expect(state.value).toEqual(mergedValue)
    expect(JSON.parse(values.get('state.v1') ?? '{}')).toEqual(mergedValue)
    expect(setItem).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('merges concurrent edits to different object fields and persists the combined value', async () => {
    vi.useFakeTimers()
    const previousValue = JSON.stringify({ first: 'before', second: 'before' })
    const externalValue = JSON.stringify({ first: 'before', second: 'remote' })
    const values = new Map([['state.v1', previousValue]])
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    const setItem = vi.fn((key: string, value: string) => values.set(key, value))
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => { values.delete(key) },
    })
    const scope = effectScope()
    const state = scope.run(() => useStoredState('state.v1', { first: 'before', second: 'before' }))!
    state.value.first = 'local'
    values.set('state.v1', externalValue)
    await listeners.get('storage')!({ key: 'state.v1', oldValue: previousValue, newValue: externalValue } as StorageEvent)

    expect(state.value).toEqual({ first: 'local', second: 'remote' })
    await vi.advanceTimersByTimeAsync(180)
    expect(JSON.parse(values.get('state.v1') ?? '{}')).toEqual({ first: 'local', second: 'remote' })

    scope.stop()
  })

  it('applies rapid storage events in arrival order while a merge is loading', async () => {
    vi.useFakeTimers()
    const previous = JSON.stringify({ value: 'before' })
    const first = JSON.stringify({ value: 'shared' })
    const latest = JSON.stringify({ value: 'latest' })
    const values = new Map([['state.v1', first]])
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void | Promise<void>) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    })
    const scope = effectScope()
    const state = scope.run(() => useStoredState('state.v1', { value: 'fallback' }))!
    const listener = listeners.get('storage')!
    values.set('state.v1', latest)

    const earlierEvent = listener({ key: 'state.v1', oldValue: previous, newValue: first } as StorageEvent)
    const laterEvent = listener({ key: 'state.v1', oldValue: first, newValue: latest } as StorageEvent)
    await Promise.all([earlierEvent, laterEvent])

    expect(state.value).toEqual({ value: 'latest' })
    await vi.advanceTimersByTimeAsync(180)
    expect(JSON.parse(values.get('state.v1') ?? '{}')).toEqual({ value: 'latest' })
    scope.stop()
  })

  it('merges concurrent list additions, deletions, and nested ID lists', async () => {
    vi.useFakeTimers()
    const previous = {
      todos: [{ id: 'keep', title: 'Keep' }, { id: 'remove', title: 'Remove' }],
      notes: [{ id: 'note', title: 'Before', body: 'Before' }],
      widgetIds: ['keep-widget'],
    }
    const external = {
      todos: [{ id: 'external', title: 'External' }, { id: 'keep', title: 'Keep updated' }, { id: 'remove', title: 'Remove' }],
      notes: [{ id: 'note', title: 'Before', body: 'Remote body' }],
      widgetIds: ['keep-widget', 'external-widget'],
    }
    const serializedPrevious = JSON.stringify(previous)
    const serializedExternal = JSON.stringify(external)
    const values = new Map([['state.v1', serializedPrevious]])
    const listeners = new Map<string, (event: StorageEvent) => void | Promise<void>>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    })
    const scope = effectScope()
    const state = scope.run(() => useStoredState('state.v1', previous))!
    state.value.todos = [
      { id: 'local', title: 'Local' },
      { id: 'keep', title: 'Keep' },
    ]
    state.value.notes = [{ id: 'note', title: 'Local title', body: 'Before' }]
    state.value.widgetIds = ['keep-widget', 'local-widget']
    values.set('state.v1', serializedExternal)
    await listeners.get('storage')!({ key: 'state.v1', oldValue: serializedPrevious, newValue: serializedExternal } as StorageEvent)

    expect(state.value.todos).toEqual([
      { id: 'external', title: 'External' },
      { id: 'local', title: 'Local' },
      { id: 'keep', title: 'Keep updated' },
    ])
    expect(state.value.notes).toEqual([{ id: 'note', title: 'Local title', body: 'Remote body' }])
    expect(state.value.widgetIds).toEqual(['keep-widget', 'external-widget', 'local-widget'])
    await vi.advanceTimersByTimeAsync(180)
    expect(JSON.parse(values.get('state.v1') ?? '{}')).toEqual(state.value)

    scope.stop()
  })
})
