import { describe, expect, it } from 'vitest'
import { normalizeWebUrl } from './urls'

describe('normalizeWebUrl', () => {
  it('adds HTTPS to ordinary hostnames and canonicalizes web addresses', () => {
    expect(normalizeWebUrl(' example.com/path?q=hello world ')).toBe('https://example.com/path?q=hello%20world')
    expect(normalizeWebUrl('HTTP://Example.com')).toBe('http://example.com/')
  })

  it('rejects executable schemes, missing hosts, and malformed URLs', () => {
    expect(normalizeWebUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeWebUrl('data:text/html,hi')).toBeUndefined()
    expect(normalizeWebUrl('https://')).toBeUndefined()
    expect(normalizeWebUrl('https://[broken')).toBeUndefined()
  })

  it('rejects empty and overlong values', () => {
    expect(normalizeWebUrl('  ')).toBeUndefined()
    expect(normalizeWebUrl(`https://example.com/${'a'.repeat(2048)}`)).toBeUndefined()
  })
})
