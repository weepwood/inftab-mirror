import { defaultShortcuts } from './defaults'
import type { Shortcut } from '../types'

/** Repair only known obsolete defaults; retain custom URLs, titles and icons. */
export function migrateLegacyShortcuts(shortcuts: Shortcut[]): Shortcut[] {
  const defaultShortcutById = new Map(defaultShortcuts.map((shortcut) => [shortcut.id, shortcut]))
  const outdatedDefaultIcons: Record<string, string> = {
    lunwenmao: 'ebd5cc9193de437e76de2ca1abd2121.png',
    fox: '24f02a8178e623d22dc563857bf32f8.png',
    infinitytab: 'bc545d7b32d3c84c3041ca092fb2689.png',
  }
  const outdatedDefaultUrls: Record<string, string> = {
    fox: 'https://www.google.com/',
    games: 'https://inftab.com/',
    infinitytab: 'https://inftab.com/',
  }
  return shortcuts.map((shortcut) => {
    const defaults = defaultShortcutById.get(shortcut.id)
    const outdatedIcon = outdatedDefaultIcons[shortcut.id]
    const icon = shortcut.icon === outdatedIcon ? defaults?.icon : shortcut.icon ?? defaults?.icon
    const url = shortcut.url === outdatedDefaultUrls[shortcut.id] ? defaults?.url ?? shortcut.url : shortcut.url
    return defaults ? { ...defaults, ...shortcut, icon, url } : shortcut
  })
}
