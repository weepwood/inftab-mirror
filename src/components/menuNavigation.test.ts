// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeMenuOnFocusout, navigateMenu } from './menuNavigation'

function createMenu() {
  document.body.innerHTML = '<div role="menu"><button role="menuitem">First</button><button role="menuitem" disabled>Disabled</button><button role="menuitem">Last</button></div><button id="outside">Outside</button>'
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!
  menu.addEventListener('keydown', navigateMenu)
  const items = [...menu.querySelectorAll<HTMLButtonElement>('button')]
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    document.activeElement?.dispatchEvent(event)
    return event
  }
  return { menu, items, press }
}

afterEach(() => { document.body.innerHTML = '' })

describe('shared action-menu keyboard navigation', () => {
  it('skips disabled actions, wraps, and supports Home/End', () => {
    const { items, press } = createMenu()
    items[0]!.focus()
    expect(press('ArrowDown').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(items[2])
    press('ArrowDown')
    expect(document.activeElement).toBe(items[0])
    press('ArrowUp')
    expect(document.activeElement).toBe(items[2])
    press('Home')
    expect(document.activeElement).toBe(items[0])
    press('End')
    expect(document.activeElement).toBe(items[2])
    expect(press('Enter').defaultPrevented).toBe(false)
    expect(press('Tab').defaultPrevented).toBe(false)
  })

  it('closes on focus leaving the menu but not on movement between its actions', () => {
    const { menu, items } = createMenu()
    const close = vi.fn()
    menu.addEventListener('focusout', (event) => closeMenuOnFocusout(event, close))
    items[0]!.focus()
    items[2]!.focus()
    expect(close).not.toHaveBeenCalled()
    document.getElementById('outside')!.focus()
    expect(close).toHaveBeenCalledOnce()
  })
})
