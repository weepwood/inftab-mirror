import { describe, expect, it } from 'vitest'
import { normalizeWebUrl } from './urls'

describe('normalizeWebUrl', () => {
  it('adds HTTPS to ordinary hostnames and canonicalizes web addresses', () => {
    expect(normalizeWebUrl(' example.com/path?q=hello world ')).toBe('https://example.com/path?q=hello%20world')
    expect(normalizeWebUrl('HTTP://Example.com')).toBe('http://example.com/')
  })

  it('accepts localhost and hostname addresses with explicit ports', () => {
    expect(normalizeWebUrl('localhost:5173')).toBe('https://localhost:5173/')
    expect(normalizeWebUrl('example.com:8080/tools')).toBe('https://example.com:8080/tools')
    expect(normalizeWebUrl('http://localhost:3000/')).toBe('http://localhost:3000/')
  })

  it('rejects executable schemes, missing hosts, and malformed URLs', () => {
    expect(normalizeWebUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeWebUrl('data:text/html,hi')).toBeUndefined()
    expect(normalizeWebUrl('https://')).toBeUndefined()
    expect(normalizeWebUrl('https://[broken')).toBeUndefined()
  })

  it('rejects URLs that embed usernames or passwords', () => {
    expect(normalizeWebUrl('https://alice:secret@example.com/path')).toBeUndefined()
    expect(normalizeWebUrl('http://alice@example.com/')).toBeUndefined()
  })

  it('rejects empty and overlong values', () => {
    expect(normalizeWebUrl('  ')).toBeUndefined()
    expect(normalizeWebUrl(`https://example.com/${'a'.repeat(2048)}`)).toBeUndefined()
  })
})
