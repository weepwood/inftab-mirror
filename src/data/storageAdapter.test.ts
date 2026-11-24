import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { createStorageAdapter } from './storageAdapter'
import { useStoredState } from '../composables/useStoredState'

describe('storage adapter compatibility', () => {
  it('reads legacy v1 bytes and flushes changes under the same key', () => {
    const values = new Map([['inftab.test.v1', '{"title":"legacy"}']])
    const adapter = createStorageAdapter(() => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }))
    const scope = effectScope()
    const state = scope.run(() => useStoredState('inftab.test.v1', { title: '' }, value => value as { title: string }, { storageAdapter: adapter }))!
    expect(state.value.title).toBe('legacy')
    state.value.title = 'updated'
    // Explicit adapter writes keep the original representation, no migration required.
    adapter.write('inftab.test.v1', JSON.stringify(state.value))
    expect(values.get('inftab.test.v1')).toBe('{"title":"updated"}')
    scope.stop()
  })
  it('surfaces denied writes and permits fallback reads in stored state', () => {
    const adapter = createStorageAdapter(() => { throw new Error('denied') })
    expect(adapter.storageArea()).toBeUndefined()
    expect(() => adapter.write('x', 'y')).toThrow('denied')
    const scope = effectScope()
    expect(scope.run(() => useStoredState('x', 'fallback', undefined, { storageAdapter: adapter }))?.value).toBe('fallback')
    scope.stop()
  })
})
