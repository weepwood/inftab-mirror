import { describe, expect, it } from 'vitest'
import { truncateCodePoints } from './text'

describe('Unicode-safe text limits', () => {
  it('truncates by Unicode code point without leaving half a surrogate pair', () => {
    expect(truncateCodePoints(`${'a'.repeat(23)}😀tail`, 24)).toBe(`${'a'.repeat(23)}😀`)
    expect(truncateCodePoints('🇨🇳Search', 2)).toBe('🇨🇳')
    expect(truncateCodePoints('hello', 0)).toBe('')
  })
})
