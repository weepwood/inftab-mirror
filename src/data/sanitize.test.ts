import { describe, expect, it } from 'vitest'
import { defaultPreferences } from './defaults'
import {
  sanitizeActiveNoteId,
  sanitizeLauncherOrder,
  sanitizeNotes,
  sanitizePreferences,
  sanitizeShortcuts,
  sanitizeTodos,
} from './sanitize'

describe('local state sanitization', () => {
  it('clamps numeric preferences and restores unknown choices to defaults', () => {
    const result = sanitizePreferences({
      engine: 'javascript',
      mode: 'image',
      shade: -20,
      columns: 500,
      pageTransitionMs: Number.POSITIVE_INFINITY,
      visibleSearchModes: ['map', 'map', 'unsupported'],
    })

    expect(result.engine).toBe(defaultPreferences.engine)
    expect(result.mode).toBe(defaultPreferences.mode)
    expect(result.shade).toBe(0)
    expect(result.columns).toBe(12)
    expect(result.pageTransitionMs).toBe(defaultPreferences.pageTransitionMs)
    expect(result.visibleSearchModes).toEqual(['map'])
  })

  it('drops unsafe shortcuts, duplicate ids, and malformed records', () => {
    const shortcuts = sanitizeShortcuts([
      { id: 'safe', title: ' Safe ', url: 'https://example.com', color: '#abc', mark: 'S' },
      { id: 'unsafe', title: 'Run', url: 'javascript:alert(1)', color: '#abc', mark: '!' },
      { id: 'safe', title: 'Duplicate', url: 'https://other.example', color: '#abc', mark: 'D' },
      null,
    ])

    expect(shortcuts).toEqual([{ id: 'safe', title: 'Safe', url: 'https://example.com', color: '#abc', mark: 'S', icon: undefined }])
  })

  it('repairs launcher order and stale active note references', () => {
    const shortcuts = sanitizeShortcuts([{ id: 'custom', title: 'Custom', url: 'https://example.com', color: '#abc', mark: 'C' }])
    const order = sanitizeLauncherOrder(['ghost', 'custom', 'custom', 'weather'], shortcuts)
    const notes = sanitizeNotes([{ id: 'note-1', title: 'A', body: 'B', updatedAt: -1 }])

    expect(order.slice(0, 2)).toEqual(['custom', 'weather'])
    expect(new Set(order).size).toBe(order.length)
    expect(order).not.toContain('ghost')
    expect(notes[0]?.updatedAt).toBe(0)
    expect(sanitizeActiveNoteId('stale', notes)).toBe('note-1')
    expect(sanitizeTodos([{ id: 'todo', title: '  task ', done: false }])).toEqual([{ id: 'todo', title: 'task', done: false }])
  })
})
