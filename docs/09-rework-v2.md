# 09 — Rework v2: Screen Hierarchy, Navigation Architecture & Figma-like Canvas

> Record of the full editor rework (2026-11-01). Covers what changed vs docs 02/07,
> the locked contracts between modules, verified facts, and what's next.
> The rework ran as 6 parallel workstreams on disjoint directories over a shared
> foundation; this file is the integration record.

## 1. What changed (product level)

| Area | Before (Phase 1) | After (v2) |
|---|---|---|
| Left panel | flat screens list + layers + palette | one hierarchy tree (groups → screens → inline layers), group-creation dialog, no palette |
| Screen management | flat list, single store | groups with Stack/Tabs/None navigation, DnD across groups, per-group nav config |
| Canvas | artboards, rulers, zoom UI, stub content | Figma-like placement mode, node selection/move/resize with snap guides, live RNW content, sim mode, non-overlap placement |
| Navigation | none | visual nav config (tab bar, stack header) → real `app/` Expo Router files |
| Codegen | spec only | working generator (verified against expo-router@58.0.29 source) |
| Top bar | name/help only | prominent iOS/Android + Simulate toggles, undo/redo |
| Bottom toolbar | tools + platform + sim + zoom | tools only (registry-driven), Iconify (Phosphor) icons |
| Inspector | static stubs | fully contextual (node/screen/group/project), live Code tab |

## 2. Architecture (what supersedes docs 02/07)

### 2.1 Data model — `src/lib/project/types.ts` (single source of truth)
- `ProjectData { groups, screens, nodes }` — flat node map (`parentId` + `order`), screens with `groupId`, groups with `NavConfig`.
- One store (`store.ts`): all mutations through a snapshot-undo funnel (`commit`), gesture batching (`beginGesture/endGesture` → one undo entry per drag), localStorage persistence (`expoforge:project:v2`), deterministic non-overlap placement (`findFreePosition`), sim state (per-artboard navigation history).
- Nodes are absolute-positioned on placement (`style.position:'absolute' + left/top/width/height`); the inspector's Layout section offers an Absolute ⇄ Flow toggle. Both are real RN layout — codegen emits whatever the style object holds.

### 2.2 Navigation ↔ Expo Router mapping (verified against expo-router@58.0.29 today)
- Route groups `(dirName)` hide URL segments; screen routes are globally unique kebab.
- **Navigator child order follows the order of `<Tabs.Screen>`/`<Stack.Screen>` JSX children in `_layout.tsx`** (`getSortedChildren`: declared children match first, in order; unlisted routes append). The builder's tree order therefore maps 1:1 to real tab order.
- **`export const unstable_settings = { anchor: '<route>' }`** sets the initial route (anchor is the current API; `initialRouteName` is its deprecated alias).
- `'none'` groups emit no `_layout.tsx` (flat routes under the parent); root `_layout.tsx` references their screens as `(dir)/route` segments.
- Tab icons: Iconify `ph:*` → `phosphor-react-native` (the real package; `@phosphor-icons/react-native` does not exist on npm) via `iconifyToPhosphorReact`.

### 2.3 Module map (post-rework)
```
src/lib/project/        types, store (foundation)
src/lib/codegen/        generateProjectFiles → app/ tree (real, runnable code)
src/expoforge/registry/ pure-data component catalog (11 entries) + LOCKED ids
src/expoforge/preview/  RNW live renderer + TabBar/StackHeader DOM previews
src/components/builder/
  left-panel/           hierarchy tree (7-C)
  dialogs/              group creation dialog (7-C)
  screens/ + canvas/    canvas engine: placement, manipulation, sim (8-D)
  right-panel/          contextual inspector + Code tab (9-E)
  shell/ + toolbar/     top bar, tool pill, shortcuts (10-F)
  icons/                Iconify (Phosphor) offline — `@iconify-json/ph` addCollection
```

### 2.4 Locked cross-module contracts
- Store API (`useProjectStore` actions + `revision` bump); `InsertTool` type for placement.
- Registry entries: `id`, `icon` (ph:*), `insert` defaults, `children` policy, `props` (PropField), `styleSections`, `codegen.import/component/emitter`.
- RNW nodes carry `testID={node.id}` → DOM `data-testid` (verified in react-native-web createDOMProps) — the canvas hit-testing/measure contract.
- Tab bar & stack header are DOM previews (not RNW) rendered by the artboard; codegen emits the equivalent real `<Tabs screenOptions>` / `<Stack screenOptions>`.
- Safe area: per-screen `safeArea.{top,bottom}`; preview applies device-frame insets, codegen emits `SafeAreaView` from `react-native-safe-area-context` (never RN core).

## 3. Verified end-to-end (live browser pass)
Placement geometry exact to the click; drag/resize = 1 undo entry each (undo/redo verified); nested placement (text inside view, clamp at 0); tab bar edits (icon picker, icon size) propagate to store → preview → generated code (`size={30}`, `<Gear …/>`); rename screen regenerates route everywhere incl. codegen (`sign-in.tsx`); platform toggle + device switch resize artboard; sim mode: per-artboard tab navigation, interactive RNW (inputs/scroll/press), stack header back; reload persistence; tsc/eslint clean; zero console/page errors; pixel-analysis PASS.

## 4. Known gaps / next steps (deliberate, not broken)
- Flow system (docs 05) not in this rework — buttons have no wired behavior yet; the registry/flowHooks and codegen handler shapes are prepared for it.
- Project zip export (`/api/export` + package.json template per docs 06 §1) — Code tab generates the app/ tree today; full template + gates G1–G18 is the next phase.
- Multi-select/marquee; per-platform style overlays (variant editing); animation sheet; scrollview contentContainerStyle in inspector.
- `moveScreen` between groups keeps the artboard's canvas position (no auto re-pack) — user-owned layout.
- Sim back button is safe no-op until flows can push screens (by design).
- Phosphor icon collection bundles offline (~4.5MB JSON); consider a curated subset if first-load size matters.
