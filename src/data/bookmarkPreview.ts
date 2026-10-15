import type { BrowserBookmarkNode } from '../types'
import { normalizeWebUrl } from './urls'
import { truncateCodePoints } from './text'

export interface BookmarkPreview {
  id: string
  title: string
  url: string
}

const maxVisitedBookmarks = 5_000
const maxBookmarkDepth = 32
const maxPreviewBookmarks = 5

export function previewBookmarks(tree: BrowserBookmarkNode[]): BookmarkPreview[] {
  const results: BookmarkPreview[] = []
  const stack: Array<{ nodes: BrowserBookmarkNode[]; index: number; depth: number }> = [
    { nodes: tree, index: 0, depth: 0 },
  ]
  let visited = 0

  while (stack.length && visited < maxVisitedBookmarks && results.length < maxPreviewBookmarks) {
    const frame = stack.at(-1)!
    const node = frame.nodes[frame.index]
    if (!node) {
      stack.pop()
      continue
    }
    frame.index += 1
    visited += 1
    if (frame.depth > maxBookmarkDepth) continue
    if (node.children) {
      stack.push({ nodes: node.children, index: 0, depth: frame.depth + 1 })
      continue
    }

    const url = normalizeWebUrl(node.url)
    if (url) results.push({ id: node.id, title: truncateCodePoints(node.title.trim(), 120) || url, url })
  }

  return results
}
