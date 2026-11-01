'use client'

/*
 * The builder's keyboard registry — ported from open-pencil's
 * src/app/shell/keyboard/registry.ts pattern (MIT): declarative bindings compiled into a
 * single tinykeys map attached to `window` in the capture phase, skipped while focus sits in
 * a text field, a button is mid-activation, or an open dialog/menu/popover owns the keys.
 *
 * Mount this once, at the builder page root, next to <KeyboardHelp …/>:
 *
 *   const { helpOpen, setHelpOpen } = useBuilderShortcuts({ extra: { '$mod+K': openPalette } })
 *   <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />
 *
 * The shell only reserves chrome + zoom keys; tool letters (V/H/S/T) belong to the toolbar
 * area and arrive through `extra` (or their own registry) — same mechanism, other owner.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { tinykeys, type KeybindingsMap } from 'tinykeys'

import { useBuilderChrome } from './chrome-store'
import { useProjectStore } from '@/lib/project/store'

export interface UseBuilderShortcutsOptions {
  /**
   * Extra tinykeys bindings (`{ '$mod+K': () => … }`) merged over the shell defaults.
   * On a key collision the extra binding wins.
   */
  extra?: Record<string, () => void>
}

export interface BuilderShortcutsApi {
  /** Whether the keyboard help dialog is open; render `<KeyboardHelp>` from this. */
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  toggleHelp: () => void
}

// ---- focus guards (ported from open-pencil src/app/shell/keyboard/focus.ts + registry.ts) ----

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/** Focus is inside something that types text, so its input owns the keys. */
export function isEditing(event: KeyboardEvent): boolean {
  return event.composedPath().some(isEditableTarget)
}

/** An Enter/Space that would activate a focused button belongs to the button, not the editor. */
function isButtonActivation(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (event.code !== 'Enter' && event.code !== 'Space') return false
  return event.composedPath().some((target) => target instanceof HTMLButtonElement)
}

/** An open popover, menu, or dialog; one still fading out after closing no longer counts. */
function hasOpenDismissableLayer(): boolean {
  return (
    document.querySelectorAll('[data-dismissable-layer]:not([data-state="closed"])').length > 0
  )
}

const OVERLAY_SELECTOR = '[data-picker-content], [role="dialog"], [role="listbox"], [role="menu"]'

function originatedInOverlay(event: KeyboardEvent): boolean {
  return event.composedPath().some(
    (target) => target instanceof Element && target.matches(OVERLAY_SELECTOR)
  )
}

function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  return (
    event.repeat ||
    event.isComposing ||
    isButtonActivation(event) ||
    hasOpenDismissableLayer() ||
    originatedInOverlay(event) ||
    isEditing(event)
  )
}

// ---- the hook ----

export function useBuilderShortcuts({
  extra
}: UseBuilderShortcutsOptions = {}): BuilderShortcutsApi {
  const [helpOpen, setHelpOpen] = useState(false)

  // Handlers are read through a ref at press time, so rebinding only happens when the
  // caller's key set changes — not on every render with a fresh `extra` object.
  const extraRef = useRef(extra)
  useEffect(() => {
    extraRef.current = extra
  })
  const extraKeys = Object.keys(extra ?? {})
    .sort()
    .join('|')

  useEffect(() => {
    const zoomStub = (action: string) => () => {
      // Canvas zoom commands are wired by the canvas area; the shell only reserves the keys.
      console.info(`[ExpoForge] ${action} — canvas not wired yet`)
    }

    const defaults: Record<string, () => void> = {
      // Toggle the top bar + panels (docs/03-design.md §2.3). The chrome store owns the
      // state, so WorkspaceLayout and this registry share one callback, never double-bound.
      '$mod+Backslash': () => useBuilderChrome.getState().toggleUI(),
      // Zoom commands (§3.5) until the canvas area takes them over. Shift+Digit1 (not
      // "Shift+1"): tinykeys matches physical codes, and Shift turns the 1 key into "!".
      '$mod+0': zoomStub('zoomTo100'),
      '$mod+1': zoomStub('zoomToFit'),
      'Shift+Digit1': zoomStub('zoomToSelection'),
      // Global history (task 10-F): ⌘Z / ⇧⌘Z or Ctrl+…, ⌘Y as the classic alias. The
      // guards above keep text fields, open layers, and button activations owning
      // their keys — so inputs keep their native undo while focused.
      '$mod+Z': () => useProjectStore.getState().undo(),
      '$mod+Shift+Z': () => useProjectStore.getState().redo(),
      '$mod+Y': () => useProjectStore.getState().redo(),
      // '?' is Shift+/ on most layouts; the optional modifier lets the printed key match
      // whether or not the platform needs Shift to type it.
      '[Shift]+?': () => setHelpOpen((open) => !open)
    }

    const bindings: KeybindingsMap = {}
    for (const [key, run] of Object.entries(defaults)) {
      bindings[key] = (event) => {
        if (shouldIgnoreShortcut(event)) return
        run()
        event.preventDefault()
      }
    }
    for (const key of Object.keys(extraRef.current ?? {})) {
      bindings[key] = (event) => {
        if (shouldIgnoreShortcut(event)) return
        extraRef.current?.[key]?.()
        event.preventDefault()
      }
    }

    return tinykeys(window, bindings, { capture: true, ignore: () => false })
  }, [extraKeys])

  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), [])

  return { helpOpen, setHelpOpen, toggleHelp }
}
