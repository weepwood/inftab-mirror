// Shared by launcher, workspace and Dock menus. Native form selects keep their
// own platform keyboard behavior; these helpers are only for ARIA action menus.
export function navigateMenu(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:is([role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]):not(:disabled)')]
  if (!items.length) return
  event.preventDefault()
  event.stopPropagation()
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
  items[next]?.focus()
}

export function closeMenuOnFocusout(event: FocusEvent, close: () => void) {
  if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) close()
}
