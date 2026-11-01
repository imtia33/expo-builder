# 02 — Architecture

> The one decision this doc locks: **how the canvas works.** Everything else follows.

## 1. The canvas decision (and why)

### 1.1 Requirement recap

The canvas must show **screens** that are **live**: a dropped `FlashList` initializes
with items; a `BlurView` shows glass on the iOS variant and the normal-view pattern on
Android; a Sign In button actually runs its flow and routes to the "home" screen.
Users edit a **component tree**, not drawings.

### 1.2 The three options considered

**Option A — open-pencil verbatim (CanvasKit/Skia engine).**
open-pencil renders its scene graph to a WebGL canvas via CanvasKit (Skia WASM).
Its own "islands" system (`packages/vue/src/canvas/islands/`) exists precisely because
static Skia drawings can't host live interactive content — islands are DOM overlays
positioned over the canvas.

**Option B — open-pencil engine + islands for everything.**
Use their canvas for chrome (artboards, rulers, selection) and bridge every screen's
content as a DOM island synchronized to the pan/zoom matrix.

**Option C — DOM infinite canvas (Framer-style).** *(chosen)*
The canvas is a DOM container transformed by `translate(pan) scale(zoom)`. Screen
artboards and their live react-native-web content are ordinary positioned DOM nodes
inside it. Overlays (selection, snap guides, drop indicators) are separate DOM layers
above, sharing the same transform.

### 1.3 Why C wins for this product

1. **The content is live RNW trees.** In our domain, ~100% of canvas content is
   interactive components. With A/B, the primary content becomes an *exception system*
   (islands bridged to a Skia scene). With C, live content is the native case.
   This is exactly how Framer's component canvas works — and the product brief is
   "Framer for Expo".
2. **No translation loss.** The preview *is* the tree; the exported code *is* the
   tree. One source of truth, no projection step to keep in sync.
3. **Simulation in place.** Pressing ▶ doesn't switch tools — the same DOM nodes
   become interactive; flows run against the mock API; router navigation swaps screens
   inside the artboard. Option A would need a second rendering path for this.
4. **No wasm/WebGL operational cost.** CanvasKit brings a ~7MB wasm asset, WebGL
   context limits (their code "parks" contexts to avoid browser caps), and a 150k-LOC
   engine whose vector/text-shaping prowess (the reason it exists) is irrelevant when
   there are no vectors to shape.
5. **We still copy open-pencil's crown jewels verbatim** (MIT): the Figma-calibrated
   pan/zoom wheel math (`wheel.ts`), touch pan/pinch (`pan/zoom.ts`), the theme token
   system, the UX patterns (pill toolbar, MIXED sentinel, scrub-commit fields,
   undo batching+coalescing). See `01-research-findings.md` §4 and `03-design.md`.
   We copy *logic*, not the rendering substrate it was originally attached to.

**Trade-offs accepted:** DOM canvas costs GPU compositing on very large scenes
(hundreds of screens). Mitigations: cull off-viewport artboards (`content-visibility`),
and cap zoom-out clustering (group screens beyond a threshold) — noted in
`03-design.md` §3. Not a v1 blocker; our scenes are tens of screens, not thousands.

