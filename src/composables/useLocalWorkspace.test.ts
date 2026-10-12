// @vitest-environment jsdom
import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceBackup } from '../data/backup'
import { defaultFocusTimerState, startFocusTimer } from '../data/focusTimer'
import { getLocalDateKey, maxCompletionDatesPerHabit } from '../data/habits'
import { useLocalWorkspace } from './useLocalWorkspace'

let scope: ReturnType<typeof effectScope> | undefined

afterEach(() => {
  vi.useRealTimers()
  scope?.stop()
  scope = undefined
  localStorage.clear()
})

describe('useLocalWorkspace default shortcut migration', () => {
  it('repairs outdated built-in icon paths without replacing user-selected icons', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'lunwenmao', title: '论文猫', url: 'https://www.lunwenmao.com/', color: '#f6f7f8', mark: '猫', icon: 'ebd5cc9193de437e76de2ca1abd2121.png' },
      { id: 'fox', title: '狐猴', url: 'https://www.google.com/', color: '#06b8df', mark: '狐', icon: '24f02a8178e623d22dc563857bf32f8.png' },
      { id: 'infinitytab', title: 'Infinitytab', url: 'https://inftab.com/', color: '#141414', mark: '∞', icon: 'bc545d7b32d3c84c3041ca092fb2689.png' },
      { id: 'jd', title: '京东收藏夹', url: 'https://www.jd.com/', color: '#e9232e', mark: 'JD', icon: 'data:image/png;base64,custom' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    expect(workspace.shortcuts.value.find((item) => item.id === 'lunwenmao')?.icon).toBe('ebd5cc9193bde437e76de2ca1abd2121.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'fox')?.icon).toBe('24f02a8178e6236d22dc563857bf32f8.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'infinitytab')?.icon).toBe('bc545d7b32d3dc84c3041ca092fb2689.png')
    expect(workspace.shortcuts.value.find((item) => item.id === 'jd')?.icon).toBe('data:image/png;base64,custom')
  })

  it('clears migration-only shortcut references when another tab clears local storage', async () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'legacy-custom-link', title: 'Legacy link', url: 'https://example.com/', color: '#abc', mark: 'L' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    expect(workspace.homeWorkspaces.value[0]?.itemIds).toContain('legacy-custom-link')

    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null, oldValue: null, newValue: null }))
    await vi.waitFor(() => expect(workspace.shortcuts.value.some((shortcut) => shortcut.id === 'legacy-custom-link')).toBe(false))

    expect(workspace.homeWorkspaces.value[0]?.itemIds).not.toContain('legacy-custom-link')
    expect(workspace.homeWorkspaces.value[0]?.id).toBe('default')
  })
})

describe('useLocalWorkspace default shortcut URL migration', () => {
  it('repairs known placeholder targets while preserving custom destinations', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'fox', title: 'Lemur', url: 'https://www.google.com/', color: '#06b8df', mark: 'F' },
      { id: 'games', title: 'Games', url: 'https://inftab.com/', color: '#f7f7f7', mark: 'G' },
      { id: 'infinitytab', title: 'Infinity', url: 'https://inftab.com/', color: '#141414', mark: 'I' },
      { id: 'jd', title: 'My store', url: 'https://shop.example/', color: '#e9232e', mark: 'J' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    expect(workspace.shortcuts.value.find((item) => item.id === 'fox')?.url).toBe('https://www.lemurbrowser.com/app/zh/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'games')?.url).toBe('https://games.inftab.com/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'infinitytab')?.url).toBe('https://www.infinitytab.com/')
    expect(workspace.shortcuts.value.find((item) => item.id === 'jd')?.url).toBe('https://shop.example/')
  })
})

