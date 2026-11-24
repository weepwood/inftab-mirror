import { describe, expect, it } from 'vitest'
import { reservedShortcutRows, splitShortcutPages } from './shortcutPagination'

describe('shortcut pagination', () => {
  it('keeps order and the incomplete final page', () => {
    expect(splitShortcutPages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(splitShortcutPages([], 2)).toEqual([])
    expect(splitShortcutPages([1], 0)).toEqual([])
  })
  it('reserves stable rows for full and incomplete pages', () => {
    expect(reservedShortcutRows(13, 4, 3)).toBe(3)
    expect(reservedShortcutRows(3, 4, 3)).toBe(1)
    expect(reservedShortcutRows(0, 4, 3)).toBe(1)
  })
})
