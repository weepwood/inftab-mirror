import { toLocalDateKey } from './calendar'
import type { WorkspaceBackup } from './backup'

// Downloads are user-initiated, not part of the new-tab startup graph. Keep the
// serializer and temporary DOM/Blob work here, alongside the lazy import path.
export function downloadWorkspaceBackup(backup: WorkspaceBackup) {
  const contents = JSON.stringify(backup, null, 2)
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = `inftab-backup-${toLocalDateKey(new Date())}.json`
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Give the browser time to consume the Blob, even if the panel is closed.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
