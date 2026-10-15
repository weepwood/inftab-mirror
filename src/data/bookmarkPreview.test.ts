import { describe, expect, it } from 'vitest'
import { previewBookmarks } from './bookmarkPreview'
import type { BrowserBookmarkNode } from '../types'

describe('bookmark previews', () => {
  it('stops walking the tree after the global visit limit', () => {
    let visitedChildren = 0
    const children = new Proxy(Array.from({ length: 6_000 }, (_, index) => ({
      id: `invalid-${index}`,
      title: 'No URL',
    } satisfies BrowserBookmarkNode)), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) visitedChildren += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const tree: BrowserBookmarkNode[] = [{ id: 'root', title: '', children }]

    expect(previewBookmarks(tree)).toEqual([])
    expect(visitedChildren).toBe(4_999)
  })

  it('returns the first five safe bookmarks in folder order', () => {
    const tree: BrowserBookmarkNode[] = [{
      id: 'bar',
      title: 'Bookmarks bar',
      children: [
        { id: 'unsafe', title: 'Unsafe', url: 'javascript:alert(1)' },
        ...Array.from({ length: 6 }, (_, index) => ({ id: `bookmark-${index}`, title: ` Link ${index} `, url: `https://example.com/${index}` })),
      ],
    }]

    expect(previewBookmarks(tree)).toEqual(Array.from({ length: 5 }, (_, index) => ({
      id: `bookmark-${index}`,
      title: `Link ${index}`,
      url: `https://example.com/${index}`,
    })))
  })

  it('truncates imported bookmark titles without splitting emoji', () => {
    expect(previewBookmarks([{
      id: 'emoji', title: `${'x'.repeat(119)}😀tail`, url: 'https://example.com',
    }])).toEqual([{
      id: 'emoji', title: `${'x'.repeat(119)}😀`, url: 'https://example.com/',
    }])
  })
})
