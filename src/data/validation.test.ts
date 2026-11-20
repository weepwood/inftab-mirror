import { describe, expect, it } from 'vitest'
import { boundedInteger, isRecord, isValidRecordId } from './validation'

describe('shared data validation', () => {
  it('accepts records but rejects null, arrays, and primitive values', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
    for (const value of [null, undefined, [], ['id'], '', 1, true, () => ({})]) {
      expect(isRecord(value)).toBe(false)
    }
  })

  it('bounds record IDs without changing their contents', () => {
    expect(isValidRecordId('local-id')).toBe(true)
    expect(isValidRecordId('x'.repeat(128))).toBe(true)
    for (const value of ['', 'x'.repeat(129), 1, null, undefined]) {
      expect(isValidRecordId(value)).toBe(false)
    }
  })

  it('rounds finite numbers, clamps the result, and falls back for invalid inputs', () => {
    expect(boundedInteger(2.6, 5, 1, 10)).toBe(3)
    expect(boundedInteger(-5, 5, 1, 10)).toBe(1)
    expect(boundedInteger(15, 5, 1, 10)).toBe(10)
    for (const value of [NaN, Infinity, -Infinity, '3', null, undefined]) {
      expect(boundedInteger(value, 5, 1, 10)).toBe(5)
    }
  })
})
