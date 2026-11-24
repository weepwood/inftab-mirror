import { describe, expect, it } from 'vitest'
import { filterCommands, homeCommands } from './commands'
import { availablePanelIds } from '../plugins/ids'

describe('home command registry', () => {
  it('returns all commands for blank input and filters Chinese and English terms', () => {
    expect(filterCommands('  ')).toEqual(homeCommands)
    expect(filterCommands('DARK theme').map(item => item.id)).toEqual(['dark'])
    expect(filterCommands('笔记').map(item => item.id)).toEqual(['panel:notes'])
    expect(filterCommands('unknown-command')).toEqual([])
  })
  it('registers unique commands and valid panel IDs', () => {
    expect(new Set(homeCommands.map(item => item.id)).size).toBe(homeCommands.length)
    for (const command of homeCommands) if (command.id.startsWith('panel:')) expect(availablePanelIds).toContain(command.id.slice(6))
  })
})