describe('useLocalWorkspace launcher ordering', () => {
  it('keeps a folder member when its shortcut storage event arrives later', async () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const shortcut = { id: 'out-of-order-folder-shortcut', title: 'Out of order', url: 'https://example.com/', color: '#abc', mark: 'O' }
    const folder = { id: 'out-of-order-folder', title: 'Work', shortcutIds: [shortcut.id], color: '#369', mark: '▣' }
    const shortcutKey = 'inftab.shortcuts.v1'
    const folderKey = 'inftab.folders.v1'
    const shortcutsBefore = JSON.stringify(workspace.shortcuts.value)
    const foldersBefore = JSON.stringify(workspace.folders.value)
    const foldersAfter = JSON.stringify([...workspace.folders.value, folder])
    const shortcutsAfter = JSON.stringify([...workspace.shortcuts.value, shortcut])

    localStorage.setItem(folderKey, foldersAfter)
    window.dispatchEvent(new StorageEvent('storage', { key: folderKey, oldValue: foldersBefore, newValue: foldersAfter }))
    await vi.waitFor(() => expect(workspace.folders.value).toContainEqual(folder))

    localStorage.setItem(shortcutKey, shortcutsAfter)
    window.dispatchEvent(new StorageEvent('storage', { key: shortcutKey, oldValue: shortcutsBefore, newValue: shortcutsAfter }))
    await vi.waitFor(() => expect(workspace.shortcuts.value).toContainEqual(shortcut))
    await vi.waitFor(() => expect(workspace.folders.value).toContainEqual(folder))
  })

  it('restores launcher order when the order update arrives before its shortcut record', async () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const shortcut = { id: 'out-of-order-shortcut', title: 'Out of order', url: 'https://example.com/', color: '#abc', mark: 'O' }
    const originalOrder = [...workspace.launcherOrder.value]
    const originalShortcuts = [...workspace.shortcuts.value]
    const orderKey = 'inftab.launcher-order.v1'
    const shortcutsKey = 'inftab.shortcuts.v1'
    const orderBefore = JSON.stringify(originalOrder)
    const shortcutsBefore = JSON.stringify(originalShortcuts)
    const orderAfter = JSON.stringify([...originalOrder, shortcut.id])
    const shortcutsAfter = JSON.stringify([...originalShortcuts, shortcut])

    localStorage.setItem(orderKey, orderAfter)
    window.dispatchEvent(new StorageEvent('storage', { key: orderKey, oldValue: orderBefore, newValue: orderAfter }))
    await vi.waitFor(() => expect(workspace.launcherOrder.value).not.toContain(shortcut.id))

    localStorage.setItem(shortcutsKey, shortcutsAfter)
    window.dispatchEvent(new StorageEvent('storage', { key: shortcutsKey, oldValue: shortcutsBefore, newValue: shortcutsAfter }))
    await vi.waitFor(() => expect(workspace.shortcuts.value).toContainEqual(shortcut))
    await vi.waitFor(() => expect(workspace.launcherOrder.value).toContain(shortcut.id))
  })

  it('preserves hidden launcher positions while reordering visible items', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const originalOrder = [...workspace.launcherOrder.value]
    const hiddenIds = new Set(['weather', 'calendar'])
    const visibleIds = originalOrder.filter((id) => !hiddenIds.has(id))

    workspace.reorderLauncherItems('todos', 'settings', visibleIds)

    const nextVisibleIds = workspace.launcherOrder.value.filter((id) => !hiddenIds.has(id))
    const expectedVisibleIds = [...visibleIds]
    const todosIndex = expectedVisibleIds.indexOf('todos')
    expectedVisibleIds.splice(todosIndex, 1)
    expectedVisibleIds.splice(expectedVisibleIds.indexOf('settings'), 0, 'todos')
    expect(nextVisibleIds).toEqual(expectedVisibleIds)
    expect(workspace.launcherOrder.value.indexOf('weather')).toBe(originalOrder.indexOf('weather'))
    expect(workspace.launcherOrder.value.indexOf('calendar')).toBe(originalOrder.indexOf('calendar'))
  })
})

