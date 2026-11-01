# 12 — Framer-Like Builder: Consolidated Research, Architecture Assessment & Implementation Plan

> Record of the "complete RN application builder" rework kickoff (2026-11-02).
> Inputs: 7 parallel research agents (A Framer, B Layout engines, C Interaction/logic,
> D Design tokens, E Data/API, F Animation, G Expo SDK 58 compatibility) + a full audit
> of the existing codebase. This document is the consolidated implementation plan the
> spec required before coding. Milestone M1 (P0 correctness) work began immediately
> after this document — see §8.

---

## 1. Architecture assessment (what exists, what's broken)

### 1.1 Sound foundations (keep, extend — do not rewrite)

| Foundation | Verdict |
|---|---|
| Single document model (`ProjectData { groups, screens, nodes }` flat node map) | **Correct.** Matches the spec's "project document is the source of truth". Canvas, inspector, preview, codegen all consume it. |
| DOM infinite canvas + live react-native-web trees per artboard | **Correct** (Framer renders real React everywhere; RNW keeps preview≈codegen fidelity). Resolution-independence is handled by CSS transform + screen-space chrome overlay (v3) — text/vector stay sharp at 25–400%. |
| Registry-driven components (pure data: props schema, implementations, animation capability, codegen mapping) | **Correct** — exactly the "no hardcoded per-component panels" rule. Needs growth, not redesign. |
| Real Expo Router codegen verified against expo-router@58.0.29 | **Correct.** |
| `rawCodeProps` / `codeOverride` preservation of unrepresentable code | **Correct** direction (never silently overwrite). The parse-back side (`applyCodePatches`) exists but has **no UI** — Code tab is read-only. |
| Global single platform toggle (`ui.platform`) | **Correct** — already one editor-wide value. |

### 1.2 Confirmed defects (P0)

1. **Undo/redo is unreliable — two root causes:**
   - **Gesture leaks.** `commit()` coalesces every mutation while `gestureDepth > 0` and
     `gesturePushed` is true. Multiple call sites can leak a gesture open
     (a second `pointerdown` during an active drag re-enters `beginGesture` and the
     first drag's `endGesture` is swallowed; a missed `pointerup` after
     `setPointerCapture` loss; alt-tab/context-menu). One leaked gesture ⇒ **every
     subsequent commit is swallowed into one history entry** ⇒ Ctrl+Z jumps back
     across many actions (e.g. "undo deleted the whole screen") — exactly the
     reported bug.
   - **In-place mutations corrupt snapshots.** `reindex()` mutates `order` on
     objects referenced by the *previous* snapshot (`deleteNode`, `moveNode`,
     `deleteScreen`, `moveGroup`, `reindexAndFilter`). Undo restores the old `data`
     graph but the node objects inside were mutated — restored states are wrong.
   - Secondary: full `JSON.parse(JSON.stringify())` deep clone per commit (jank on
     big projects; the spec forbids crude snapshots without memory considerations).
2. **No inline text editing.** Double-click drills into the parent; text is editable
   only via the inspector Props field. Spec §4 requires canvas editing with caret,
   selection, Escape cancel, blur commit.
3. **Snap guides render in the wrong coordinate space.** `collectSnapTargets`
   measures targets in **coordinate-parent-local** dp; the overlay interprets guide
   positions as **artboard-local** (`(screen.x + pos) * zoom + pan`). Inside a nested
   container (or with safe-area offsets at root), guides shift by the parent's
   offset — "guides appear outside the parent container".
4. **Simulator shows all screens simultaneously** (`sim.on` makes every artboard
   interactive). Spec §18 requires ONE app instance in an independent runtime.
5. **All placed nodes are absolute-positioned.** No flow-first layout model
   (spec §8: flexbox by default, absolute as opt-in).

### 1.3 Missing systems (P1–P3, per research)

Theme/tokens (§9), typography + custom fonts (§11), complete styling (gradients,
per-corner radius, shadows) (§10), interaction flows (§6), variables/state,
data binding + API panel (§13), reusable components + variants (§14), animation
editor beyond entering/exiting (§15), device-preview responsiveness (§12),
accessibility (§19), zip export (spec §23 final).

---

## 2. Research consolidation (what the 7 agents established)

### A — Framer architecture (applicable parts)

- **Replica/override inheritance** (`isReplica` + per-attribute overrides): one
  mechanism powers variants, breakpoints, AND instance overrides. → Our components
  system (M4) adopts: component = primary tree; instance/variant = per-attribute
  override records referencing the primary.
- **Component variables vs variants**: variants = discrete animated states;
  variables = per-instance content controls (text/color/boolean). Both needed.
