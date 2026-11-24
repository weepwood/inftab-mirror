// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { previewBookmarkHtml, exportBookmarkHtml } from './bookmarkHtml'
import type { WorkspaceBackup } from './backup'

it('filters unsafe, duplicate and overflow links before any import', () => {
  const result = previewBookmarkHtml('<a href="javascript:alert(1)">bad</a><a href="https://example.com">A</a><a href="https://example.com/">same</a><a href="https://b.example/">B</a><script>throw 1</script><img src="https://tracker.example/">', [], 1)
  expect(result).toEqual({ items: [{ title: 'A', url: 'https://example.com/' }], invalid: 1, duplicates: 1, overflow: 1 })
})
it('escapes text and URL attributes and round-trips HTML links', () => {
  const snapshot = { shortcuts: [{ id: 'x', title: '<script> & "example"', url: 'https://example.com/?a=1&b=2', color: '#abc', mark: 'X' }], folders: [], homeWorkspaces: [{ id: 'default', name: '<Work>', itemIds: ['x'] }] } as WorkspaceBackup
  const html = exportBookmarkHtml(snapshot)
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;Work&gt;')
  expect(previewBookmarkHtml(html, [], 10).items[0]?.title).toBe(snapshot.shortcuts[0]!.title)
})
