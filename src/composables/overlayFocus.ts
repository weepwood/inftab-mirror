const focusSelector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

export function getOverlayFocusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusSelector)].filter(element => {
    if (element.tabIndex < 0 && !element.matches('summary, [contenteditable="true"]')) return false
    if (element.closest('[hidden], [inert], [aria-hidden="true"], .visually-hidden')) return false
    const closed = element.closest('details:not([open])')
    if (closed && !(element.matches('summary') && element.parentElement === closed)) return false
    for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
      const style = window.getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
    }
    return true
  })
}

export function trapOverlayTab(event: KeyboardEvent, root?: HTMLElement | null) {
  if (event.key !== 'Tab' || event.defaultPrevented || !root) return
  const items = getOverlayFocusable(root)
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) { event.preventDefault(); return }
  const active = document.activeElement
  const outside = !root.contains(active)
  if (event.shiftKey && (active === first || outside)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus() }
}

export function isComposingKey(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229
}
