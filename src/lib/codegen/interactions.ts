/*
 * Interaction emission (Phase 4, P0-1) — turns a wired node hook into
 * expo-router source. Route space lives HERE (screen ids → hrefs), so the
 * node emitters stay in node space.
 *
 * Emission shape (v1, single action per hook — the degenerate case of the
 * docs/05 flow model, which promotes multi-step flows to named handlers
 * later):
 *
 *   onPress={() => { router.push('/(main)/detail'); }}
 *   onPress={() => { router.replace('/login'); }}
 *   onPress={() => { router.back(); }}
 *
 * The href carries the route-group segment (`/(main)/detail`) — the same
 * name form the layout emitters use for Stack.Screen/Tabs.Screen, and the
 * canonical expo-router href shape (group segments are allowed and
 * disambiguate when two groups hold same-named routes; our route slugs are
 * globally unique, so this is belt-and-braces).
 *
 * `useRouter` is imported once per FILE when any handler was emitted
 * (tracked on EmitContext.nav — see screens.ts), and the handler bodies are
 * inline arrows over the component-scope `router` — valid both at screen
 * level and inside list renderItem templates.
 */

import type { InteractionAction, ProjectData, Screen } from '@/lib/project/types'
import { resolveInteraction } from '@/lib/interactions/resolve'

import { RawCode } from './format'
import type { JsxAttr } from './jsx'

/** The expo-router href for a screen: `/(group)/route` or `/route`. */
export function screenHref(screen: Screen, data: Pick<ProjectData, 'groups'>): string {
  const group = screen.groupId ? data.groups.find((g) => g.id === screen.groupId) : undefined
  return group ? `/${group.dirName}/${screen.route}` : `/${screen.route}`
}

/** The call expression for one resolved action (no wrapper). */
function actionCall(action: InteractionAction, data: ProjectData): string | null {
  if (action.kind === 'back') return 'router.back()'
  const target = data.screens.find((s) => s.id === action.screenId)
  if (!target) return null // dangling — resolveInteraction already filters, belt-and-braces
  const method = action.mode === 'replace' ? 'router.replace' : 'router.push'
  return `${method}('${screenHref(target, data)}')`
}

/**
 * The `onPress={…}` attribute for a node's wired hook, or null when unwired
 * (or dangling — never dead code). Marks the context so the screen file adds
 * `useRouter` exactly when needed.
 */
export function interactionHookAttr(
  hook: string,
  node: { interactions?: Record<string, InteractionAction> },
  data: ProjectData,
  usage: { router: boolean }
): JsxAttr | null {
  const action = resolveInteraction(node.interactions?.[hook], data.screens)
  if (!action) return null
  const call = actionCall(action, data)
  if (!call) return null
  usage.router = true
  return { name: hook, value: { kind: 'raw', value: new RawCode(`() => { ${call}; }`) } }
}
