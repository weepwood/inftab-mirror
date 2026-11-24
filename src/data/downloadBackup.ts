import { toLocalDateKey } from './calendar'
import type { WorkspaceBackup } from './backup'

// Downloads are user-initiated, not part of the new-tab startup graph. Keep the
// serializer and temporary DOM/Blob work here, alongside the lazy import path.
export function downloadWorkspaceBackup(backup: WorkspaceBackup) {
  downloadText(JSON.stringify(backup, null, 2), 'application/json', `inftab-backup-${toLocalDateKey(new Date())}.json`)
}

export function downloadText(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Give the browser time to consume the Blob, even if the panel is closed.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