describe('useLocalWorkspace home workspaces', () => {
  it('creates isolated launcher groups and returns removed workspace links to the homepage', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const defaultWorkspace = workspace.homeWorkspaces.value[0]!
    const isolatedId = workspace.createHomeWorkspace('工作学习')!
    const link = { id: 'workspace-link', title: 'Private link', url: 'https://example.com/', color: '#abc', mark: 'P' }

    expect(workspace.homeWorkspaces.value.find((item) => item.id === isolatedId)?.itemIds).not.toContain(link.id)
    expect(workspace.saveShortcut(link)).toBe(true)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === isolatedId)?.itemIds).toContain(link.id)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === defaultWorkspace.id)?.itemIds).not.toContain(link.id)
    expect(workspace.removeHomeWorkspace(isolatedId)).toBe(true)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === defaultWorkspace.id)?.itemIds).toContain(link.id)
    expect(workspace.activeHomeWorkspaceId.value).toBe(defaultWorkspace.id)
  })

  it('round-trips workspace tabs through backup and migrates an older backup', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const id = workspace.createHomeWorkspace('娱乐')!
    const link = { id: 'entertainment-link', title: 'Games', url: 'https://games.example/', color: '#abc', mark: 'G' }
    workspace.saveShortcut(link)
    const backup = parseWorkspaceBackup(workspace.createBackup())

    expect(backup.activeHomeWorkspaceId).toBe(id)
    expect(backup.homeWorkspaces?.find((item) => item.id === id)?.itemIds).toContain(link.id)
    workspace.removeHomeWorkspace(id)
    workspace.restoreBackup(backup, 'replace')
    expect(workspace.activeHomeWorkspaceId.value).toBe(id)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === id)?.itemIds).toContain(link.id)

    const olderBackup = { ...backup }
    delete olderBackup.homeWorkspaces
    delete olderBackup.activeHomeWorkspaceId
    workspace.restoreBackup(parseWorkspaceBackup(olderBackup), 'replace')
    expect(workspace.homeWorkspaces.value).toHaveLength(1)
    expect(workspace.homeWorkspaces.value[0]?.itemIds).toContain(link.id)
  })

  it('reorders workspace tabs while keeping the homepage first and the active group unchanged', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const firstId = workspace.createHomeWorkspace('第一个')!
    const secondId = workspace.createHomeWorkspace('第二个')!

    expect(workspace.moveHomeWorkspace(firstId, -1)).toBe(false)
    expect(workspace.moveHomeWorkspace('default', 1)).toBe(false)
    expect(workspace.moveHomeWorkspace(firstId, 1)).toBe(true)
    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toEqual(['default', secondId, firstId])
    expect(workspace.activeHomeWorkspaceId.value).toBe(secondId)
    expect(workspace.moveHomeWorkspace(firstId, 1)).toBe(false)
  })

  it('round-trips the reordered workspace tab order through backups', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const firstId = workspace.createHomeWorkspace('第一个')!
    const activeId = workspace.createHomeWorkspace('第二个')!
    expect(workspace.moveHomeWorkspace(firstId, 1)).toBe(true)

    const backup = parseWorkspaceBackup(workspace.createBackup())
    const expectedOrder = ['default', activeId, firstId]
    expect(backup.homeWorkspaces?.map((item) => item.id)).toEqual(expectedOrder)

    workspace.restoreBackup(backup, 'replace')

    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toEqual(expectedOrder)
    expect(workspace.activeHomeWorkspaceId.value).toBe(activeId)
  })

  it('merges imported workspace groups without dropping the current active group', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const currentId = workspace.createHomeWorkspace('本机工作区')!
    const backup = workspace.createBackup()
    backup.shortcuts = [...backup.shortcuts, { id: 'remote-link', title: 'Remote', url: 'https://remote.example/', color: '#abc', mark: 'R' }]
    backup.launcherOrder = [...backup.launcherOrder, 'remote-link']
    backup.homeWorkspaces = [
      { id: 'default', name: '主页', itemIds: [] },
      { id: 'remote-space', name: '远程工作区', itemIds: ['remote-link'] },
    ]
    backup.activeHomeWorkspaceId = 'missing-workspace'

    expect(workspace.restoreBackup(backup, 'merge')).toBeUndefined()
    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toContain(currentId)
    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toContain('remote-space')
    expect(workspace.activeHomeWorkspaceId.value).toBe(currentId)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === 'remote-space')?.itemIds).toContain('remote-link')
  })

  it('keeps locally and remotely created workspaces when both tabs edit at once', async () => {
    vi.useFakeTimers()
    const storageKey = 'inftab.home-workspaces.v1'
    const initial = JSON.stringify([{ id: 'default', name: '主页', itemIds: [] }])
    localStorage.setItem(storageKey, initial)
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const localId = workspace.createHomeWorkspace('本机新建')!
    const external = JSON.stringify([
      { id: 'default', name: '主页', itemIds: [] },
      { id: 'remote-space', name: '另一标签页', itemIds: [] },
    ])
    localStorage.setItem(storageKey, external)

    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, oldValue: initial, newValue: external }))

    await vi.waitFor(() => expect(workspace.homeWorkspaces.value.map((item) => item.id)).toContain('remote-space'))
    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toContain(localId)
    await vi.advanceTimersByTimeAsync(180)
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]').map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([localId, 'remote-space']),
    )
  })

  it('merges a remote workspace creation and honors its order during a concurrent local reorder', async () => {
    vi.useFakeTimers()
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const firstId = workspace.createHomeWorkspace('第一个')!
    const activeId = workspace.createHomeWorkspace('第二个')!
    await vi.advanceTimersByTimeAsync(180)

    const storageKey = 'inftab.home-workspaces.v1'
    const previous = localStorage.getItem(storageKey)!
    expect(workspace.moveHomeWorkspace(firstId, 1)).toBe(true)

    const externalWorkspaces = JSON.parse(previous) as { id: string; name: string; itemIds: string[] }[]
    externalWorkspaces.push({ id: 'remote-space', name: '另一标签页', itemIds: [] })
    const external = JSON.stringify(externalWorkspaces)
    localStorage.setItem(storageKey, external)
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, oldValue: previous, newValue: external }))

    await vi.waitFor(() => expect(workspace.homeWorkspaces.value.map((item) => item.id)).toEqual(['default', firstId, activeId, 'remote-space']))
    expect(workspace.homeWorkspaces.value.map((item) => item.id)).toEqual(['default', firstId, activeId, 'remote-space'])
    expect(workspace.activeHomeWorkspaceId.value).toBe(activeId)
    await vi.advanceTimersByTimeAsync(180)
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]').map((item: { id: string }) => item.id))
      .toEqual(['default', firstId, activeId, 'remote-space'])
  })

  it('merges separate shortcut moves made concurrently in different workspaces', async () => {
    vi.useFakeTimers()
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const firstWorkspaceId = workspace.createHomeWorkspace('第一组')!
    const firstShortcut = { id: 'first-workspace-link', title: 'First', url: 'https://first.example/', color: '#abc', mark: 'F' }
    workspace.saveShortcut(firstShortcut, firstWorkspaceId)
    const secondWorkspaceId = workspace.createHomeWorkspace('第二组')!
    const secondShortcut = { id: 'second-workspace-link', title: 'Second', url: 'https://second.example/', color: '#abc', mark: 'S' }
    workspace.saveShortcut(secondShortcut, secondWorkspaceId)
    await vi.advanceTimersByTimeAsync(180)

    const storageKey = 'inftab.home-workspaces.v1'
    const previous = localStorage.getItem(storageKey)!
    workspace.saveShortcut(firstShortcut, 'default')
    const externalWorkspaces = JSON.parse(previous) as { id: string; itemIds: string[] }[]
    const externalDefault = externalWorkspaces.find((item) => item.id === 'default')!
    const externalSecond = externalWorkspaces.find((item) => item.id === secondWorkspaceId)!
    externalDefault.itemIds.push(secondShortcut.id)
    externalSecond.itemIds = externalSecond.itemIds.filter((id) => id !== secondShortcut.id)
    const external = JSON.stringify(externalWorkspaces)
    localStorage.setItem(storageKey, external)
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, oldValue: previous, newValue: external }))

    await vi.waitFor(() => {
      const itemIds = workspace.homeWorkspaces.value.find((item) => item.id === 'default')?.itemIds ?? []
      expect(itemIds).toEqual(expect.arrayContaining([firstShortcut.id, secondShortcut.id]))
    })
    const defaultItems = workspace.homeWorkspaces.value.find((item) => item.id === 'default')?.itemIds ?? []
    expect(defaultItems).toEqual(expect.arrayContaining([firstShortcut.id, secondShortcut.id]))
    expect(workspace.homeWorkspaces.value.find((item) => item.id === firstWorkspaceId)?.itemIds).not.toContain(firstShortcut.id)
    expect(workspace.homeWorkspaces.value.find((item) => item.id === secondWorkspaceId)?.itemIds).not.toContain(secondShortcut.id)
    await vi.advanceTimersByTimeAsync(180)
    const persistedWorkspaces = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as { id: string; itemIds: string[] }[]
    expect(persistedWorkspaces.find((item) => item.id === 'default')?.itemIds)
      .toEqual(expect.arrayContaining([firstShortcut.id, secondShortcut.id]))
  })

  it('rejects workspace overflow merges before changing any local data', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    for (let index = 1; index < 20; index += 1) workspace.createHomeWorkspace(`本机 ${index}`)
    const backup = workspace.createBackup()
    backup.homeWorkspaces = [
      { id: 'default', name: '主页', itemIds: [] },
      ...Array.from({ length: 19 }, (_, index) => ({ id: `remote-space-${index}`, name: `远程 ${index}`, itemIds: [] })),
    ]
    backup.activeHomeWorkspaceId = 'missing-workspace'
    const previousShortcutIds = workspace.shortcuts.value.map((item) => item.id)

    expect(workspace.restoreBackup(backup, 'merge')).toMatch(/工作区将超过数量上限/)
    expect(workspace.homeWorkspaces.value).toHaveLength(20)
    expect(workspace.shortcuts.value.map((item) => item.id)).toEqual(previousShortcutIds)
  })
})

