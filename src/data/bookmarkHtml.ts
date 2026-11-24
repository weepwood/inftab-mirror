import { downloadText } from './downloadBackup'
import { normalizeWebUrl } from './urls'
import { truncateCodePoints } from './text'
import type { Shortcut, BookmarkShortcutCandidate } from '../types'
import type { WorkspaceBackup } from './backup'

export const maxBookmarkHtmlBytes = 5 * 1024 * 1024
export function previewBookmarkHtml(html: string, existing: Shortcut[], slots: number) {
  if (new Blob([html]).size > maxBookmarkHtmlBytes) throw new Error('书签文件超过 5 MiB。')
  // A detached template has inert contents. Never attach imported markup or execute it.
  const template = document.createElement('template')
  template.innerHTML = html
  const seen = new Set(existing.map(item => normalizeWebUrl(item.url)))
  const items: BookmarkShortcutCandidate[] = []
  let invalid = 0, duplicates = 0, overflow = 0
  const limit = Math.max(0, Math.min(500, Math.floor(slots)))
  for (const anchor of template.content.querySelectorAll('a')) {
    const raw = anchor.getAttribute('href')?.trim() ?? ''
    const url = /^https?:\/\//i.test(raw) ? normalizeWebUrl(raw) : undefined
    if (!url) { invalid++; continue }
    if (seen.has(url)) { duplicates++; continue }
    seen.add(url)
    if (items.length >= limit) { overflow++; continue }
    items.push({ title: truncateCodePoints(anchor.textContent?.trim() || url, 80), url })
  }
  return { items, invalid, duplicates, overflow }
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
export function exportBookmarkHtml(snapshot: Pick<WorkspaceBackup, 'shortcuts' | 'folders' | 'homeWorkspaces'>): string {
  const byId = new Map(snapshot.shortcuts.map(item => [item.id, item]))
  const written = new Set<string>()
  const link = (item?: Shortcut) => {
    if (!item || written.has(item.id)) return ''
    const url = normalizeWebUrl(item.url)
    if (!url) return ''
    written.add(item.id)
    return `<DT><A HREF="${escape(url)}">${escape(item.title)}</A>\n`
  }
  const group = (name: string, body: string) => body ? `<DT><H3>${escape(name)}</H3>\n<DL><p>\n${body}</DL><p>\n` : ''
  const sections = (snapshot.homeWorkspaces ?? []).map(workspace => {
    const folders = snapshot.folders.filter(folder => workspace.itemIds.includes(folder.id))
    const folderItems = new Set(folders.flatMap(folder => folder.shortcutIds))
    return group(workspace.name, folders.map(folder => group(folder.title, folder.shortcutIds.map(id => link(byId.get(id))).join(''))).join('')
      + workspace.itemIds.filter(id => !folderItems.has(id)).map(id => link(byId.get(id))).join(''))
  }).join('')
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Inftab Bookmarks</TITLE>\n<H1>Inftab Bookmarks</H1>\n<DL><p>\n' + sections
    + group('其他入口', snapshot.shortcuts.map(item => link(item)).join('')) + '</DL><p>\n'
}
export function downloadBookmarkHtml(snapshot: WorkspaceBackup) {
  downloadText(exportBookmarkHtml(snapshot), 'text/html;charset=utf-8', 'inftab-bookmarks.html')
}
