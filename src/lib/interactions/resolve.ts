/*
 * Interactions (Phase 4, P0-1) — the ONE resolver for wired node events.
 *
 * Every consumer of `node.interactions` goes through here so the canvas, the
 * inspector, and the code generator can never disagree about what a wired
 * hook does:
 *
 *   preview     fireInteraction()  — sim runtime (per-artboard nav history +
 *                                    screen state values)
 *   inspector   resolveInteraction() — validates the stored action for display
 *   codegen     resolveInteraction() + codegen/interactions.ts (route/hook space)
 *
 * Actions (slices 1+2): Navigate (push/replace), Back, Set state. A navigate
 * action whose target screen no longer exists — or a set-state action whose
 * entry was deleted / type-mismatches — resolves to null (unwired): previews
 * render nothing, codegen emits nothing, and the inspector shows the kind
 * with an empty target select to re-pick.
 */

import type { InteractionAction, ProjectData, Screen } from '@/lib/project/types'
import { stateEntry } from '@/lib/state/screen-state'

/**
 * Validated view of a stored action; null = unwired/dangling.
 * `nodeScreenId` scopes set-state actions to the node's own screen
 * (useState scope); navigate/back are screen-independent.
 */
export function resolveInteraction(
  action: InteractionAction | undefined,
  screens: Screen[] | readonly Screen[],
  nodeScreenId?: string
): InteractionAction | null {
  if (!action) return null
  if (action.kind === 'back') return action
  if (action.kind === 'navigate') {
    if (!action.screenId) return null
    return screens.some((s) => s.id === action.screenId) ? action : null
  }
  if (action.kind === 'set-state') {
    if (!action.name) return null
    const screen = nodeScreenId ? screens.find((s) => s.id === nodeScreenId) : undefined
    const entry = stateEntry(screen, action.name)
    if (!entry) return null
    // Type compatibility: 'toggle' only flips booleans; literals must match
    // the declared type (the inspector only offers compatible values).
    if (action.value === 'toggle') return entry.type === 'boolean' ? action : null
    if (typeof action.value === 'boolean') return entry.type === 'boolean' ? action : null
    if (typeof action.value === 'number') return entry.type === 'number' ? action : null
    if (typeof action.value === 'string') return entry.type === 'string' ? action : null
    return null
  }
  return null
}

/** The sim runtime surface the artboard hands to the preview tree. */
export interface PreviewNav {
  navigate(targetScreenId: string, mode: 'push' | 'replace'): void
  back(): void
  /** Write one state entry of ANY screen (the node's own screen's scope). */
  setState(screenId: string, name: string, value: boolean | string | number | 'toggle'): void
}

/**
 * Execute a node's wired hook against the sim runtime. Called from inside
 * RNW event handlers (sim mode only — the edit pane swallows pointer events
 * in edit mode). Dangling actions are silent no-ops.
 */
export function fireInteraction(
  hook: string,
  node: { screenId: string; interactions?: Record<string, InteractionAction> },
  data: Pick<ProjectData, 'screens'>,
  nav: PreviewNav
): void {
  const action = resolveInteraction(node.interactions?.[hook], data.screens, node.screenId)
  if (!action) return
  if (action.kind === 'back') nav.back()
  else if (action.kind === 'navigate') nav.navigate(action.screenId, action.mode)
  else nav.setState(node.screenId, action.name, action.value)
}
