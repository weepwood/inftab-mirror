import { describe, expect, it } from 'vitest'
import {
  defaultHomeWorkspace,
  defaultHomeWorkspaceId,
  maxHomeWorkspaces,
  sanitizeActiveHomeWorkspaceId,
  sanitizeHomeWorkspaces,
  type HomeWorkspace,
} from './homeWorkspaces'

describe('homepage workspaces', () => {
  it('migrates a legacy launcher collection into the default workspace', () => {
    expect(sanitizeHomeWorkspaces(undefined, ['weather', 'custom-link'], ['weather', 'todos'])).toEqual([
      { id: defaultHomeWorkspaceId, name: '主页', itemIds: ['weather', 'custom-link', 'todos'] },
    ])
  })

  it('repairs malformed entries, duplicate names, and invalid active IDs', () => {
    const workspaces = sanitizeHomeWorkspaces([
      { id: 'work', name: '工作', itemIds: ['shortcut-a', 'shortcut-a', ''] },
      { id: 'work-two', name: '工作', itemIds: ['shortcut-b'] },
      { id: '', name: 'Bad ID', itemIds: [] },
    ], ['legacy-link'], ['weather'])

    expect(workspaces).toEqual([
      { id: defaultHomeWorkspaceId, name: '主页', itemIds: ['legacy-link', 'weather'] },
      { id: 'work', name: '工作', itemIds: ['shortcut-a', 'weather'] },
      { id: 'work-two', name: '工作 (2)', itemIds: ['shortcut-b', 'weather'] },
    ])
    expect(sanitizeActiveHomeWorkspaceId('deleted-space', workspaces)).toBe(defaultHomeWorkspaceId)
    expect(sanitizeActiveHomeWorkspaceId('work-two', workspaces)).toBe('work-two')
  })

  it('truncates workspace names at code point boundaries, including duplicate suffixes', () => {
    const name = `${'x'.repeat(39)}😀tail`
    const workspaces = sanitizeHomeWorkspaces([
      { id: 'default', name, itemIds: [] },
      { id: 'duplicate', name, itemIds: [] },
    ])

    expect(workspaces.map((workspace) => workspace.name)).toEqual([
      `${'x'.repeat(39)}😀`,
      `${'x'.repeat(36)} (2)`,
    ])
  })

  it('limits workspace count while preserving the required default space', () => {
    const input: HomeWorkspace[] = Array.from({ length: maxHomeWorkspaces + 5 }, (_, index) => ({
      id: `space-${index}`,
      name: `Space ${index}`,
      itemIds: [],
    }))
    input.push(defaultHomeWorkspace(['legacy']))
    const result = sanitizeHomeWorkspaces(input, [], ['weather'])

    expect(result).toHaveLength(maxHomeWorkspaces)
    expect(result[0]).toMatchObject({ id: defaultHomeWorkspaceId, itemIds: ['legacy', 'weather'] })
  })

  it('filters unknown launcher references when validating imported workspaces', () => {
    expect(sanitizeHomeWorkspaces([
      { id: defaultHomeWorkspaceId, name: 'Home', itemIds: ['known', 'missing'] },
    ], [], ['weather'], new Set(['known', 'weather']))).toEqual([
      { id: defaultHomeWorkspaceId, name: 'Home', itemIds: ['known', 'weather'] },
    ])
  })

  it('assigns a custom launcher to only its first imported workspace', () => {
    const result = sanitizeHomeWorkspaces([
      { id: defaultHomeWorkspaceId, name: '主页', itemIds: ['shared-link'] },
      { id: 'work', name: '工作', itemIds: ['shared-link'] },
    ], [], ['weather'])

    expect(result[0]?.itemIds).toContain('shared-link')
    expect(result[1]?.itemIds).not.toContain('shared-link')
    expect(result[1]?.itemIds).toContain('weather')
  })
})
