# 08 — Roadmap

> Build order follows the product owner's directive: **UI layer first**, then the
> functionality layer. Each phase ends with the app runnable and verified
> (agent-browser self-verification), never a half-broken state.

## Phase 0 — Planning (DONE)

- [x] Research: open-pencil, Expo 58, Reanimated 4, ecosystem (tasks 2-a/b/c)
- [x] Docs 00–07 written; open questions tracked per doc.

## Phase 1 — UI layer (the chrome, no behavior yet)

**Goal: the builder looks and feels right. Empty of functionality, full of fidelity.**

1. **Theme foundation** — copy `tokens.css` verbatim from open-pencil; port theme
   tailwind-variants files; dark Figma-like look everywhere.
2. **App shell** — top bar, left panel, right panel, bottom toolbar pill, splitters
   with localStorage persistence (03-design.md §2).
3. **Canvas host** — DOM infinite canvas: pan/zoom wheel math + touch (verbatim
   ports), zoom-to-fit, rulers/grid, zoom dropdown. NO artboards yet — verify the
   feel first (this is the highest-fidelity-risk part).
4. **Screen artboards** — device frames (iOS/Android), true dimensions, variant
   toggle, screen list on left panel.
5. **Layers tree + palette UI** — tree with drag-reorder; palette categories with
   search (data stubs, not the real registry yet).
6. **Right panel tabs** — Props/Style/Flow/Code shells with section layout,
   MIXED-scrub number fields.

**Verify:** agent-browser — pan/zoom feel, panel collapse, toolbar flyouts,
keyboard map, splitters persist, no console errors, responsive ≥768px.

## Phase 2 — Functionality core (the tree comes alive)

1. **Data model + store** — 07-data-model.md; command stack + undo/redo.
2. **Component registry v1** — implement the schema + the core ~15 components:
   View, Text, TextInput, Pressable, ScrollView, FlashList (+item template),
   Image, LinearGradient, BlurView, Switch, SafeAreaView, StatusBar, Tabs (JS flavor
   first), custom-component definition + instance.
3. **Live RNW renderer** — screens render real trees; variant simulation
   (Platform.OS injection); fidelity tiers honored.
4. **Drag-drop insertion** — palette → canvas with container policies; layers tree
   sync; selection + MIXED panels wired to the store.
5. **Props/Style editors** — schema-driven forms from the registry; inline style
   groups; per-variant overlays.

**Verify:** golden path — add screen → drop View → drop FlashList → drop Text into
item template → edit styles → toggle platform → both variants correct; undo/redo
across all of it.

## Phase 3 — Flows & simulation

1. Flow editor (right panel) + action palette (16 actions).
2. Mock API layer + endpoint table.
3. Simulation runtime: event hooks live, router navigation, state effects.
4. Sim mode chrome + test-run console.

**Verify:** sign-in scenario end-to-end — the product's canonical demo
(§5.2 of 02-architecture.md).

## Phase 4 — Codegen & export

1. Resolver + emitters (components, screens/router, flows, animations).
2. Animation sheet UI (entering/exiting/layout/transition/gesture) — wired to
   Reanimated-4 emission rules.
3. Project zip export via `/api/export`; Code tab live snippets.
4. Quality gates G1–G18 wired into the export path (hard failures).

**Verify:** export the demo project → `bun install && npx expo start` in a temp
dir (typecheck gate `tsc --noEmit` must pass); inspect emitted code against
06-codegen.md rules by hand once.

## Phase 5 — Persistence & polish

1. Prisma schema + `/api/projects` CRUD + autosave.
2. Custom components v1 complete (slots, events).
3. Registry expansion to full 38-component palette.
4. A11y pass (03-design.md §9), reduced-motion, error/empty states.
5. Open-questions sweep (docs 03/04/06 appendices) — resolve or explicitly defer.

**Verify:** full agent-browser pass + fresh-reload persistence check.

## Sequencing rules

- Never start phase N+1 UI before phase N verification passes.
- Every phase keeps `/` runnable (no long-lived broken states).
- Copy-verbatim rule: when porting open-pencil logic/tokens, copy from
  `/home/z/research/open-pencil` — read → paste, not read → recall → retype.
  Keep `// ported from open-pencil (MIT) <path>` attribution comments.

## Out of scope (v1) — explicit

Collab/multiplayer, web export target, vector editing, design variables/tokens,
NativeWind (banned), native code editor, app-store packaging, Firebase, push
config UI. See docs 02 §7.
