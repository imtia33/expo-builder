# 07 — Data Model

> The single source of truth. One typed tree drives palette insertion, live RNW
> rendering, panels, simulation, and codegen.

## 1. Core schema

```ts
// ── Project ─────────────────────────────────────────────────────────
interface Project {
  id: string
  name: string
  createdAt: number; updatedAt: number
  appState: AppStateEntry[]        // cross-screen state (§3)
  screens: Screen[]
  customComponents: CustomComponentDef[]  // 04-component-registry.md §6
  apiEndpoints: ApiEndpoint[]      // 05-flow-system.md §6
  settings: { defaultNavigator: 'stack' | 'tabs' | 'drawer' }
}

// ── Screens (artboards) ─────────────────────────────────────────────
interface Screen {
  id: string
  name: string                     // 'sign-in' — kebab-case, route-safe (codegen)
  route: string                    // '/sign-in'
  device: DevicePresetId           // 'iphone-17-pro' | 'pixel-10' | ...
  platform: 'ios' | 'android'      // active variant on this artboard
  x: number; y: number             // canvas position (artboards are free-floating)
  root: NodeId | null              // tree root (usually a SafeAreaView/View)
  flowsOnScreenNav?: Flow[]        // reserved
}

// ── Nodes (the component tree) ──────────────────────────────────────
interface Node {
  id: string
  type: string                     // registry id: 'view', 'text', 'flash-list', 'custom:my-card', ...
  parentId: string | null
  childIndex: number               // order within parent
  // prop values — keyed by registry PropDef id; MISSING = use flavor default
  props: Record<string, PropValue>
  // inline style object — groups per registry styleGroups; ALWAYS inline literals
  style: Record<string, StyleValue>          // { display:'flex', flexDirection:'row', padding:12, ... }
  // per-platform overlays (§4)
  variants?: Partial<Record<'ios'|'android', NodeVariantOverlay>>
  flows?: Flow[]                   // 05-flow-system.md
  animations?: NodeAnimations      // entering/exiting/layout + CSS-transition sheet
  // template slots (list item subtrees etc.)
  slots?: Record<string, NodeId>   // e.g. flash-list → { renderItem: NodeId }
  locked?: boolean; hidden?: boolean
  name?: string                    // layers panel label override
}
type PropValue  = string | number | boolean | Binding | Record<string, PropValue>
type StyleValue = string | number | Binding

interface NodeVariantOverlay {     // ONLY the diffs, applied over base
  props?: Record<string, PropValue>
  style?: Record<string, StyleValue>
  platformProps?: Record<string, PropValue>   // registry marks these (e.g. blur intensity per platform)
}
```

### NodeAnimations

```ts
interface NodeAnimations {
  entering?: AnimSpec; exiting?: AnimSpec; layout?: AnimSpec
  transition?: { properties: string[]; duration: number; easing?: string } // CSS transition sheet
  gesture?: { type: 'pan'; axis?: 'x'|'y'; affects: string[] }  // drag-driven styles
}
type AnimSpec =
  | { kind: 'preset'; preset: string; duration?: number; delay?: number } // 'FadeIn','SlideInDown',...
  | { kind: 'keyframe'; frames: Record<string, Record<string, StyleValue>> }  // {0:{...},100:{...}}
```

## 2. Resolution model (how a node renders / exports)

```
resolveNode(node, platform):
  1. registry entry + flavor → prop defaults
  2. node.props overrides
  3. node.variants[platform] overlay (props + style diffs)
  4. + slot resolution (list item template subtree, custom component template + instance props)
  5. + binding resolution context (props → state → steps → screen.params → appState)
```

The **renderer** (RNW) and the **codegen** both call `resolveNode`. One resolver,
two consumers — preview and export cannot drift (architecture doc §6).

## 3. App state entries

```ts
interface AppStateEntry {
  id: string; name: string         // 'session'
  type: 'token' | 'object' | 'boolean' | 'number' | 'string'
  initial?: PropValue
  persisted?: boolean              // → zustand persist (AsyncStorage/MMKV flavor)
}
```

## 4. Variant editing rules

- Base (unplatformed) values are the default; the overlay only stores **user-made
  diffs** for that platform. Toggling platform on the artboard switches what the
  panels EDIT (overlay when variant active) — with a "reset to base" action.
- Codegen decides emission shape from diff size: inline `Platform.select` for small
  diffs, `Platform.OS` guards for structural, split files beyond threshold
  (`06-codegen.md` §7).

## 5. Store (Zustand) & commands

```ts
interface EditorStore {
  project: Project
  nodes: Map<NodeId, Node>                 // flat map; children via parentId+childIndex
  selection: Set<NodeId>                   // MIXED handling in panels: 03-design.md §5
  viewport: { panX: number; panY: number; zoom: number }
  activeScreen: ScreenId
  sim: { on: boolean; screenStack: ScreenId[]; stackParams: Record<string, PropValue>[] }
  undo: UndoStack                          // §6
}
```

- **All mutations are commands** (open-pencil UndoManager design):
  `{ label, forward(), inverse(), coalesceKey? }` — batch per gesture
  (a drag = one undo entry; slider scrub coalesces by `coalesceKey`).
- API on the store: `run(cmd)` / `beginBatch(label)` / `commitBatch()` /
  `undo()` / `redo()`; cap 200 entries.
- Panels/canvas subscribe via selectors; RNW island re-renders per-screen from
  resolved subtrees (memoized by node version counters).

## 6. Command catalog (v1)

insertNode · moveNode (reparent+reorder, one command) · deleteNode(with subtree;
slots survive via detach) · setProps(batch) · setStyle(batch) · setVariantOverlay ·
setAnimations · addFlow · updateFlow · deleteFlow · addScreen · updateScreen ·
deleteScreen · reorderScreens · upsertCustomComponent · deleteCustomComponent ·
upsertEndpoint · setStateEntry · setProjectSettings.

## 7. Persistence & identity

- Node ids: `nanoid`-style; Screen route derived from name (slug) with uniqueness
  enforcement; renaming a screen updates its route + all `router.navigate` bindings
  (project-wide ref rewrite inside the same command).
- Autosave: debounced 800ms → `PUT /api/projects/:id` (full JSON snapshot; Prisma).
- Export input = the same JSON; export is deterministic (no timestamps inside code).

## 8. Custom components (from registry doc §6 — shape recap)

```ts
interface CustomComponentDef {
  id: `custom:${string}`
  name: string                    // PascalCase 'MyCard'
  propsContract: { name: string; type: PropValue['type']; default?: PropValue }[]
  state?: { name: string; type: string; initial?: PropValue }[]
  template: NodeId                 // subtree root; may use {{props.*}} bindings
  slots?: Record<string, NodeId>   // named insertion points for instances
  events?: string[]                // declared events instances can hook flows to
}
```

Instances are nodes with `type: 'custom:my-card'`; their `props` carry overrides;
codegen emits `components/MyCard.tsx` + usage sites.

## 9. Invariants (enforced in store, checked by gates)

1. Every node's parentId exists & no cycles; childIndex dense per parent.
2. Container policies (registry) hold: leaf components have no children;
   template slots only where the registry declares them.
3. Every async flow step has an error path (G15).
4. Screen routes unique + kebab-case; bindings resolve or are flagged in UI.
5. Style values are inline-literal-compatible (no functions; bindings resolve to
   literals or SharedValue refs only when the field is animation-bound).
