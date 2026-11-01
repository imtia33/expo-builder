'use client'
/*
 * Flyout selection memory, reworked for task 10-F's single "More" flyout
 * (open-pencil's `flyoutSelections` in ToolbarRoot, one group instead of many):
 * whenever the active tool is one of the flyout's members, that member is
 * remembered, so the menu re-opens with a check on the last-used type.
 */

import { useEffect, useRef } from 'react'

import { isComponentToolActive, type ComponentTool, type ToolbarTool } from './tool-registry'

/**
 * Returns a ref holding the last-used flyout member's registry type, updated
 * whenever the active tool belongs to this flyout. Read `.current` at render.
 */
export function useFlyoutSelections(members: readonly ComponentTool[], tool: ToolbarTool) {
  const rememberedRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    for (const member of members) {
      if (isComponentToolActive(tool, member.type)) {
        rememberedRef.current = member.type
        break
      }
    }
  }, [tool, members])

  return rememberedRef
}
