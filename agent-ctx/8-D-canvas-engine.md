# Task 8-D — Canvas Engine (ExpoForge visual builder rework)

**Agent:** 8-D · **Scope:** `src/components/builder/screens/**` (device-presets public API kept stable), `src/components/builder/canvas/**` · **Status:** ✅ complete — `bunx tsc --noEmit` clean (only pre-existing errors under `examples/` + `skills/`), `bun run lint` 0 findings, and every reachable interaction exercised end-to-end in the running app via agent-browser against the real store (fixtures injected only through the store's own persistence layer, then removed).

## 1. Files

### Rewritten / modified
- `screens/canvas-host.tsx` — the infinite-canvas host. Public API exactly per the integration contract: `<CanvasHost activeTool={'select'|'hand'} insertTool={InsertTool|null} onPlaced={() => void} className? />`. Rulers/zoom-UI removed (kept removed from the prior partial rewrite); pan/zoom via the ported hooks (`useCanvasWheel`, `useCanvasTouch`, `useSafariGestureZoom` — untouched math); dot grid ≥0.5 zoom; space/middle-mouse drag pan; empty-state overlay ("New screen" → `addScreen()`, hint about the Screens panel); placement capture layer (crosshair, `data-canvas-hit-through`, z-40) + status chip top-right ("Click to place {Name} · Esc to cancel"); keymap on the canvas root (capture): Delete/Backspace → `deleteNode`, Esc → cancel placement (`onPlaced`) else clear selection, arrows → nudge (gesture-wrapped, Shift ×10); **removed the dead palette-drop listener** (PALETTE_MIME DnD — the left panel's palette is gone, per 7-C's handoff note); **added focus management**: a rAF `root.focus()` on non-editable canvas pointerdowns so the keymap actually receives events after clicking artboards (clicks on non-focusable children otherwise leave focus on `<body>`, where the root's capture handlers never fire — verified at runtime).
- `screens/screen-artboard.tsx` — artboard rewrite. Label row (name · device · WxH · platform chip · GROUP chip tinted **tabs=`text-component` component accent / stack=`text-accent` blue / none=muted** · SIM chip) = the drag handle (edit mode only); device frame chrome kept (status bar, island/punch/bezel, home indicator); content column: safe-top inset → (top tab bar) → stack header (`headerShown` only, title=shown screen's name) → RNW `ScreenTreePreview` for the SHOWN screen (sim: `simShownScreen`, edit: own screen) → (bottom tab bar — **`pointer-events:none` wrapper in edit mode, interactive in sim**) → safe-bottom inset (tab bar ABOVE the inset); edit pane (transparent, `data-canvas-hit-through`, z-10, whole content region) + `SelectionOverlay` above it in edit mode; sim: no pane/overlay, RNW live, crossfade swaps (AnimatePresence 150ms, `useReducedMotion`), accent ring + SIM chip; screen drag = `beginGesture` → live `moveScreenCanvas` per move → `endGesture` (one undo entry); empty-content hint "Select a tool below, then click to place" (edit mode, no nodes).
- `screens/index.ts` — barrel: `CanvasHost`/`CanvasHostProps`/`CanvasTool`, `ScreenArtboard`, `DEVICE_PRESETS`/`deviceById`/`DevicePreset`/`PlatformId` (API stable), **`projectBoundsAll()`/`projectBoundsActive()`** (union of artboard rects incl. 28u label margin — for the zoom shortcuts).

### New (canvas/*)
- `canvas/element-at-point.ts` — `elementAtPoint(x,y)` hit-through resolver (sets `pointerEvents:'none'` on every `[data-canvas-hit-through]` layer — edit panes + placement capture — re-calls `document.elementFromPoint`, restores synchronously); `nodeSelector`/`nodeIdOf` (RNW testID → `data-testid` = `NODE_DOM_ATTR`); `nodeElementWithin` (nearest node ancestor, stops at the artboard boundary); `coordinateParentOf` (a node's coordinate space: nearest container-node ancestor or the `[data-screen-content]` wrapper); `artboardElementOf`/`screenIdOfArtboard`/`contentElementOf`.
- `canvas/measure.ts` — DOM-truth geometry. `measureNode(screenId,nodeId)` + `measureAgainst(parentEl,el)`: getBoundingClientRect against the owning element, divided by viewport zoom (shared transform → zoom-invariant dp); `useMeasureTick()` (scroll events captured at window level — RNW ScrollView scrolls count — + window resize, bumps a counter); `useNodeMeasure(screenId,nodeId)` re-measures in `useLayoutEffect` on store `revision` / tick / selection change (never per frame).
- `canvas/snap.ts` — open-pencil snap semantics: `collectSnapTargets(containerEl, excludeEl)` = container edges+centers + every direct node child's edges+centers (measured from the live DOM, container-local dp); `snapRect(movingRect, activeLines, targets, threshold)` = best match per axis (6 **screen** px ÷ zoom), ties emit multiple guides; `SNAP_TOLERANCE_SCREEN_PX = 6`; `ALL_LINES` for moves, `handleLines(handle)` (dragged edges only) for resizes.
- `canvas/node-edit.ts` — `useNodeEdit({screenId, artboardRef, panActive})`: move gesture (edit-pane pointerdown → hit-resolve → select+`setActiveScreen` → drag live `setNodeStyle({left,top})` per pointermove with snapping; flow (`style.position!=='absolute'`) or locked nodes select but never drag); resize gesture (8 handles; corners → left/top/width/height, edges → near side; min 8dp keeping the opposite edge anchored; auto-height nodes (no `style.height`, e.g. Text) get **only e/w handles**); double-click drill-in (node → parent container if any, else screen; empty area → screen); every drag = `beginGesture` … `endGesture` → **ONE undo entry**.
- `canvas/selection-overlay.tsx` — measured-rect outline (`SELECTION_COLOR`), magenta 1px snap guides (`SNAP_COLOR` #FF0090), 4px dots on ≥7px hit areas, size pill during resize ("W × H" / "W" when auto-height), flow-positioning hint chip ("Switch to Absolute in Layout to move freely"), locked hint. All sizes ÷ zoom → constant on-screen size.
- `canvas/placement.ts` — `placeComponent(type, clientX, clientY, canvasPoint)`: artboard hit → `resolveContainer` (innermost→outward nearest `children === 'any'` registry node; leaf hits fall to the first container ancestor; none → screen root, `parentId:null`) → local coords via the container's `getBoundingClientRect` ÷ zoom → default insert box **centered on the click** (clamped ≥0 / inside container) → `insertNode`; bare canvas → `beginGesture` → `addScreen({at: point})` → component centered in the new screen (`(sw−w)/2, (sh−h)/2`) → `endGesture` (one undo entry). Screen tool handled in the host (`addScreen({at})` → `onPlaced()`).
- `canvas/input-mode.ts`, `canvas/use-canvas-wheel.ts` — pan-intent signal store + the ported wheel hook (kept).

### Kept as-is
`screens/device-presets.ts` (public API `DEVICE_PRESETS`, `deviceById`, `DevicePreset`, `PlatformId` — untouched), `screens/canvas-constants.ts` (`SELECTION_COLOR`, `SNAP_COLOR`…), `screens/project-bounds.ts`, `screens/screens-state.ts` (Phase-1 legacy — **still imported by `page.tsx`**, which 8-D must not touch; delete it in the page-integration pass when zoom shortcuts repoint to `projectBoundsAll/Active`).

## 2. Interaction map (gesture → store call → undo granularity)

| Gesture | Store calls | Undo |
|---|---|---|
| Click node (edit pane) | `select({kind:'node'})` + `setActiveScreen` | none (view state) |
| Click empty artboard / chrome area | `select({kind:'screen'})` + `setActiveScreen` | none |
| Click bare canvas (no drag) | `select(null)` | none |
| Drag node | `beginGesture` → `setNodeStyle({left,top})` ×N (snap-adjusted) → `endGesture` | 1 entry |
| Resize handle | `beginGesture` → `setNodeStyle({left/top/width/height})` ×N → `endGesture` | 1 entry |
| Move node (flow/locked) | select only, drag disabled + hint chip | — |
| Double-click node / empty | `select(parent node)` / `select(screen)` | none |
| Delete/Backspace (canvas focus, not editable) | `deleteNode` | 1 entry |
| Arrows / Shift+arrows (node or screen) | `beginGesture` → `setNodeStyle`/`moveScreenCanvas` per key-repeat → `endGesture` on last keyup | 1 entry per key press |
| Esc | placement → `onPlaced()` (cancel); else `select(null)` | none |
| Screen drag (label row; frame in sim-less modes) | `beginGesture` → `moveScreenCanvas` ×N → `endGesture` | 1 entry |
| Screen tool click | `addScreen({at: canvasPoint})` → `onPlaced()` | 1 entry |
| Component click on artboard | `insertNode({screenId,type,parentId,rect})` → `onPlaced()` | 1 entry |
| Component click on bare canvas | `beginGesture` → `addScreen({at})` → `insertNode(centered)` → `endGesture` → `onPlaced()` | 1 entry |
| Tab click (sim) | `simNavigate(artboardId, target, 'replace')` | none (sim) |
| Header back (sim) | `simBack(artboardId)` | none (sim) |
| Wheel / pinch / ⌘± / space-drag / middle-drag | viewport store only (`pan`, `setZoomAroundPoint`) | none |

## 3. Measurement approach
Overlay geometry is DOM-truth, never the style record: `getBoundingClientRect(node)` − `getBoundingClientRect(artboardRoot)`, ÷ zoom → artboard-local dp (both elements share the pan/zoom transform, so the difference is zoom-invariant). Re-measure triggers: store `revision` (every committed mutation — drags commit per pointermove, so the overlay tracks live), `measureTick` (window-level **capture** scroll listener → RNW ScrollView scrolls + window resize), selection change. `useLayoutEffect` before paint. Handles/guides/chips scale by 1/zoom for constant on-screen size.

## 4. Snap behavior
Best-per-axis within 6 screen px (÷ zoom): moving rect's left/center/right × top/center/bottom (moves: all lines; resizes: only the dragged edges) vs the container's edges+centers and every direct node sibling's edges+centers (live-DOM measured). Magenta `#FF0090` 1px lines spanning the moving rect ∪ matched target, rendered in the overlay; Alt disables entirely (checked live per move).

## 5. Runtime verification (agent-browser, real dev server, localStorage-injected fixture: tabs group ×3, stack group ×2, standalone screen with nested view/text/button + auto-height texts)
Artboards render (6/6, labels+chips — tabs chip `#bb8fff` component accent, stack chip `#2563eb` blue) · node click selects + measured outline matches DOM rect exactly · move drag (+40/−30 exact) · snap drag → left snapped 0 with 1 magenta guide · resize e-handle → live "350 × 120" pill + persisted · resize-snap → right edge snapped to container right (width 300→303, guide visible) · auto-height text → only 2 width handles · dblclick text → parent view selected · dblclick empty → screen selected · canvas focus after click (rAF fix) · Delete removes node, selection cleared · ⌘Z restores node + selection · 3 undos = 3 gestures (geometry back to fixture-exact) · Esc clears selection · bare-canvas click clears selection · label-row drag moves artboard (+60/+40 exact), undo restores · arrows nudge (1 / Shift 10) · sim: panes gone (0 hit-through), SIM chips ×6, tab click swaps shown screen (0 nodes, active tab "Search"), tab bar pointer-events auto in sim / none in edit, stack headers with back, screens NOT draggable, no console errors · stop sim → panes restored · wheel pan + ctrl+wheel anchored zoom (1→5.278×, ⌘0 reset) · grid hidden at 0.189 zoom · space+drag pan (+120/+120) · middle-mouse pan (+60/+40) · empty state (button + hint) → "New screen" creates Screen 1 selected · state cleaned afterwards.
*(Two agent-browser CLI quirks, NOT app bugs, investigated and ruled out: `mouse wheel <x> <y>` dispatches at a wrong target/stale coords, and `keydown Space` sends an empty key/code — both re-verified via equivalent synthetic events through the app's own listeners.)*

## 6. Placement mode note for the page-integration task
`page.tsx` (not mine) still renders `<CanvasHost activeTool={canvasTool} />` without `insertTool`/`onPlaced`, and its zoom shortcuts still call `useScreensStore.boundsOfAll/Active`. The canvas contract is ready; wire it as:
```tsx
<CanvasHost
  activeTool={tool === 'hand' ? 'hand' : 'select'}
  insertTool={typeof tool === 'object' ? tool : null}
  onPlaced={() => setTool('select')}
/>
```
and repoint ⌘1/⇧1 to `projectBoundsAll()`/`projectBoundsActive()` from `@/components/builder/screens` (then delete `screens-state.ts`). The capture layer + chip + Esc paths are fully implemented and code-verified (they share the runtime-verified `elementAtPoint`/container-walk/`insertNode` machinery); they become clickable the moment the toolbar wiring lands.

## 7. Store / registry API gaps (report-only — nothing edited)
1. No action to set `ui.lastDeviceId`/`ui.lastPlatform` without a screen (already reported by 10-F; canvas placements always go through `addScreen`, which records them).
2. `InsertNodeInput.rect.height` accepts `'auto'` in the type but the impl just omits `style.height` for it — the behavior is exactly what the canvas wants (auto-height Text), only the type is wider than the impl.
3. `insertNode` hardcodes `position:'absolute'` — correct for placement; any future flow-insert API would need a variant.
4. Sim seeding (`setSim(true)`) starts EVERY artboard of a nav group at the group's FIRST screen, so e.g. the Search artboard shows Home until the user taps its own tab bar — rendered faithfully by the canvas; flagging in case per-artboard seeding (own screen) was intended.
5. `moveScreen` doesn't reposition the artboard on canvas when a screen changes groups (7-C also noted) — artboards keep their canvas x/y.
6. `findFreePosition` centers the preferred block on the click (then probes ±48…±240) — good for click-to-place; note `addScreen({at})` never overlaps existing artboards even if the click was over one.
7. Registry: fully populated (11 entries), `insert.width`/optional `insert.height` and `children:'any'` policy all consumed as specced — no gaps.
8. `revision` also bumps on sim navigation — harmless (overlay hidden in sim), just noting the signal is broader than data mutations.
