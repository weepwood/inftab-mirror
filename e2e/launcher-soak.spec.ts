import { test, expect } from '@playwright/test'

// Opt-in: no extra minutes in ordinary PR/full release test invocations.
// The risk-tier workflow enables 120 seconds, manual runs can use 600 seconds.
test('launcher sustained operation reports DOM retention and idle recovery', async ({ page, context }, testInfo) => {
  const seconds = Number(process.env.INFTAB_SOAK_SECONDS || 0)
  test.skip(![120, 600].includes(seconds), 'Dedicated soak workflow only')
  test.setTimeout((seconds + 100) * 1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ columns: 2, rows: 1, pageTransitionEffect: 'slide', dockItemIds: ['weather','notes','calendar'], dockMagnification: true })))
  await page.goto('/')
  const grid = page.locator('.shortcut-grid-viewport'), dock = page.locator('.home-dock')
  await expect(grid).toBeVisible()
  await expect(dock).toBeVisible()
  const cdp = await context.newCDPSession(page)
  let layers = 0, peakLayers = 0
  cdp.on('LayerTree.layerTreeDidChange', event => {
    if (event.layers) { layers = event.layers.length; peakLayers = Math.max(peakLayers, layers) }
  })
  const pulse = () => grid.evaluate(async el => {
    const frames: number[] = [], tasks: number[] = []
    const observer = PerformanceObserver.supportedEntryTypes.includes('longtask') ? new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => e.duration))) : undefined
    observer?.observe({ type: 'longtask' })
    let previous = performance.now()
    // Pure input loop: no layout reads until the settled checkpoint.
    for (let i = 0; i < 120; i++) await new Promise<void>(resolve => requestAnimationFrame(now => {
      frames.push(now - previous); previous = now
      el.dispatchEvent(new WheelEvent('wheel', { deltaX: i % 8 < 4 ? 100 : -100, bubbles: true, cancelable: true }))
      resolve()
    }))
    tasks.push(...(observer?.takeRecords().map(e => e.duration) ?? [])); observer?.disconnect()
    const sorted = [...frames].sort((a,b) => a-b)
    return { frames: frames.length, p95: sorted[Math.floor((sorted.length-1)*.95)], max: sorted.at(-1), slow: frames.filter(ms => ms > 25).length, tasks }
  })
  async function checkpoint() {
    await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toHaveCount(1)
    await expect.poll(() => page.locator('.shortcut-page[aria-hidden="false"]').evaluate(el => Math.abs(el.getBoundingClientRect().left - el.closest('.shortcut-grid-viewport')!.getBoundingClientRect().left))).toBeLessThan(2)
    await expect.poll(() => dock.locator('.home-dock-entry').evaluateAll(els => els.every(el => !(el as HTMLElement).style.transform))).toBe(true)
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = await cdp.send('Runtime.getHeapUsage')
    const counters = await cdp.send('Memory.getDOMCounters')
    return { heap: heap.usedSize, ...counters, layers, slots: await page.locator('.shortcut-page').count() }
  }
  try {
    await cdp.send('LayerTree.enable')
    await cdp.send('Performance.enable')
    await pulse()
    const baseline = await checkpoint()
    const before = await cdp.send('Performance.getMetrics')
    const samples = []
    const start = Date.now()
    while (Date.now() - start < seconds * 1000) {
      const input = await pulse()
      const item = dock.locator('[data-dock-item-id="weather"]')
      await item.focus()
      await page.keyboard.press('Shift+ArrowRight')
      await expect(item).toBeFocused()
      await page.keyboard.press('Shift+ArrowLeft')
      await expect(item).toBeFocused()
      const idle = await checkpoint()
      expect(idle.slots).toBeLessThanOrEqual(4)
      samples.push({ elapsedMs: Date.now() - start, input, ...idle })
    }
    const after = await cdp.send('Performance.getMetrics')
    // Experimental method may not exist on the bundled Chromium. Record
    // unsupported explicitly, rather than reporting a false zero.
    let detached: number | null = null
    try {
      const report = await cdp.send('DOM.getDetachedDomNodes')
      detached = report.detachedNodes.length
    } catch { /* optional diagnostic */ }
    const result = { seconds, baseline, samples, peakLayers, detached, cpu: Object.fromEntries(after.metrics.filter(m => /^(TaskDuration|ScriptDuration|LayoutDuration|RecalcStyleDuration)$/.test(m.name)).map(m => [m.name, m.value - (before.metrics.find(x => x.name === m.name)?.value ?? 0)])) }
    await testInfo.attach('launcher-soak', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
    console.log('Launcher soak diagnostics:', JSON.stringify(result))
    expect(samples.length).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') || '{}').dockItemIds)).toEqual(['weather','notes','calendar'])
  } finally {
    await cdp.send('Performance.disable')
    await cdp.send('LayerTree.disable')
    await cdp.detach()
  }
})
