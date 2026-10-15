import { describe, expect, it } from 'vitest'
import { truncateCodePoints, truncateCodeUnits } from './text'

describe('Unicode-safe text limits', () => {
  it('truncates by Unicode code point without leaving half a surrogate pair', () => {
    expect(truncateCodePoints(`${'a'.repeat(23)}😀tail`, 24)).toBe(`${'a'.repeat(23)}😀`)
    expect(truncateCodePoints('🇨🇳Search', 2)).toBe('🇨🇳')
    expect(truncateCodePoints('hello', 0)).toBe('')
  })

  it('stops walking once the requested limit is reached', () => {
    expect(truncateCodePoints(`${'😀'.repeat(10_000)}tail`, 1)).toBe('😀')
  })

  it('keeps an unlimited value intact and treats invalid limits as empty', () => {
    expect(truncateCodePoints('😀text', Number.POSITIVE_INFINITY)).toBe('😀text')
    expect(truncateCodePoints('😀text', Number.NaN)).toBe('')
  })

  it('preserves code point boundaries under a UTF-16 storage-size limit', () => {
    expect(truncateCodeUnits(`${'x'.repeat(499_999)}😀tail`, 500_000)).toBe('x'.repeat(499_999))
    expect(truncateCodeUnits('😀text', 2)).toBe('😀')
    expect(truncateCodeUnits('😀text', 0)).toBe('')
  })
})
