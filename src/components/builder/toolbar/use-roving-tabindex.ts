'use client'
/*
 * Roving tabindex for the toolbar pill (doc §9.1/§9.2): exactly one button is in
 * the tab order; ←/→ walk the pill (with wrap), Home/End jump to the ends.
 * Disabled buttons are skipped. The DOM order is the tab order (§9.1: the pill
 * is last in the page's tab sequence).
 */

import { useCallback, useEffect, useRef } from 'react'

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

/** Focusable pill children, in DOM order. */
function rovingItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'))
}

export function useRovingTabindex(ref: React.RefObject<HTMLElement | null>) {
  const indexRef = useRef(0)

  /** Re-apply tabIndex so only the current button is tabbable. */
  const refresh = useCallback(() => {
    const root = ref.current
    if (!root) return
    const items = rovingItems(root)
    if (items.length === 0) return
    indexRef.current = Math.min(indexRef.current, items.length - 1)
    items.forEach((el, i) => {
      el.tabIndex = i === indexRef.current ? 0 : -1
    })
  }, [ref])

  // After every render: the button set changes with props (sim chip, disabled
  // states), so keep the roving state in sync each commit.
  useEffect(() => {
    refresh()
  })

  // Track focus movement inside the pill.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !root.contains(target)) return
      const items = rovingItems(root)
      const i = items.indexOf(target)
      if (i === -1) return
      indexRef.current = i
      items.forEach((el, k) => {
        el.tabIndex = k === i ? 0 : -1
      })
    }
    root.addEventListener('focusin', onFocusIn)
    return () => root.removeEventListener('focusin', onFocusIn)
  }, [ref])

  // Arrow navigation. Menus portaled outside the pill never reach this handler,
  // so open flyouts/zoom menus keep their own arrow-key behavior.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !NAV_KEYS.has(event.key)) return
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !root.contains(active)) return
      const items = rovingItems(root)
      if (items.length === 0) return
      const current = Math.max(0, items.indexOf(active))
      let next: number
      switch (event.key) {
        case 'ArrowRight':
          next = (current + 1) % items.length
          break
        case 'ArrowLeft':
          next = (current - 1 + items.length) % items.length
          break
        case 'Home':
          next = 0
          break
        default:
          next = items.length - 1
      }
      event.preventDefault()
      if (next === current) return
      indexRef.current = next
      items.forEach((el, k) => {
        el.tabIndex = k === next ? 0 : -1
      })
      items[next].focus()
    }
    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [ref])

  return refresh
}