- **Per-axis sizing contract** (`auto | fixed | any(+prefer)`, intrinsic insert size)
  per registry entry — feeds the layout engine's hug/fill/fixed.
- **Stack-first, absolute-exception** layout; "wrap in stack" / "remove wrapper" ops.
- **Selection keymap**: Esc=parent, Enter=children, Tab cycle, ⌘Esc=top parent.
- **Not copied**: desktop-first breakpoints, viewport units, web-platform features
  (overscroll/masks/cursor), marketing triggers, vector editing.

### B — Layout engine (the model to implement)

- Per-node layout: `{ mode: 'flow' }` (RN default) or `{ mode: 'absolute', anchors }`.
- Sizing per axis: **Hug** = omit style (RN auto) · **Fill main** = `flex: 1` ·
  **Fill cross** = default stretch · **Fixed** = number · clamps = min/max ·
  `aspectRatio`.
- Container: direction/wrap/gap/padding/justifyContent/alignItems (Figma Auto-Layout
  parity; gap ≥ RN 0.71; **flow children never store rendered x/y**).
- Drag of flow child = reorder (insertion bar) + reparent; drag of absolute child =
  inset anchors. Numeric input ⇒ fixed; double-click edge ⇒ hug; Alt+dbl-click ⇒ fill.
- Snapping: **8 screen-px / zoom** threshold (tldraw), structural snaps first
  (flow insertion, padding boundary, equal-gap), then geometry (edges/centers),
  gap-duplication, pixel grid last; Alt disables; **all coordinates in ONE space**.
- RNW pitfalls: `minWidth/minHeight: 0` forced, `flexShrink: 0` default, text
  metrics differ ⇒ never persist preview-measured pixels as layout truth.

### C — Interaction & logic (flow system design)

- **Sequential step list with indented branches — NOT a node graph** (evidence:
  every successful app builder uses lists; node graphs win only for dataflow/game
  logic; learnability literature favors constrained composition).
- Document model: `FlowDoc { trigger, steps[] }`, steps = discriminated action union,
  branches as nested step arrays (`if.then/else`, `apiRequest.onSuccess/onError`).
- **Strictly await-sequential** semantics (documented; no hidden parallelism).
- v1 action catalog (14): navigate(push/replace/back+params), setVariable
  (set/increment/toggle + list ops), if, apiRequest(+output var+branches),
  validateForm, uiFeedback (alert/confirm/toast/haptic), setVariant, wait, openUrl,
  clipboard, share, setInputValue, resetInput, (v1.1 executeFlow reuse).
- State: app (generated zustand store + persist) / screen (useState) / component /
  **implicit input state** (value/focused/error readable without user variables).
- Codegen: inline `handlePressX` async handlers; extract to `src/actions/*` when
  reused/long; per-step `runWhen` guards; whole handler wrapped in try/catch →
  toast+console.error, never silent.
- **Critical gap in our old plan**: conditional/bound props (variant binding) must
  exist alongside flows, or "disabled while loading" is impossible. Data sources
  (fetch-on-mount) are a separate concept from imperative API actions.

### D — Design tokens & styling

- **DTCG `$value/$type` format with `{dotted.path}` references** (free Figma
  Variables / Tokens Studio interop); three tiers: primitives → semantic (per-mode
  light/dark values, Figma-Variables model) → composites (typography/shadow).
- Nodes store `{ token: 'path' }` as raw source of truth + resolved cache for canvas;
  detaching freezes the resolved literal.
- Codegen with inline-styles-only constraint: emit a generated `theme/` module
  (ThemeProvider + useTheme + resolved per-mode objects + Platform.select shadows)
  and spread `theme.colors.x` inline — honors "no StyleSheet.create".
- Full style inventory + platform notes (per-corner radius = 4 separate props;
  shadows: iOS shadow* vs Android elevation vs new-arch boxShadow; lineHeight and
  letterSpacing are absolute pt; RN 0.88 adds backgroundImage/filter/boxShadow).
- Color picker: react-colorful pattern — `onChange` live, **commit history on
  onChangeEnd**; HEX/RGB/HSL + opacity + recents + token tab.

### E — Dynamic data & APIs

- The load-bearing UX loop: **configure → test request → inspect JSON → tree-picker
  binding** (Bubble initialize / FlutterFlow Response Preview / Adalo auto-detect).
- Bindings stored as **structured AST refs** (endpoint+path / variable / item /
  index), serialized for display as `{{Movies.data.items[0].title}}`; codegen emits
  optional chaining `resp?.data?.items?.[0]?.title`.