describe('useLocalWorkspace bulk shortcut import', () => {
  it('adds a batch atomically to the selected workspace and preserves launcher order', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const targetWorkspace = workspace.createHomeWorkspace('导入书签')!
    const beforeOrder = [...workspace.launcherOrder.value]
    const batch = [
      { id: 'bookmark-one', title: 'One', url: 'https://one.example/', color: '#3d82f6', mark: 'O' },
      { id: 'bookmark-two', title: 'Two', url: 'https://two.example/', color: '#3d82f6', mark: 'T' },
    ]

    expect(workspace.addShortcuts(batch, targetWorkspace)).toBe(true)
    expect(workspace.shortcuts.value.slice(-2)).toEqual(batch)
    expect(workspace.launcherOrder.value).toEqual([...beforeOrder, 'bookmark-one', 'bookmark-two'])
    expect(workspace.homeWorkspaces.value.find((item) => item.id === targetWorkspace)?.itemIds).toEqual(expect.arrayContaining(['bookmark-one', 'bookmark-two']))
    expect(workspace.homeWorkspaces.value.find((item) => item.id === 'default')?.itemIds).not.toContain('bookmark-one')
  })

  it('rejects invalid, duplicate, conflicting, or over-capacity batches without partial changes', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingShortcut = workspace.shortcuts.value[0]!
    const one = { id: 'new-bookmark', title: 'One', url: 'https://one.example/', color: '#3d82f6', mark: 'O' }
    const beforeShortcuts = [...workspace.shortcuts.value]
    const beforeOrder = [...workspace.launcherOrder.value]
    const beforeMembership = workspace.homeWorkspaces.value.map((item) => ({ ...item, itemIds: [...item.itemIds] }))

    expect(workspace.addShortcuts([one, { ...one, id: 'second', url: 'javascript:alert(1)' }])).toBe(false)
    expect(workspace.addShortcuts([one, { ...one, url: 'https://different.example/' }])).toBe(false)
    expect(workspace.addShortcuts([{ ...one, id: existingShortcut.id }])).toBe(false)
    expect(workspace.shortcuts.value).toEqual(beforeShortcuts)
    expect(workspace.launcherOrder.value).toEqual(beforeOrder)
    expect(workspace.homeWorkspaces.value).toEqual(beforeMembership)
    workspace.shortcuts.value = Array.from({ length: 499 }, (_, index) => ({
      id: 'at-capacity-' + index, title: 'Shortcut ' + index, url: `https://capacity-${index}.example/`, color: '#abc', mark: 'S',
    }))
    const fullBefore = [...workspace.shortcuts.value]
    const fullOrderBefore = [...workspace.launcherOrder.value]
    expect(workspace.addShortcuts([one, { ...one, id: 'last' }])).toBe(false)
    expect(workspace.shortcuts.value).toEqual(fullBefore)
    expect(workspace.launcherOrder.value).toEqual(fullOrderBefore)
    expect(workspace.homeWorkspaces.value).toEqual(beforeMembership)
  })
})

