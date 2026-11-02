/*
 * Interactions (Phase 4, P0-1) — the ONE resolver for wired node events.
 *
 * Every consumer of `node.interactions` goes through here so the canvas, the
 * inspector, and the code generator can never disagree about what a wired
 * hook does:
 *
 *   preview     fireInteraction()  — sim runtime (per-artboard nav history)
 *   inspector   resolveInteraction() — validates the stored action for display
 *   codegen     resolveInteraction() + codegen/interactions.ts (route space)
 *
 * v1 actions: Navigate (push/replace) and Back — the two actions the builder
 * can already execute end-to-end. A navigate action whose target screen no
 * longer exists resolves to null (unwired): previews render nothing, codegen
 * emits nothing, and the inspector shows an empty screen select to re-pick.
 */

import type { InteractionAction, ProjectData, Screen } from '@/lib/project/types'

/** Validated view of a stored action; null = unwired/dangling. */
export function resolveInteraction(
  action: InteractionAction | undefined,
  screens: Screen[] | readonly Screen[]
): InteractionAction | null {
  if (!action) return null
  if (action.kind === 'back') return action
  if (action.kind === 'navigate') {
    if (!action.screenId) return null
    return screens.some((s) => s.id === action.screenId) ? action : null
  }
  return null
}

/** The sim runtime surface the artboard hands to the preview tree. */
export interface PreviewNav {
  navigate(targetScreenId: string, mode: 'push' | 'replace'): void
  back(): void
}

/**
 * Execute a node's wired hook against the sim runtime. Called from inside
 * RNW event handlers (sim mode only — the edit pane swallows pointer events
 * in edit mode). Dangling actions are silent no-ops.
 */
export function fireInteraction(
  hook: string,
  node: { interactions?: Record<string, InteractionAction> },
  data: Pick<ProjectData, 'screens'>,
  nav: PreviewNav
): void {
  const action = resolveInteraction(node.interactions?.[hook], data.screens)
  if (!action) return
  if (action.kind === 'back') nav.back()
  else nav.navigate(action.screenId, action.mode)
}
