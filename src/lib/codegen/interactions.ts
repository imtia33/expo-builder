/*
 * Interaction emission (Phase 4, P0-1 + slice 2) — turns wired node hooks
 * into expo-router / React source. Route space lives HERE (screen ids →
 * hrefs), so the node emitters stay in node space.
 *
 * Emission shape (v1, single action per hook — the degenerate case of the
 * docs/05 flow model, which promotes multi-step flows to named handlers
 * later):
 *
 *   onPress={() => { router.push('/(main)/detail'); }}
 *   onPress={() => { router.replace('/login'); }}
 *   onPress={() => { router.back(); }}
 *   onPress={() => { setBusy(true); }}            // set-state literal
 *   onPress={() => { setBusy(!busy); }}           // set-state toggle
 *
 * The href carries the route-group segment (`/(main)/detail`) — the same
 * name form the layout emitters use for Stack.Screen/Tabs.Screen, and the
 * canonical expo-router href shape (group segments are allowed and
 * disambiguate when two groups hold same-named routes; our route slugs are
 * globally unique, so this is belt-and-braces).
 *
 * `useRouter` / `useState` are imported once per FILE when any handler or
 * binding needed them (tracked on the EmitContext usage flags — see
 * screens.ts), and the handler bodies are inline arrows over the
 * component-scope `router`/state variables — valid both at screen level and
 * inside list renderItem templates.
 */

import type { InteractionAction, ProjectData, ProjectNode, Screen } from '@/lib/project/types'
import { resolveInteraction } from '@/lib/interactions/resolve'
import { stateEntry, setterName } from '@/lib/state/screen-state'

import { RawCode } from './format'
import type { ApiListEmission } from './api-list'
import type { JsxAttr } from './jsx'

/** The per-file emission-usage flags node emitters mark (see EmitContext). */
export interface EmitUsage {
  /** Any router.* handler was emitted → import + create `router`. */
  router: boolean
  /** State entry NAMES referenced by handlers or {state.x} bindings →
   *  emit `const [name, setName] = useState(initial)` for the declared ones. */
  state: Set<string>
  /**
   * Phase 4 (P0-3): the screen's API-backed lists, keyed by node id —
   * populated by renderScreenFile (collectApiLists) BEFORE tree emission;
   * the list emitters read the identifiers for data/refreshing/onRefresh,
   * and the screen file appends the fetch declarations.
   */
  api: Map<string, ApiListEmission>
}

/** The expo-router href for a screen: `/(group)/route` or `/route`. */
export function screenHref(screen: Screen, data: Pick<ProjectData, 'groups'>): string {
  const group = screen.groupId ? data.groups.find((g) => g.id === screen.groupId) : undefined
  return group ? `/${group.dirName}/${screen.route}` : `/${screen.route}`
}

/** JS literal for a state value (booleans/numbers bare, strings quoted). */
function literalCode(value: boolean | string | number): string {
  return typeof value === 'string' ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(value)
}

/** The call expression for one resolved action (no wrapper). */
function actionCall(action: InteractionAction, node: ProjectNode, data: ProjectData): string | null {
  if (action.kind === 'back') return 'router.back()'
  if (action.kind === 'navigate') {
    const target = data.screens.find((s) => s.id === action.screenId)
    if (!target) return null // dangling — resolveInteraction already filters
    const method = action.mode === 'replace' ? 'router.replace' : 'router.push'
    return `${method}('${screenHref(target, data)}')`
  }
  // set-state: scoped to the node's own screen (useState scope)
  const screen = data.screens.find((s) => s.id === node.screenId)
  const entry = stateEntry(screen, action.name)
  if (!entry) return null
  if (action.value === 'toggle') return `${setterName(entry.name)}(!${entry.name})`
  return `${setterName(entry.name)}(${literalCode(action.value)})`
}

/**
 * The `onPress={…}` attribute for a node's wired hook, or null when unwired
 * (or dangling — never dead code). Marks the context usage flags so the
 * screen file adds useRouter/useState exactly when needed.
 */
export function interactionHookAttr(
  hook: string,
  node: ProjectNode,
  data: ProjectData,
  usage: EmitUsage
): JsxAttr | null {
  const action = resolveInteraction(node.interactions?.[hook], data.screens, node.screenId)
  if (!action) return null
  const call = actionCall(action, node, data)
  if (!call) return null
  if (action.kind === 'navigate' || action.kind === 'back') usage.router = true
  else usage.state.add((action as { name: string }).name)
  return { name: hook, value: { kind: 'raw', value: new RawCode(`() => { ${call}; }`) } }
}