- Repeater = FlatList + ONE designed item template → generated `<Card>` component
  (component-scoped state fixes the shared-row-state pitfall); keyExtractor,
  ListEmptyComponent, onEndReached pagination config, RefreshControl.
- **Explicit 5-state machine per data source** (idle/loading/success/empty/error +
  refreshing) with per-state UI slots — a genuine differentiator; no tool has it.
- Security: client-side bundles are public (RN docs/OWASP MASWE-0004); secrets never
  inlined; `EXPO_PUBLIC_*` is public by definition; the real Expo-native relay is
  **Expo Router API routes (`+api.ts`) on EAS Hosting** (note: "EAS Functions" does
  not exist); editor shows client-safety analysis + generates proxy stubs; test
  samples must be scrubbed of secret values (Bubble's documented leak).
- Auth: SessionProvider + expo-secure-store + `<Stack.Protected guard>` pattern.

### F — Animation & advanced components

- Reanimated 4.7.1 (SDK 58): layout animations (`entering/exiting/layout`,
  Keyframes, 10 preset families) run on **web too** — live editor preview is
  feasible; **springs in layout animations do NOT run on web** (editor falls back
  to timing twin + "renders on device" badge).
- Gesture Handler 3.3 = **hook API** (`usePanGesture` etc.); `Touchable` component
  replaces legacy buttons; ForceTouch gone.
- Skip Moti (no reanimated-4 release). Bottom sheet: `@gorhom/bottom-sheet` 5.2
  (SDK 58-compatible). Carousel: `react-native-reanimated-carousel` v5 or plain
  FlatList paging.
- Animation capability model per registry entry: entering/exiting/layout/press/
  variant-transition/loop/scroll-triggered/screen-transition slots → exact
  reanimated expressions; spring params (v4: mass 4, damping 120, stiffness 900);
  `reduceMotion: System` default; transform/opacity only (never layout props).

### G — Expo SDK 58 compatibility (facts codegen MUST follow)

- Pins: expo ~58.0.22, RN 0.88.1, react 19.3.0, RNW ~0.21.4, router ~58.0.29,
  reanimated 4.7.1 + worklets 0.13, GH ~3.3, safe-area ~5.10.1, flash-list 2.3.2.
- **New Architecture always on** (SDK 55+): boxShadow/filter/backgroundImage legal.
- `unstable_settings.anchor` (NOT `initialRouteName`); `withLayoutContext` deprecated.
- expo-font: config plugin (native builds, not Expo Go) vs `useFonts` (everywhere);
  SDK 58 multi-face families + variable fonts (`fontVariationSettings`, RN 0.88);
  **TTF/OTF only** for universal support; Android family = filename, iOS = internal
  name.
- Removed/deprecated: Modal `animated` prop; RN StatusBar color props (use
  expo-status-bar); `ImageBackground` (emit View + absolute Image); `Touchable`
  root export; InteractionManager.
- Bootstrap: app.json (name/slug/scheme/plugins/web.output/experiments.typedRoutes),
  `main: "expo-router/entry"`, tsconfig extends expo/tsconfig.base, **no metro/babel
  config**. Safe-area provider automatic under Router; **web insets are 0**.
- Expo Go is single-SDK (58); config-plugin fonts ⇒ dev build.

---

## 3. Target architecture (what we're building toward)

```
ProjectData (single source of truth, versioned document)
├─ groups (nav config) · screens (routes/devices/artboard pos)
├─ nodes (flat map: props, layout{mode,sizing,anchors}, style, animations, rawCodeProps)
├─ theme  [M3]  DTCG tokens + modes + fonts          (new)
├─ variables [M4] app/screen scopes                   (new)
├─ flows  [M4]  FlowDoc per node/trigger              (new)
├─ dataSources/apis [M5] collections/endpoints/bindings (new)
└─ components [M6] definitions + variants + instance overrides (new)

Consumers (all read the same document):
  canvas (editable projection) · inspector (contextual projection)
  simulator (executable projection — M2) · codegen (Expo project emission)
```

Editor layers stay as today (left tree / DOM canvas + RNW / right inspector /
toolbar) with new top-level sections: Theme (M3), Data (M5), plus Flow tab in the
inspector (M4).

---

## 4. Milestones (implementation order, each independently testable)

### M1 — Core correctness (P0) ← **started, see §8**
1. Transactional undo/redo: leak-proof gesture tokens + watchdog; copy-on-write
   mutations (fix `reindex` paths); reference snapshots (structural sharing, no deep
   clone); typing/scrub coalescing; redo invalidation; tests.
2. Inline text editing on canvas (double-click, caret/selection, Esc cancel, blur
   commit, one history entry per session).
3. Snap-guide coordinate fix (single artboard-local space).
4. Layout model foundation: flow-first placement mode (`mode:'flow'`, hug/fill/fixed)
   with the inspector Layout section driving it — full drag-reorder in M2.5.

### M2 — Independent simulator + layout completion
- Simulator route (`/sim`) rendering ONE app instance from the entry point: an
  RNW app-tree interpreter over the same document (routes from groups/screens,
  tab/stack chrome, flows executed by the same runtime the codegen emits);
  restart/reload, device + orientation, console/network/error panels, live-update
  via BroadcastChannel from the editor.
- Flow-child drag = reorder + reparent with insertion indicators; wrap-in-stack /
  remove-wrapper ops; snapping upgrade (structural first, 8px/zoom, gap snaps).
- Multi-select + marquee (one undo entry per transform).

### M3 — Theme system + typography + styling completeness
- Theme document (DTCG, light/dark modes), token references in styles + color
  picker token tab, theme module codegen, Theme top-level section.
- Font manager (upload TTF/OTF → assets + useFonts/plugin emission + picker).
- Style inspector completion: gradients (expo-linear-gradient + angle), per-corner
  radius, shadows (platform-aware), transforms, background images.

### M4 — Interaction flows + variables + navigation wiring
- FlowDoc schema + Flow tab (sequential list UI, per-step forms, value picker),
  flow runtime (editor-side, mirrors codegen), codegen handlers + actions modules,
  app/screen variables + implicit input state, conditional/bound props (variants
  foundation), navigation actions (router.push/replace/back + params).

### M5 — Data & API
- Data section: API collections/endpoints, test panel → schema discovery →
  tree-picker bindings; repeater binding (FlatList + card template); 5-state slots;
  pagination + pull-to-refresh; security analyzer + proxy stub generation;
  auth session pattern.

### M6 — Components & variants + animation editor
- Component definitions (primary tree + per-attribute instance overrides),
  variables, variants + transitions through the Flow system; assets panel.
- Animation editor: capability-driven slots (entering/exiting/layout/press/loop/
  scroll-triggered), spring/timing controls, preview Play/Replay, reduced-motion.

### M7 — Responsive, accessibility, export
- Device presets + custom viewports, orientation, size-class overrides (replica
  model), responsive typography; a11y inspector (labels/roles/hints/hitSlop) +
  editor a11y pass; production zip export with quality gates.

---

## 5. Locked contracts added by this plan

- `node.layout` (M1.4): `{ mode: 'flow' } | { mode: 'absolute', anchors: {left?,right?,top?,bottom?} }`
  with per-axis `sizing: 'hug' | 'fill' | 'fixed'` — codegen maps to RN exactly
  (hug=omit, fill-main=`flex:1`, fill-cross=stretch, fixed=number).
- History: snapshots are **references to immutable data**; any function that
  mutates a persisted object must clone first (copy-on-write rule, enforced by tests).
- All canvas guide/overlay geometry is **artboard-local dp** (single coordinate
  space rule).
- Flows are strictly sequential (await) — documented in the UI.
- Bindings are structured refs, never stringly-typed.

## 6. Dependencies between milestones

M1 → M2 (simulator needs reliable document) → M3 (theme before data-binding so
bindings can reference tokens) → M4 (flows need variables; variants need theme) →
M5 (data sources use variables + states) → M6 (components build on all of the
above) → M7. M3 can proceed in parallel with M2.

## 7. Testing strategy

- **Unit (vitest)**: history manager (leak scenarios, coalescing, redo
  invalidation, order restoration), layout codegen mapping, token resolution,
  flow codegen, binding path emission.
- **Integration**: store action sequences (the spec's undo test script), codegen
  snapshot tests per component type.
- **Manual/E2E checklist** per milestone (the spec's §21 lists, wired to each
  milestone's acceptance).

## 8. M1 progress log (this session)

- [x] Plan document (this file)
- [x] `src/lib/project/history.ts` — gesture-token transaction manager (leak-proof)
- [x] Store rework: copy-on-write everywhere; reference snapshots; watchdog wiring
- [x] Gesture call-site hardening (double-pointerdown guards)
- [x] Snap-guide coordinate fix (artboard-local conversion at publish time)
- [x] Inline text editing (double-click → contentEditable overlay, Esc/blur rules)
- [x] vitest + history/store tests (the spec's undo sequences)
- [ ] Flow-first layout model (M1.4 — foundations land next session; absolute
      remains the default until drag-reorder ships in M2)