describe('useLocalWorkspace focus timer', () => {
  it('shares timer actions with panels and includes the state in backups', async () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const now = Date.now()
    await workspace.setFocusDuration(50)
    await workspace.startFocusTimer()
    expect(workspace.focusTimer.value.endsAt).toBeGreaterThan(now)
    expect(workspace.focusTimer.value.focusMinutes).toBe(50)

    const backup = parseWorkspaceBackup(workspace.createBackup())
    expect(backup.focusTimer).toMatchObject({ focusMinutes: 50, endsAt: workspace.focusTimer.value.endsAt })

    await workspace.resetFocusTimer()
    workspace.restoreBackup(backup, 'replace')
    expect(workspace.focusTimer.value).toEqual(backup.focusTimer)
  })

  it('applies a duration change before a start action dispatched immediately after it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T04:00:00.000Z'))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    const changeDuration = workspace.setFocusDuration(50)
    const startTimer = workspace.startFocusTimer()
    await Promise.all([changeDuration, startTimer])

    expect(workspace.focusTimer.value.focusMinutes).toBe(50)
    expect(workspace.focusTimer.value.endsAt! - Date.now()).toBe(50 * 60_000)
  })

  it('defaults the timer when replacing from an older backup without timer data', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.focusTimer.value = startFocusTimer(defaultFocusTimerState, Date.now())
    const backup = workspace.createBackup()
    delete backup.focusTimer
    workspace.restoreBackup(backup, 'replace')
    expect(workspace.focusTimer.value).toEqual(defaultFocusTimerState)
  })
})

