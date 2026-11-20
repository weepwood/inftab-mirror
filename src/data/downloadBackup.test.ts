// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadWorkspaceBackup } from './downloadBackup'
import { defaultPreferences } from './defaults'
import type { WorkspaceBackup } from './backup'

const backup: WorkspaceBackup = {
  format: 'inftab-workspace', version: 1, exportedAt: '2026-11-20T00:00:00.000Z',
  preferences: defaultPreferences, shortcuts: [], folders: [], launcherOrder: [],
  todos: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('on-demand backup download', () => {
  it('downloads a dated JSON snapshot and releases its Blob after the browser consumes it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:backup')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('inftab-backup-2026-11-20.json')
      expect(this.isConnected).toBe(true)
      expect(this.hidden).toBe(true)
    })
    downloadWorkspaceBackup(backup)
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })

  it('cleans temporary DOM and URLs even if the browser refuses the download', () => {
    vi.useFakeTimers()
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:failed', revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Download blocked') })
    expect(() => downloadWorkspaceBackup(backup)).toThrow('Download blocked')
    expect(document.querySelector('a')).toBeNull()
    vi.advanceTimersByTime(10_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed')
  })
})
