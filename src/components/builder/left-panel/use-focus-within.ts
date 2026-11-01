'use client'

/**
 * Tracks whether focus currently sits inside an element (focus-within).
 * The layers tree uses this for its two-state selection colors: while the panel
 * holds focus the selected row is `bg-panel-selected`, once focus leaves (e.g.
 * to the canvas) it dims to `bg-panel-selected-muted` (doc §4.3).
 */
import { useEffect, useState } from 'react'

export function useFocusWithin<T extends HTMLElement>(ref: React.RefObject<T | null>): boolean {
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const containsFocus = () => el.contains(document.activeElement)
    const onFocusIn = () => setFocused(true)
    const onFocusOut = (event: FocusEvent) => {
      if (!el.contains(event.relatedTarget as Node | null)) setFocused(false)
    }

    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    // If the panel mounted while already holding focus, sync off-frame — a
    // synchronous setState in the effect body would cascade renders.
    const raf = requestAnimationFrame(() => {
      if (containsFocus()) setFocused(true)
    })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [ref])

  return focused
}