describe('useLocalWorkspace habits', () => {
  it('stores local-day check-ins and carries them through backup replacement', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T04:00:00.000Z'))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    workspace.addHabit('  阅读  ')
    const habit = workspace.habits.value[0]!
    expect(habit.title).toBe('阅读')
    workspace.toggleHabitToday(habit.id)
    expect(workspace.habits.value[0]?.completedDates).toEqual([getLocalDateKey()])

    const backup = parseWorkspaceBackup(workspace.createBackup())
    expect(backup.habits).toEqual(workspace.habits.value)
    workspace.removeHabit(habit.id)
    expect(workspace.habits.value).toEqual([])
    expect(workspace.restoreBackup(backup, 'replace')).toBeUndefined()
    expect(workspace.habits.value).toEqual(backup.habits)
  })

  it('keeps habit history bounded while retaining the newest check-in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'))
    const completedDates = Array.from({ length: maxCompletionDatesPerHabit }, (_, index) => {
      const date = new Date(Date.UTC(2016, 0, 1 + index))
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    })
    localStorage.setItem('inftab.habits.v1', JSON.stringify([{ id: 'read', title: '阅读', completedDates }]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    workspace.toggleHabitToday('read')

    const updated = workspace.habits.value[0]!
    expect(updated.completedDates).toHaveLength(maxCompletionDatesPerHabit)
    expect(updated.completedDates).toContain(getLocalDateKey())
    expect(updated.completedDates[0]).not.toBe(completedDates[0])
  })
})

describe('useLocalWorkspace shortcut id validation', () => {
  it('does not let a custom shortcut replace a built-in launcher entry', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingShortcuts = [...workspace.shortcuts.value]

    expect(workspace.saveShortcut({ id: 'weather', title: 'Replacement', url: 'https://example.com/', color: '#abc', mark: 'R' })).toBe(false)
    expect(workspace.shortcuts.value).toEqual(existingShortcuts)
  })
})

describe('useLocalWorkspace dock references', () => {
  it('removes deleted shortcuts and folders from the persistent dock', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const shortcut = { id: 'dock-shortcut', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' }
    const folder = { id: 'dock-folder', title: 'Folder', shortcutIds: [], color: '#abc', mark: 'F' }

    expect(workspace.saveShortcut(shortcut)).toBe(true)
    expect(workspace.saveFolder(folder)).toBe(true)
    workspace.updatePreferences({ dockItemIds: [shortcut.id, folder.id] })
    workspace.removeShortcut(shortcut.id)
    expect(workspace.preferences.value.dockItemIds).toEqual([folder.id])
    workspace.removeFolder(folder.id)
    expect(workspace.preferences.value.dockItemIds).toEqual([])
  })

  it('cleans Dock references when shortcuts disappear in another tab', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'external-link', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' },
    ]))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: ['external-link'] }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.shortcuts.v1',
      oldValue: localStorage.getItem('inftab.shortcuts.v1'),
      newValue: '[]',
    }))

    expect(workspace.shortcuts.value).toEqual([])
    expect(workspace.preferences.value.dockItemIds).toEqual([])
  })

  it('repairs folder membership and keeps backups valid when shortcuts disappear in another tab', () => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'external-link', title: 'Link', url: 'https://example.com/', color: '#abc', mark: 'L' },
    ]))
    localStorage.setItem('inftab.folders.v1', JSON.stringify([
      { id: 'external-folder', title: 'Folder', shortcutIds: ['external-link'], color: '#abc', mark: 'F' },
    ]))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.shortcuts.v1',
      oldValue: localStorage.getItem('inftab.shortcuts.v1'),
      newValue: '[]',
    }))

    expect(workspace.shortcuts.value).toEqual([])
    expect(workspace.folders.value[0]?.shortcutIds).toEqual([])
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })
})

