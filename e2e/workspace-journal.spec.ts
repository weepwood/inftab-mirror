import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, test, type Page } from '@playwright/test'

const code = ts.transpileModule(readFileSync(new URL('../src/data/workspaceJournal.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const content = (title: string) => JSON.stringify({ format: 'inftab-workspace', version: 1, notes: [{ id: 'note', title }] })
type Operation = { kind: 'read' } | { kind: 'commit'; expected: number | null; content: string; fault?: boolean }
async function run(page: Page, operation: Operation) {
  return page.evaluate(async ({ code, operation }) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const original = IDBObjectStore.prototype.put
    try {
      const journal = await import(url) as typeof import('../src/data/workspaceJournal')
      if (operation.kind === 'read') return { state: await journal.readJournal() }
      if (operation.fault) IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === 'revisions' && key === 'head') throw new DOMException('Injected quota failure', 'QuotaExceededError')
        return original.call(this, value, key)
      }
      try { return { entry: await journal.commitJournal(operation.expected, operation.content) } }
      catch (error) { return { error: (error as Error).message } }
    } finally {
      IDBObjectStore.prototype.put = original
      URL.revokeObjectURL(url)
    }
  }, { code, operation })
}

test('journal serializes competing tabs and retains the previous revision across reload', async ({ page, context }) => {
  await page.goto('/')
  const second = await context.newPage()
  try {
    await second.goto('/')
    expect(await run(page, { kind: 'commit', expected: null, content: content('original') })).toEqual({ entry: { revision: 1, content: content('original') } })
    const attempts = await Promise.all([
      run(page, { kind: 'commit', expected: 1, content: content('first tab') }),
      run(second, { kind: 'commit', expected: 1, content: content('second tab') }),
    ])
    expect(attempts.filter(result => 'entry' in result)).toHaveLength(1)
    expect(attempts.filter(result => 'error' in result)[0]?.error).toContain('版本冲突')
    await page.reload()
    const result = await run(page, { kind: 'read' })
    expect(result.state?.head?.revision).toBe(2)
    expect(result.state?.previous).toEqual({ revision: 1, content: content('original') })
    // Explicit recovery creates a new version rather than resetting the revision.
    expect(await run(page, { kind: 'commit', expected: 2, content: result.state!.previous!.content })).toEqual({ entry: { revision: 3, content: content('original') } })
  } finally { await second.close() }
})

test('journal abort rolls back both records when the head write hits a quota error', async ({ page }) => {
  await page.goto('/')
  await run(page, { kind: 'commit', expected: null, content: content('original') })
  await run(page, { kind: 'commit', expected: 1, content: content('second') })
  const before = await run(page, { kind: 'read' })
  const rejected = await run(page, { kind: 'commit', expected: 2, content: content('must not persist'), fault: true })
  expect(rejected.error).toContain('Injected quota failure')
  await page.reload()
  expect(await run(page, { kind: 'read' })).toEqual(before)
  expect(await run(page, { kind: 'commit', expected: 2, content: content('retry') })).toEqual({ entry: { revision: 3, content: content('retry') } })
})