## 2. System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ Next.js 16 app (single route "/", client-heavy, ssr:false islands)   │
│                                                                      │
│  ┌────────────┐  ┌───────────────────────────┐  ┌──────────────────┐ │
│  │ Left panel │  │        Canvas host         │  │   Right panel    │ │
│  │ Screens    │  │  ┌───────────────────────┐ │  │ Props/Style      │ │
│  │ Layers     │  │  │ DOM infinite canvas   │ │  │ Flow / Code      │ │
│  │ Palette    │  │  │  ├ artboards (device) │ │  │ (MIXED sentinel, │ │
│  │            │  │  │  ├ RNW live trees     │ │  │  scrub fields)   │ │
│  │            │  │  │  └ overlay layer      │ │  │                  │ │
│  │            │  │  └───────────────────────┘ │  │                  │ │
│  └────────────┘  └───────────────────────────┘  └──────────────────┘ │
│        ▲                 ▲                        ▲                   │
│        └────────────────┴──────────┬─────────────┘                   │
│                          Zustand project store                       │
│                    (tree + flows + undo command stack)               │
│                                   │                                  │
│  ┌────────────────────────────────┼───────────────────────────────┐  │
│  │            Functionality layer │                               │  │
│  │  component registry (Expo 58) │ codegen (06) │ flow runtime    │  │
│  │  RNW renderer + variant sim   │ mock API     │ export zip      │  │
│  └────────────────────────────────┴───────────────────────────────┘  │
│                                   │                                  │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │  /api/* (relative paths only)
                         ┌──────────┴───────────┐
                         │  Next.js API routes   │
                         │  projects CRUD        │
                         │  (Prisma + SQLite)    │
                         └──────────────────────┘
```

## 3. Layer responsibilities

### 3.1 Project store (single source of truth)

- Zustand store holding the **project tree** (`07-data-model.md`): screens → nodes,
  custom component definitions, flows, per-platform variants.
- All mutations flow through **command objects** (open-pencil `UndoManager` design:
  batches, coalescing, 200-entry cap) → undo/redo for free, and the *same* commands
  drive both the live canvas and codegen input.
- React panels subscribe via selectors; the canvas host subscribes per-screen for
  RNW re-render. No cross-panel event buses — the store is the bus.

### 3.2 Canvas host

- Owns the viewport (panX/panY/zoom, clamped 0.02–256) and the wheel/touch math
  ported verbatim from open-pencil (`03-design.md` §3 has the constants).
- Renders artboards: device frames (notch/Dynamic Island/status bar per variant)
  at true logical-pixel dimensions, with the screen's RNW tree inside.
- Overlay layer: selection handles, marquee, snap guides, drop indicators,
  measurement — all DOM, all sharing the viewport transform.

### 3.3 Live renderer (RNW)

- `react-native-web` renders each screen's subtree from the store.
- **Variant simulation:** the renderer injects `Platform.OS` per the artboard's
  variant; platform-conditional components resolve accordingly (registry marks
  fidelity tiers: native / approximated / shim / static-preview —
  `04-component-registry.md` §1). Example: `expo-blur` → glass on iOS artboard,
  `BlurTargetView` pattern on Android artboard.
- **Simulation mode:** flows become live event handlers; router navigation swaps the
  active screen inside the artboard (a mini expo-router-shaped runtime over the store).
- Builder chrome (selection etc.) is *outside* the RNW trees — we never wrap user
  components in builder artifacts that would leak into exports.

### 3.4 Component registry

- One typed catalog (`04-component-registry.md` §1) driving: palette entries,
  props panel schema, style-prop groups, flow hooks, variant tables, and codegen
  templates. Adding a component = one registry entry; every surface updates.

### 3.5 Flow system

- Flows are ordered step chains attached to component event hooks
  (`05-flow-system.md`). Sync and async steps; every chain has success/error paths.
- **Simulation runtime** executes the same step list the codegen will emit —
  the mock API layer is generated from the same spec (typed, in `src/api/`).

### 3.6 Codegen

- Pure functions: store tree → files map (`06-codegen.md`). Runs in the browser for
  the right-panel Code tab (per-node snippet) and in an API route for full-project
  export (zip). Gates G1–G18 run on output before delivery.

### 3.7 Backend (Next.js API + Prisma)

- `/api/projects` CRUD + snapshot persistence (autosave), `/api/export` (server-side
  codegen + zip), `/api/registry` (serves registry metadata so the palette can evolve
  without redeploying the editor). All relative paths; no extra services needed in v1.
- No websocket in v1 (single-user editing). The mini-service slot stays free.

## 4. Frontend stack decisions

| Concern | Choice | Note |
|---|---|---|
| Framework | Next.js 16 App Router, `/` only | product constraint |
| Canvas | DOM + CSS transform | §1 of this doc |
| Live preview | react-native-web 0.21.4 | SDK 58 pin (research §2) |
| State | Zustand + commands | `07-data-model.md` |
| UI kit | shadcn/ui + tailwind-variants theme (copied from open-pencil) | `03-design.md` §1 |
| Motion | framer-motion | builder chrome only; RN animations are Reanimated concepts emitted by codegen |
| Styling | Tailwind 4 + tokens.css (verbatim copy) | dark Figma-like theme |
| Icons | lucide-react | open-pencil uses lucide via Iconify — same set |

**Import discipline:** builder code (`@/components/...`) never imports from
`react-native-web`-land except the renderer island; RNW-facing code lives under
`@/expoforge/preview/*`. The registry is shared vocabulary; it contains zero
rendering code (pure data + generators).

## 5. Key flows (end-to-end)

### 5.1 Drop a component
palette drag (HTML5 DnD, `application/x-expoforge-component`) → canvas hit-tests drop
target against the tree (container policies from the registry) → insert command →
store update → artboard RNW subtree re-renders → layers tree updates. One undo entry.

### 5.2 Attach a flow
select Sign In button → Flow tab → add chain to `onPress`: `api-call`(path, payload
bindings `{{props.email}}`) → `router.navigate`("home") on success / `alert` on error.
Simulate: ▶ → tap button on canvas → runtime resolves bindings against the tree,
calls mock API (latency per `05-flow-system.md` §6), swaps screen to "home" inside
the artboard. Export: emits `handleSignIn` async handler with try/catch/finally.

### 5.3 Platform variant edit
toggle artboard iOS↔Android: renderer swaps `Platform.OS`; registry variant table
picks the right behavior/looks. Per-variant *edits* (props/style diffs) are stored as
variant overlays on the same node (`07-data-model.md` §4) so codegen can emit
`Platform.select` or split files (thresholds in `06-codegen.md` §7).

## 6. Failure modes & mitigations

| Risk | Mitigation |
|---|---|
| DOM canvas perf at extreme scenes | content-visibility culling; zoom-out clustering; monitor via dev overlay |
| RNW gaps (components with no web target, e.g. WebView) | registry fidelity tiers; shim/static-preview rendering on canvas; full behavior only in exported app |
| Codegen drift from preview | both consume the same store + registry; gates G1–G18; Code tab shows live snippet for any node |
| Banned APIs creeping in | gate G11 AST scan (deprecated list, `06-codegen.md` §5.9) |
| Undo memory growth | command pattern stores inverses, not snapshots; coalescing; 200 cap (open-pencil design) |

## 7. What we deliberately did NOT adopt

- **CanvasKit/Skia engine** — §1.3.
- **NativeWind/Uniwind/Tamagui** — banned by the inline-styles constraint.
- **Yjs collab** — v1 is single-user; store is designed so a Yjs provider can wrap
  commands later (commands are serializable).
- **Separate mini-services** — nothing in v1 needs a second port; export runs in an
  API route.
- **open-pencil's Vue SDK** — we copy its *logic and tokens*, not its framework.
  The engine would only have given us the Skia renderer we're not using.