describe('useLocalWorkspace custom search engines', () => {
  it('moves selection to a surviving note when another tab deletes the active note', () => {
    const notes = [
      { id: 'note-first', title: 'First', body: '', updatedAt: 1 },
      { id: 'note-active', title: 'Active', body: '', updatedAt: 2 },
    ]
    localStorage.setItem('inftab.notes.v1', JSON.stringify(notes))
    localStorage.setItem('inftab.active-note.v1', JSON.stringify('note-active'))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.notes.v1',
      oldValue: JSON.stringify(notes),
      newValue: JSON.stringify([notes[0]]),
    }))

    expect(workspace.notes.value).toEqual([notes[0]])
    expect(workspace.activeNoteId.value).toBe('note-first')
    expect(workspace.createBackup().activeNoteId).toBe('note-first')
  })

  it('adds and selects a validated engine, then falls back when it is removed', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    workspace.addCustomSearchEngine('Wiki', 'https://example.com/?q={query}')
    expect(workspace.customSearchEngines.value).toHaveLength(1)
    const engine = workspace.customSearchEngines.value[0]!
    expect(workspace.preferences.value.engine).toBe('custom:' + engine.id)
    expect(engine.template).toBe('https://example.com/?q={query}')

    workspace.removeCustomSearchEngine(engine.id)
    expect(workspace.customSearchEngines.value).toEqual([])
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('includes custom engines in backups and merges or replaces them with preferences', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.addCustomSearchEngine('Existing', 'https://existing.example/?q={query}')
    const existing = workspace.customSearchEngines.value[0]!
    const backup = workspace.createBackup()
    backup.customSearchEngines = [
      { id: 'imported', name: 'Imported', template: 'https://imported.example/?q={query}' },
    ]
    backup.preferences.engine = 'custom:imported'

    workspace.restoreBackup(backup, 'merge')
    expect(workspace.customSearchEngines.value.map((engine) => engine.id)).toEqual([existing.id, 'imported'])
    expect(workspace.preferences.value.engine).toBe('custom:imported')

    workspace.restoreBackup(backup, 'replace')
    expect(workspace.customSearchEngines.value.map((engine) => engine.id)).toEqual(['imported'])
    expect(workspace.preferences.value.engine).toBe('custom:imported')
  })

  it.each(['merge', 'replace'] as const)('preserves imported Dock entries and folder membership during %s restore', (mode) => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const backup = workspace.createBackup()
    backup.shortcuts = [{ id: 'restored-shortcut', title: 'Restored', url: 'https://restored.example/', color: '#abc', mark: 'R' }]
    backup.folders = [{ id: 'restored-folder', title: 'Restored folder', shortcutIds: ['restored-shortcut'], color: '#369', mark: 'F' }]
    backup.launcherOrder = ['restored-folder', 'restored-shortcut']
    backup.preferences.dockItemIds = ['restored-shortcut', 'restored-folder']

    expect(workspace.restoreBackup(backup, mode)).toBeUndefined()

    expect(workspace.preferences.value.dockItemIds).toEqual(['restored-shortcut', 'restored-folder'])
    expect(workspace.folders.value[0]?.shortcutIds).toEqual(['restored-shortcut'])
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })

  it('repairs a stored preference that points to a missing custom engine', () => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ engine: 'custom:missing' }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('repairs the selected engine when another tab removes it', () => {
    const engine = { id: 'wiki', name: 'Wiki', template: 'https://example.com/?q={query}' }
    localStorage.setItem('inftab.custom-search-engines.v1', JSON.stringify([engine]))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ engine: 'custom:wiki' }))
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'inftab.custom-search-engines.v1',
      oldValue: localStorage.getItem('inftab.custom-search-engines.v1'),
      newValue: '[]',
    }))

    expect(workspace.customSearchEngines.value).toEqual([])
    expect(workspace.preferences.value.engine).toBe('baidu')
  })

  it('keeps todo and note mutations valid for a version-one backup', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.addTodo('   ')
    expect(workspace.todos.value).toEqual([])
    workspace.addTodo('  Review release  ')
    const todoId = workspace.todos.value[0]!.id
    workspace.updateTodo(todoId, ' x '.repeat(200))
    expect(workspace.todos.value[0]?.title).toHaveLength(500)

    workspace.todos.value = Array.from({ length: 500 }, (_, index) => ({ id: 'todo-' + index, title: 'Task ' + index, done: false }))
    workspace.addTodo('Overflow')
    expect(workspace.todos.value).toHaveLength(500)

    workspace.notes.value = Array.from({ length: 500 }, (_, index) => ({ id: 'note-' + index, title: 'Note ' + index, body: '', updatedAt: 1 }))
    workspace.activeNoteId.value = 'note-0'
    workspace.addNote()
    expect(workspace.notes.value).toHaveLength(500)
    workspace.updateNote('note-0', 'title', 'T'.repeat(600))
    workspace.updateNote('note-0', 'body', 'B'.repeat(500_001))
    expect(workspace.notes.value[0]?.title).toHaveLength(500)
    expect(workspace.notes.value[0]?.body).toHaveLength(500_000)
    expect(() => parseWorkspaceBackup(workspace.createBackup())).not.toThrow()
  })

  it('enforces shortcut and folder backup limits at the workspace boundary', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.shortcuts.value = Array.from({ length: 500 }, (_, index) => ({
      id: `shortcut-${index}`, title: `Shortcut ${index}`, url: `https://example-${index}.com/`, color: '#abc', mark: 'S',
    }))
    expect(workspace.saveShortcut({ id: 'shortcut-overflow', title: 'Overflow', url: 'https://overflow.example/', color: '#abc', mark: 'O' })).toBe(false)
    expect(workspace.shortcuts.value).toHaveLength(500)

    workspace.folders.value = Array.from({ length: 500 }, (_, index) => ({
      id: `folder-${index}`, title: `Folder ${index}`, shortcutIds: [], color: '#abc', mark: 'F',
    }))
    expect(workspace.saveFolder({ id: 'folder-overflow', title: 'Overflow', shortcutIds: [], color: '#abc', mark: 'O' })).toBe(false)
    expect(workspace.folders.value).toHaveLength(500)

    const originalFolder = workspace.folders.value[0]!
    expect(workspace.saveFolder({ ...originalFolder, color: 'invalid' })).toBe(false)
    expect(workspace.folders.value[0]).toEqual(originalFolder)
  })

  it('rejects a merge that exceeds a section limit without applying partial changes', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    workspace.shortcuts.value = Array.from({ length: 500 }, (_, index) => ({
      id: `shortcut-${index}`, title: `Shortcut ${index}`, url: `https://example-${index}.com/`, color: '#abc', mark: 'S',
    }))
    workspace.habits.value = Array.from({ length: 100 }, (_, index) => ({
      id: `habit-${index}`, title: `Habit ${index}`, completedDates: [],
    }))
    const incoming = workspace.createBackup()
    incoming.shortcuts = [{ id: 'imported', title: 'Imported', url: 'https://imported.example/', color: '#abc', mark: 'I' }]
    incoming.habits = [{ id: 'imported-habit', title: 'Imported habit', completedDates: [] }]
    incoming.preferences.showClock = !workspace.preferences.value.showClock

    const result = workspace.restoreBackup(incoming, 'merge')

    expect(result).toContain('快捷入口、习惯将超过数量上限')
    expect(workspace.shortcuts.value).toHaveLength(500)
    expect(workspace.habits.value).toHaveLength(100)
    expect(workspace.preferences.value.showClock).not.toBe(incoming.preferences.showClock)
  })

  it('rejects cross-type launcher ID conflicts without dropping existing folders', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingFolder = { id: 'shared-launcher-id', title: 'Existing folder', shortcutIds: [], color: '#abc', mark: 'F' }
    expect(workspace.saveFolder(existingFolder)).toBe(true)

    const incoming = workspace.createBackup()
    incoming.folders = []
    incoming.shortcuts = [{ id: existingFolder.id, title: 'Imported shortcut', url: 'https://imported.example/', color: '#abc', mark: 'I' }]
    incoming.launcherOrder = [existingFolder.id]
    const validatedIncoming = parseWorkspaceBackup(incoming)

    const result = workspace.restoreBackup(validatedIncoming, 'merge')

    expect(result).toContain('相同的入口 ID')
    expect(workspace.folders.value).toEqual([existingFolder])
    expect(workspace.shortcuts.value.some((item) => item.id === existingFolder.id)).toBe(false)
  })

  it('rejects incoming folders that reuse existing shortcut IDs', () => {
    scope = effectScope()
    const workspace = scope.run(() => useLocalWorkspace())!
    const existingShortcut = { id: 'shared-launcher-id', title: 'Existing shortcut', url: 'https://existing.example/', color: '#abc', mark: 'S' }
    expect(workspace.saveShortcut(existingShortcut)).toBe(true)

    const incoming = workspace.createBackup()
    incoming.shortcuts = incoming.shortcuts.filter((item) => item.id !== existingShortcut.id)
    incoming.folders = [{ id: existingShortcut.id, title: 'Imported folder', shortcutIds: [], color: '#369', mark: 'F' }]
    incoming.launcherOrder = [existingShortcut.id]
    const validatedIncoming = parseWorkspaceBackup(incoming)

    const result = workspace.restoreBackup(validatedIncoming, 'merge')

    expect(result).toContain('相同的入口 ID')
    expect(workspace.shortcuts.value).toContainEqual(existingShortcut)
    expect(workspace.folders.value.some((item) => item.id === existingShortcut.id)).toBe(false)
  })
})
