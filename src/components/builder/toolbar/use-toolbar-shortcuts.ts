'use client'
/*
 * Tool letter shortcuts (task 10-F map: V/H/S/T/B/I), bound with tinykeys on
 * `window` with `capture: true`, porting the open-pencil guard logic
 * (src/app/shell/keyboard/registry.ts): a shortcut must not fire while focus is
 * in an editable field, or while an open menu/dialog owns the keys. Bindings
 * are built from `toolKeyBindings()`, so only tools whose registry entry exists
 * get a key — the set grows as the registry fills in.
 */

import { useEffect } from 'react'

import { defaultKeybindingsHandlerIgnore, tinykeys } from 'tinykeys'

import { toolKeyBindings, type ToolbarTool } from './tool-registry'

/**
 * Shared shortcut guard: tinykeys' default editable filter (inputs, textareas,
 * selects, contenteditable, repeats, IME composition) plus an open dismissable
 * layer check (menu/dialog/popper content).
 */
export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  if (defaultKeybindingsHandlerIgnore(event)) return true
  const target = event.target
  if (target instanceof Element) {
    if (target.closest('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')) {
      return true
    }
  }
  return false
}

/**
 * Binds the current tool letters to `onTool`. Attach once per toolbar; keys are
 * plain letters, so no browser default needs preventing.
 */
export function useToolbarShortcuts(onTool: (tool: ToolbarTool) => void) {
  useEffect(() => {
    const bindings: Record<string, (event: KeyboardEvent) => void> = {}
    for (const { keys, tool } of toolKeyBindings()) {
      bindings[keys] = () => onTool(tool)
    }
    return tinykeys(window, bindings, { ignore: shouldIgnoreShortcut, capture: true })
  }, [onTool])
}
