import { describe, expect, it } from 'vitest'
import { buildTranslationUrl } from './translation'

describe('translation URL generation', () => {
  it('opens the translation page with a safely encoded query and Chinese target language', () => {
    expect(buildTranslationUrl('  Hello & 世界 / café  ')).toBe(
      'https://translate.google.com/?sl=auto&tl=zh-CN&text=Hello%20%26%20%E4%B8%96%E7%95%8C%20%2F%20caf%C3%A9&op=translate',
    )
  })

  it('does not navigate for empty text and replaces malformed Unicode', () => {
    expect(buildTranslationUrl('   ')).toBe('')
    expect(buildTranslationUrl('\ud800')).toBe('https://translate.google.com/?sl=auto&tl=zh-CN&text=%EF%BF%BD&op=translate')
  })
})
