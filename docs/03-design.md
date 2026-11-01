# ExpoForge Builder — UI/UX Design Spec

> **Status:** Complete build spec. Every color, size, radius, shadow string, and shortcut in this
> document is quoted from the open-pencil source at `/home/z/research/open-pencil` (MIT) unless
> marked as an ExpoForge-specific decision. File references in `backticks` point at open-pencil
> sources; an engineer should be able to build from this document without opening those files.
>
> **Scope:** the builder chrome only (host app around the canvas). Screen content rendering
> (react-native-web) is covered by `02-canvas-architecture.md` (see OPEN QUESTION at the end).

---

## 1. Design language

### 1.1 Token system (verbatim port)

Copy `packages/open-pencil/src/theme/tokens.css` → `src/app/theme/tokens.css` in the Next.js app,
imported from `globals.css` as:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './theme/tokens.css';
```

The file wipes Tailwind's default palette (`--color-*: initial;` inside `@theme`) and installs
open-pencil's own. Dark is the default theme; light is selected with `html[data-theme='light']`.
**ExpoForge ships dark-only for v1** (the `data-theme` switch hook is ported so light mode is a
config flip, not a rewrite).

**Surface & chrome colors (dark, default):**

| Token | Value | Used for |
|---|---|---|
| `--color-panel` | `#2a2a2a` | All panels, toolbar pill, menus |
| `--color-panel-secondary` | `#242424` | Nested surfaces (screens list bg, code editor bg) |
| `--color-panel-field` | `#383838` | Inputs, selects, number fields |
| `--color-panel-field-hover` | `#404040` | Input hover |
| `--color-panel-focus` | `#3b82f6` | Focus rings (`focus-visible:ring-1`) |
| `--color-panel-selected` | `#2f6fdd` | Selected tree row (focused), active list rows |
| `--color-panel-selected-muted` | `#353b46` | Selected tree row when panel not focused |
| `--color-canvas` | `#1e1e1e` | Canvas backdrop, app body background |
| `--color-border` | `#3a3a3a` | All borders, dividers, splitters, scrollbar thumbs |
| `--color-hover` | `#353535` | Row/button hover |
| `--color-surface` | `#f0f0f0` | Primary text on dark |
| `--color-muted` | `#a6a6a6` | Secondary text, icons, shortcuts |
| `--color-input` | `#1e1e1e` | Input backgrounds |
| `--color-accent` | `#2563eb` | Accent buttons, active tool, drop indicators |
| `--color-on-accent` | `#ffffff` | Text on accent |
| `--color-component` | `#bb8cff` | User-component tint (tree icons, canvas outline, panel headers) |
| `--color-slot` | `#f45cc4` | Slot/children-prop tint |

**Status colors (dark):** `--color-warning: #ffb314`, `--color-warning-bg: rgb(245 158 11 / 0.1)`,
`--color-warning-border: rgb(245 158 11 / 0.3)`, `--color-warning-action: #fcd34d`,
`--color-success: #4ade80`, `--color-error: #fa8585`, `--color-error-bg: rgb(250 133 133 / 0.1)`,
`--color-error-border: rgb(250 133 133 / 0.4)`, `--color-error-fill: #dc2626`,
`--color-success-fill: #16a34a`, `--color-primary: #60a5fa`, `--color-inverted: #1f2328`,
`--color-on-primary: #1f2328`.

**Canvas chrome colors (read by the canvas layer, keep in sync):**
`--color-ruler-bg: rgb(36, 36, 36)`, `--color-ruler-tick: rgb(102, 102, 102)`,
`--color-ruler-text: rgb(140, 140, 140)`, `--color-checkerboard: #3a3a3a`,
`--color-checkerboard-muted: #4a4a4a`.

**Selection/snap colors (open-pencil draws these in-canvas; we draw them as DOM overlays — use
the same hex equivalents):** selection blue `#3b82f6` (`SELECTION_COLOR = {0.23, 0.51, 0.96}` in
`packages/core/src/constants.ts`), snap guide magenta `#ff0090` (`SNAP_COLOR = {1.0, 0.0, 0.56}`),
component outline `#bb8cff`, measurement red-orange `#f24822`-ish
(`MEASUREMENT_COLOR = {0.949, 0.282, 0.133}`).

**Light theme:** a full light palette exists in `tokens.css` (`html[data-theme='light']`,
e.g. `--color-panel: #ffffff`, `--color-canvas: #f3f4f6`, `--color-border: #d8dce3`) — ported
verbatim, unused in v1.

### 1.2 Scrollbar & utility classes (from `tokens.css`, verbatim)

```css
@utility scrollbar-none { … }   /* hides scrollbars entirely (menus, tab scroller) */
@utility scrollbar-thin {       /* 6px thumb, transparent track */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  /* ::-webkit-scrollbar 6×6, thumb var(--color-border) radius 3px,
     thumb:hover var(--color-muted) */
}
```

Also port the two custom variants `motion-safe` / `motion-reduce` from the top of `tokens.css`
(they gate on `:root:not([data-motion='off'])`, so a user toggle can kill animation globally).

### 1.3 Typography scale

Base body: `font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 13px` on `body`
(verbatim from open-pencil `src/app.css`). The full scale in use across their chrome:

| Size | Weight | Usage (all quoted from theme files) |
|---|---|---|
| `text-[10px]` | 400/mono | Command-palette key caps (`font-mono text-[10px]`) |
| `text-[11px]` | 400 | Tree rows, list items, toolbar/zoom labels, menu items, panel section titles (semibold) |
| `text-xs` (12px) | 600 | Panel header titles (`text-xs font-semibold text-surface`) |
| `text-[13px]` | 400 | Body text, command palette search + items |
| `text-base` | 400 | "+" add-screen glyph (`text-base leading-none`) |

Line-heights: rows are single-line and rely on control heights (§1.5). Nothing in open-pencil's
chrome exceeds 13px; **do not** introduce larger text in the builder chrome.

### 1.4 Floating surfaces, shadows, radii — quote these exactly

From `src/theme/overlay.ts` (verbatim — the ring+shadow combo is the signature look):

```ts
/** Popovers, menus, lists, pickers, cards. */
export const floatingSurface =
  'rounded-xl bg-panel text-surface shadow-[0_0_0_1px_var(--color-border),0_8px_30px_rgb(0_0_0/0.4)]'

/** One-line tooltips. */
export const tooltipSurface =
  'rounded-md bg-panel text-surface shadow-[0_0_0_1px_var(--color-border),0_8px_30px_rgb(0_0_0/0.4)]'
```

Toolbar pill (verbatim from `src/components/toolbar/DesktopToolbar.vue`):

```html
<div class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center">
  <ToolbarRoot class="flex gap-0.5 rounded-xl bg-panel p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]">
```

Radius scale observed across the chrome (use nothing outside it): `rounded` (4px — tree rows,
menu items), `rounded-md` (tooltips), `rounded-lg` (toolbar buttons, 8px), `rounded-xl` (pill,
menus/popovers, 12px), `rounded-full` (drop indicators, dirty dots, avatar chips).

### 1.5 Control sizes (from `src/theme/control.ts`, verbatim)

```ts
export const controlHeight  = { xs: 'h-6', sm: 'h-7', md: 'h-8', lg: 'h-9' }
export const squareControlSize = { xs: 'size-6', sm: 'size-7', md: 'size-8', lg: 'size-9' }
```

ExpoForge mapping: **xs** = tree rows & inline panel actions; **sm** = number fields and selects
in the right panel; **md** = toolbar buttons (`size-8`), panel header buttons; **lg** = reserved
(dialog footers). Toolbar icons are `size-4`; tree/list icons `size-3`; menu icons `size-3`.

### 1.6 tailwind-variants → React mapping

open-pencil's ~40 theme files under `src/theme/` are `tailwind-variants` (`tv()`) definitions —
plain objects with `slots` / `variants` / `compoundVariants` / `defaultVariants`, **zero Vue
dependencies**. Port strategy:

1. Copy `src/theme/{tokens.css, toolbar.ts, layer-tree.ts, page-list.ts, splitter.ts, tab-bar.ts,
   command-palette.ts, control.ts, overlay.ts, panel/, input/, menu/(recreate), button/}` into
   `src/app/theme/` unchanged (keep MIT attribution header comment).
2. Wrap with `tv()` via `import { tv } from 'tailwind-variants'` — identical API in React.
3. In components: `const styles = tv(toolbarTheme)` then `styles.button({ active, mobile })` —
   class-variance-authority-style calls work identically in React.
4. Slots that referenced reka-ui states (`data-[state=open]:`, `data-[highlighted]:`) map 1:1 to
   Radix/shadcn equivalents, which set the same `data-*` attributes.

Component-level substitutions (open-pencil → ExpoForge/shadcn): reka-ui `SplitterGroup/Panel` →
`react-resizable-panels` (`PanelGroup/Panel/PanelResizeHandle`), reka `DropdownMenu` → shadcn
`DropdownMenu`, reka `TabsRoot` → shadcn `Tabs`, reka `ToolbarRoot/ToolbarButton` → Radix
`Toolbar` primitives, `~icons/lucide/*` → `lucide-react`.

### 1.7 Menu styling (recreated from `src/components/ui/menu/menu.ts`, verbatim values)

```
content:  'z-50 flex flex-col p-1 ' + floatingSurface + motionStyles.floating
item:     'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px]
           select-none data-[disabled]:text-muted/50 data-[highlighted]:bg-hover'
separator:'mx-1 my-1 h-px bg-border'
label:    'px-2 pt-1.5 pb-1 text-[11px] text-muted'
shortcut: 'text-[11px] text-muted'  (right-aligned; items are justify-between gap-6)
```

Menus open with `motionStyles.floating` (§7) and scroll without a scrollbar ("chevron strips"
over each end, `h-5`, `bg-panel text-muted` — port `MenuScrollArea` pattern).

---

## 2. App layout

### 2.1 Full-screen grid

Single route `/`. No footer, no page scroll — the builder is a tool surface. `html, body, #root`
are `width:100%; height:100%; overflow:hidden; user-select:none` (verbatim from open-pencil
`src/app.css`).

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR (h-9, tab-bar.ts)                                    │
├───────────┬──────────────────────────────────┬───────────────┤
│ LEFT      │                                  │ RIGHT         │
│ PANEL     │         CANVAS (flex-1)          │ PANEL         │
│ (resizable│   + floating toolbar pill        │ (resizable    │
│  %-based) │     bottom-4 center              │  %-based)     │
├───────────┴──────────────────────────────────┴───────────────┤
│ (no bottom bar — toolbar floats over canvas)                 │
└──────────────────────────────────────────────────────────────┘
```

Structure mirrors open-pencil `src/components/editor/EditorWorkspace.vue`:

```jsx
<PanelGroup direction="horizontal" onLayout={saveResizedLayout} className="flex-1 overflow-hidden">
  <Panel id="screens" defaultSize={layout[0]} minSize={10} maxSize={30}><LeftPanel/></Panel>
  <PanelResizeHandle className={splitter.handle()}><div className={splitter.divider()}/></PanelResizeHandle>
  <Panel id="canvas" minSize={30}>
    <div className="relative flex min-w-0 flex-1">
      <CanvasStage/>
      <ToolbarPill/>            {/* absolute bottom-4 left-1/2 */}
    </div>
  </Panel>
  <PanelResizeHandle className={splitter.handle()}><div className={splitter.divider()}/></PanelResizeHandle>
  <Panel id="inspector" defaultSize={layout[2]} minSize={10} maxSize={30}><RightPanel/></Panel>
</PanelGroup>
```

### 2.2 Exact sizes

| Element | Size | Source |
|---|---|---|
| Top bar | `h-9` (36px), `border-b border-border bg-canvas` | `tab-bar.ts` root |
| Left/right panel defaults | 20% / 60% / 20% split, persisted | `EditorWorkspace.vue` defaults |
| Left panel min/max | `min-size 10`, `max-size 30` (%) | verbatim |
| Canvas panel min | `min-size 30` (%) | verbatim |
| Right panel min/max | `min-size 10`, `max-size 30` (%) | verbatim |
| Panels as surfaces | `border-r|l border-border bg-panel`, `style="contain: paint layout style"` | `LayersPanel.vue` / `PropertiesPanel.vue` |
| Properties header strip | `border-b border-border px-1.5 py-1.5` (holds collab chip + Play button) | `EditorWorkspace.vue` |
| Left panel inner split | Screens list 30% (min 10, max 60) / Layers tree 70% (min 20), vertical splitter | `LayersPanel.vue` |
| Splitter handle | `w-2` hit area (`-mx-1 w-2 cursor-col-resize`), `w-px` divider centered | `splitter.ts` |
| Toolbar pill | `bottom-4` (16px) from canvas bottom, centered | `DesktopToolbar.vue` |

**Splitter behavior (from `splitter.ts`, verbatim):** divider is
`pointer-events-none absolute bg-border transition-colors` and turns accent on
`group-data-[state=drag]:bg-accent`, `group-data-[state=hover]:bg-accent`, and
`group-focus-visible:bg-accent`. The handle gets `touch-none` and
`focus-visible:ring-1 focus-visible:ring-panel-focus`.

**Persistence (port their pattern exactly):** sizes saved to `localStorage` on splitter release;
the *opening* layout report must be ignored — open-pencil guards with a `1e-6` tolerance so a
resize report identical to the stored layout isn't re-saved (`EditorWorkspace.vue`:
`LAYOUT_TOLERANCE = 1e-6`). Key: `expoforge:editor-layout` = `[leftPct, canvasPct, rightPct]`.

### 2.3 Collapsible panels & chrome toggling

- `$mod+\` (⌘/Ctrl+Backslash) toggles all UI: panels + top bar hide, canvas fills the window.
  open-pencil keeps the toolbar pill visible and shows a `WorkspacePill` (a small floating
  "show UI" chip with the document name). ExpoForge: same — pill stays, everything else hides.
- Keyboard shortcuts keep working with UI hidden (open-pencil binds them on `window`, capture
  phase — see §3.10).
- "Play/preview" mode (`$mod+Alt+Enter` in open-pencil): our equivalent is Simulation (§8.6);
  it hides panels and top bar and shows the sim chrome.

### 2.4 Responsive behavior

- **≥1280px:** full layout as specified.
- **1024–1279px:** right panel default shrinks to 16%; left panel 18%.
- **768–1023px (tablet):** panels become overlays — left panel slides over the canvas from the
  left (`w-64`), right panel from the right (`w-72`), toggled by buttons in the top bar; both
  close on Escape and on outside pointer-down. Canvas is always full-bleed. The toolbar pill
  switches to open-pencil's mobile pattern: 3 category pages with prev/next arrows
  (`useToolbarState().mobileCategory`, `navigationAction` round buttons `size-7 rounded-full
  border border-border bg-panel shadow-sm`).
- **<768px:** out of scope (OPEN QUESTION: mobile/touch building — v1 desktop/tablet only).

---

## 3. Canvas interaction spec

### 3.1 Coordinate model

Viewport transform is `{ panX, panY, zoom }` on editor state (open-pencil model — no matrix
stack for the DOM canvas; each screen renders inside a `transform: translate(panX, panY)
scale(zoom)` wrapper). Conversions (verbatim from `packages/core/src/editor/viewport.ts`):

```ts
screenToCanvas: x = (sx - panX) / zoom; y = (sy - panY) / zoom
zoom clamp:     Math.max(0.02, Math.min(256, level))     // 2% – 25600%
anchor zoom:    panX' = cx - (cx - panX) * (newZoom / zoom)   // same for Y
```

### 3.2 Wheel pan/zoom — port `packages/vue/src/shared/input/wheel.ts` verbatim

The file is self-contained logic (only the final listener attach is Vue-specific). Constants,
quoted:

```ts
const PAN_SCALE = 2                    // wheel pans 2× its delta
const MAX_PAN_PER_EVENT = 120          // px, cap per event
const PINCH_ZOOM_PER_DELTA = Math.LN2 / 50   // trackpad pinch (Ctrl+wheel): 2^(-deltaY/50)
const WHEEL_ZOOM_PER_DELTA = 0.005     // mouse wheel zoom (⌘/Ctrl+notch): e^(-0.005·deltaY)
const MAX_ZOOM_STEP = Math.log(10)     // exponent clamp per event
const WHEEL_NOTCH = 120, MIN_WHEEL_NOTCH = 99, NOTCH_STEP = 8
const NOTCH_ACCELERATION = 2.5, NOTCH_ACCELERATION_WINDOW_MS = 50
const MAX_NOTCH_PAN = 120, MAX_NOTCH_ZOOM = 40
const NAVIGATION_SETTLE_DELAY_MS = 120
export const PINCH_SCALE_EXPONENT = 100 * PINCH_ZOOM_PER_DELTA   // for Safari gesture events
```

Behavior rules (all implemented in that file — port, don't reinvent):

- **Zoom intent** = `event.ctrlKey || event.metaKey`. Chromium encodes trackpad pinch as
  Ctrl+wheel with `deltaY = -100·ln(scale)`; zoom factor is `exp(-deltaY · LN2/50)` (capped by
  `MAX_ZOOM_STEP`). Mouse-wheel zoom (⌘+wheel / Ctrl+wheel-notches on Windows) uses
  `exp(-0.005 · deltaY)`.
- **Plain wheel pans** by `2×delta`, length-capped at 120px per event; `deltaMode` line=×40,
  page=×800; Shift converts vertical to horizontal when `|dx| < |dy|`.
- **Windows mouse notches** (integer deltas ≥ 99) move 8px per notch, accelerating ×2.5 per
  notch within a 50ms window in the same direction, capped at 120 (pan) / 40 (zoom).
- **Accumulate + rAF flush:** events accumulate into `{deltaX, deltaY, zoomScale, zoomCenterX/Y,
  hasZoom}` and flush once per animation frame — one `setZoomAroundPoint` or `pan` call per frame
  with the zoom anchored at the last cursor position (`event.clientX - rect.left`).
- **Settle phase:** after the last event, mark navigation "settling" for 120ms then "idle" (this
  drives render-quality downshifting in open-pencil; in our DOM canvas it drives a
  `data-navigating` attribute used to disable screen-internal shadows and backface effects while
  panning — see §3.11).
- Listener is `non-passive` with `preventDefault()` on the canvas element only.
- `zoomSpeed` option multiplies zoom distance (default 1). Expose in settings later.

### 3.3 Touch — port `packages/vue/src/shared/input/pan/zoom.ts` verbatim

- **Two fingers:** pinch-zoom + pan simultaneously. `pinchStartDist/pinchStartZoom` captured at
  second touch; on move: `setZoomAroundPoint(pinchStartZoom * (newDist/pinchStartDist), midX,
  midY)` then `pan(midDx, midDy)`; midpoint recomputed each event.
- **One finger:** with Hand tool (or Space held) → pan drag (`panX = startPanX + (x - startX)`).
  Otherwise the touch is converted to a **synthetic mouse event** (`new MouseEvent('mousedown',
  {clientX, clientY, button:0, buttons:1, bubbles:true})`) so tools/selection logic stays
  pointer-only. Port the `syntheticMouse` helper.
- `touchstart/move/end/cancel` all `passive:false` + `preventDefault()`.
- Safari: `setupSafariGestureZoom` (gesturestart/gesturechange) raises the WebKit-reported scale
  to `PINCH_SCALE_EXPONENT` power so it matches Chromium's pinch distance.

### 3.4 Space + drag, hand tool

- Space held anywhere → cursor becomes grab, dragging pans (open-pencil `useSpaceHeld()` +
  `bindSpaceHandTool`; releasing Space restores the previous tool).
- `H` key switches to the Hand tool persistently (their `TOOL_SHORTCUTS.KeyH`). Middle-mouse
  drag also pans (Figma behavior; open-pencil maps middle button in `useCanvasInput`).

### 3.5 Zoom commands & shortcuts (from `commands/registry.ts` + ZoomDropdown)

| Action | Shortcut |
|---|---|
| Zoom in | `⌘/Ctrl +=` (and `Shift+=` unmodified), step = `applyZoom(-100, centerX, centerY)` at viewport center |
| Zoom out | `⌘/Ctrl +-` (and `-` unmodified), step = `applyZoom(100, …)` |
| Zoom to 100% | `⌘/Ctrl+0` (and `Shift+0`) |
| Zoom to fit | `Shift+1` (and `⌘+1`) |
| Zoom to selection | `Shift+2` (and `⌘+2`) |
| Next / previous screen | `N` / `Shift+N` (open-pencil's frame navigation) |

`zoomToBounds` math (verbatim): padding 80px, `zoom = min(viewW/(w+160), viewH/(h+160), 1)`,
then `panX = (viewW - w·zoom)/2 - minX·zoom + 80·zoom` (same for Y). `revealNodes` margin: 48px.

### 3.6 Rulers & grid

- Rulers: 20px strips (`RULER_SIZE = 20`) top and left, `--color-ruler-bg/rgb(36,36,36)`, ticks
  `rgb(102,102,102)`, labels `rgb(140,140,140)`, toggle `Shift+R`. Ruler corner box 20×20.
- Pixel grid: visible when `zoom ≥ 8` (open-pencil default: shown unless explicitly off), toggle
  `Shift+'`; snap-to-grid toggle `⌘+Shift+'`. Grid lines `--color-border` at 1px canvas-unit
  spacing, rendered only when spacing ≥ 4 screen px.
- Dots grid for the empty canvas backdrop: 16-unit spacing (`BOARD_GRID = 16`), color
  `--color-border`, 2px dots (ExpoForge addition — canvas is DOM, draw a CSS
  `background-image: radial-gradient` pattern inside the pan/zoom transform layer).

### 3.7 Screens (artboards) & device frames — ExpoForge-specific

A **Screen** is the artboard unit. Data: `{ id, name, device, platform: 'ios'|'android', route,
tree: ComponentNode }`. Layout on canvas: horizontal flow, left→right, `DUPLICATE_FRAME_GAP =
40`-equivalent → **ExpoForge: 48px gap** between screens (tunable in settings).

Device presets (logical points, CSS px in react-native-web):
`iPhone 15/16 390×844`, `iPhone SE 320×568`, `iPad mini 768×1024`, `Pixel 8 412×915`,
`Galaxy S23 360×780`, `Desktop 1280×800` (OPEN QUESTION: full preset list + custom size editor
— needs product sign-off).

Frame chrome per platform (rendered as part of the screen element, **inside** the react-native-web
surface so it scales with zoom, but *excluded* from prop editing):
- **iOS:** status bar overlay (time 9:41, signal/wifi/battery glyphs, height 47pt at 390-width),
  Dynamic Island (126×37 rounded-full `#000` pill, top 11pt, centered) for 390-width presets,
  notch (with ears) for SE; home indicator (5pt bar, 134pt wide, bottom 8pt, `white/70`).
- **Android:** status bar (24dp: time left, icons right), gesture nav bar (24dp, 108×4dp pill
  centered) or 3-button nav.
- Screen name label above the frame: `text-[11px]` `--color-muted`, 8px above (`LABEL_OFFSET_Y =
  8`), bold on hover/selection. Below the frame: route badge `@/screens/login` in
  `--color-slot`, `text-[10px]`.
- Screen selection outline: 2px `#3b82f6` (`PENCIL_STROKE_WEIGHT = 2` equivalent), name label
  turns `--color-surface`.
- **Variant pairs:** iOS and Android variants of the same logical screen sit side by side with a
  24px gap and a shared bracket line (2px `--color-muted` under both + variant chips `iOS 15` /
  `Pixel 8`). Toggling the toolbar's platform switch highlights the active variant, dims the
  other to `opacity-60` (not hidden — both stay editable).

### 3.8 Selection, marquee, multi-select

- Single click selects the deepest component under the pointer; **deep-select modifier** is
  ⌘/Ctrl+click — in open-pencil ⌘/Ctrl reaches *through* groups ("hover reaches the deepest
  layer, the one a click would select"); ExpoForge: plain click selects the top-level component
  under cursor; ⌘/Ctrl+click cycles *into* nested children (each press descends one level);
  Shift+⌘+click selects the deepest node directly. Port open-pencil's `hoverDeep` semantics
  (`e.metaKey || e.ctrlKey`).
- Hit padding: 3.5px outside a component's bounds still selects it (`LAYER_HIT_PAD = 3.5`,
  "Figma desktop 126" — quote).
- Shift+click adds/removes from selection. ⌘/Ctrl+A selects all on the screen; `⌘+Shift+A`
  inverts.
- Empty-area drag = marquee (rubber band): fill `rgba(59,130,246,0.08)`
  (`MARQUEE_FILL_ALPHA = 0.08` on selection blue), 1px `#3b82f6` border.
- Selected component outline: 2px `#3b82f6`, dashed `opacity-60` (`SELECTION_DASH = [4,4]`,
  `SELECTION_DASH_ALPHA = 0.6`) for the *parent* of the selected node.
- **Resize handles:** 6×6px white-filled squares with 1px `#3b82f6` border
  (`HANDLE_HALF_SIZE = 3`), pointer hit radius 6px (`HANDLE_HIT_RADIUS = 6`). Corner handles
  resize; edge handles resize one axis; hold **Alt** to resize from center (ExpoForge addition);
  hold **Shift** to lock aspect.
- **Rotation handle:** 24px above the top-center handle (`ROTATION_HANDLE_DISTANCE = 24`), a
  6×6 connected dot; snapping every 15° (`ROTATION_SNAP_DEGREES = 15`) with a status readout.
- Size pill during resize: `padding 6px 6px`, height 18px, radius 4px, `bg #1e1e1e/90`,
  `text-[10px]` (`SIZE_FONT_SIZE = 10`, white text) centered below the selection.
- Distance measurement: hold **Alt** with a selection hovering another node — red measurement
  lines + pills (`MEASUREMENT_COLOR`, pill `padding-x 5, height 18, radius 3`,
  `MEASUREMENT_TEXT_BASELINE 4`). Port from open-pencil's `measurement.ts` overlay semantics.
- **Multi-selection:** union bounding box with handles; all children keep 2px outlines. `Tab` /
  `Shift+Tab` step to next/previous sibling *only when canvas has focus*
  (port `isCanvasFocus(event): event.target === document.body || canvas`); `Shift+Enter` /
  `\` selects parent; `Enter` opens the component (expands to children / enters edit).

### 3.9 Snapping (port `packages/scene-graph/src/snap.ts` semantics)

- Threshold: **5px in screen space** (`SNAP_THRESHOLD_SCREEN_PX = 5`; scene threshold 5 units).
- While dragging a component, its `{left, centerX, right} × {top, centerY, bottom}` are matched
  against every other component's same six lines (left-left, left-right, right-left,
  right-right, center-center — both axes, pairwise in one pass). Best (nearest) snap per axis
  wins; ties emit multiple guides.
- Guides render as 1px magenta `#ff0090` (`SNAP_COLOR`) full-span lines across the two nodes'
  common extent, visible only while snapped.
- Screen-frame edges snap too (a component dragged near its screen's edge snaps to 8px
  mobile-safe insets — ExpoForge addition: snap targets = screen bounds + 16/20px insets).
- Snapping disables while ⌘/Ctrl is held during a drag (override).
- Pixel-grid snap (§3.6) is a separate toggle and applies on drop, not during drag.

### 3.10 Keyboard map (port `src/app/shell/keyboard/registry.ts` pattern)

Implementation: a single `KeyBindingMap` (tinykeys) built from declarative
`ShortcutDefinition[]` — `{ id, keys, run, global?, view?, shouldPreventDefault? }` — attached on
`window` with `capture: true`. A shortcut **must not fire** when: focus is in an input/textarea
(`isEditing`), a button is mid-activation, an open menu/dialog/popover owns the keys
(`hasOpenDismissableLayer` — except undo/redo, which work through open pickers, as in Figma), or
a number field is focused. Escape and view-switching keys are `view: true` (survive
preview/sim). open-pencil uses tinykeys; **ExpoForge uses react `useHotkeys`/custom tinykeys —
same registry shape, port the guard logic verbatim.**

**Tools (single key, canvas focus):** `V` Select · `H` Hand · `S` Add Screen (ExpoForge) ·
`T` Text insert · flyout members get their own keys (§6.3).

**Editing:** `⌘Z` undo · `⌘⇧Z`/`⌘Y` redo · `⌘D` duplicate (40px offset) · `⌫`/`Delete` delete ·
`⌘G` group into View · `⌘⇧G` ungroup · `⌘⌥G` wrap in screen-flow node · `⌘A` select all ·
`⌘⇧A` invert · `⌘⇧H` hide · `⌘⇧L` lock · `]` bring to front · `[` send to back · `⌘]` forward ·
`⌘[` backward · `⌥⇧H`/`⌥⇧V` flip (adapt: scaleX/scaleY −1 on style) · `0–9` set opacity
(0=100%, 1=10%…, digit keys with no modifiers) · `⌘⌥C`/`⌘⌥V` copy/paste *properties* ·
`⌘R` rename selection (inline rename in tree).

**View:** zoom commands §3.5 · `Shift+R` rulers · `Shift+'` pixel grid · `⌘⇧+'` grid snap ·
`N`/`⇧N` next/prev screen · `⌘\` toggle UI · `⌘⌥Enter` toggle Simulation · `⌘J` toggle AI/chat
panel (if enabled) · `⌘K` command palette (ExpoForge; open-pencil uses ⌘K for create-component —
we choose palette, see OPEN QUESTION) · `⌘,` settings.

**Structure:** `Tab`/`⇧Tab` siblings · `Enter` open component · `Shift+Enter`/`\` select parent ·
`Escape` cancel drag (escapable drags: draw, rotate, connector-equivalents) or deselect.

---

## 4. Left panel spec

Root: `<aside class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border
bg-panel" style="contain: paint layout style">` (verbatim shell from `LayersPanel.vue`).

### 4.1 Panel tabs (top)

Segmented control (from `LayersPanel.vue`): `px-2 py-1.5` strip under the AppMenu area, options
**Screens** | **Components**. Under it, the vertical splitter: Screens list (default 30%,
min 10, max 60) over Layers tree (default 70%, min 20), handle theme from `splitter.ts`.

### 4.2 Screens list (port `page-list.ts` verbatim)

- Header: `flex items-center justify-between px-3 py-1.5`; title `text-[11px] font-semibold
  text-surface` ("Screens"); `+` button (`px-1 text-base leading-none text-muted hover:bg-hover
  hover:text-surface`) → opens the device picker menu (presets §3.7, grouped iOS/Android/
  Tablet/Desktop, with an "Empty screen" CTA at top).
- Rows: `flex h-6 w-full items-center gap-1.5 rounded px-2 text-left text-[11px] outline-none
  focus-visible:ring-1 focus-visible:ring-panel-focus`; inactive `text-muted hover:bg-hover
  hover:text-surface`; active `bg-hover text-surface`. Content: platform icon (`size-3
  opacity-70` — lucide `smartphone`/`apple`/`bot`), truncated name, trailing badges: device
  short-name chip (`text-[10px] text-muted`), platform dot (`iOS` `--color-surface` /
  `Android` `--color-success` — OPEN QUESTION: badge palette), route count.
- Reorder: drag rows to reorder flow; drop indicator `absolute inset-x-1 z-10 h-0.5
  rounded-full bg-accent` at `top-0`/`bottom-0` (verbatim). Dragging row `opacity-60`.
- Double-click → inline rename (input `min-w-0 flex-1 rounded border border-accent bg-input px-1
  py-0 text-[11px] text-surface outline-none`, verbatim), Enter commits, Escape cancels.
- Divider rows ("Onboarding", "Main" — screen groups) between list segments:
  `my-1 flex items-center px-2` with `h-px flex-1 bg-border` line + tiny label.
- Context menu on row: Rename, Duplicate (⌘D), Delete, Reveal in canvas (zoom-to-screen),
  Set as entry screen (marks route `/` badge).

### 4.3 Layers tree (adapt open-pencil `LayerTree` — node types change, mechanics identical)

Our tree shows the **selected screen's component tree** (expo components: View, Text, Image,
ScrollView, Pressable, TextInput, FlatList, custom components…). Port
`packages/vue/src/primitives/LayerTree/` mechanics with `layer-tree.ts` theme verbatim:

- Row: `group/row relative flex w-full cursor-pointer items-center gap-1 rounded pr-1 text-left
  text-[11px] text-surface hover:bg-hover` + `px-1` viewport (`scrollbar-thin overflow-y-auto`).
- Indent **16px per level** (open-pencil `useLayerDrag(editor, indentPerLevel = 16)`).
- Disclosure chevron: `w-4` slot, `transition-transform`, `rotate-90` when expanded; leaf rows
  get a `w-4` spacer (alignment preserved).
- Icon `size-3 opacity-70`; **component instances** get `text-component` tint; **slot children**
  (children prop content) `text-slot` — both verbatim semantics from `layer-tree.ts`, where
  `--color-component`/`--color-slot` mark component/slot rows.
- Selection: focused-panel selection = `bg-panel-selected text-on-accent`; when the *canvas* (not
  the panel) has focus, rows show `bg-panel-selected-muted text-surface` — port this two-state
  distinction (`selected × focused` compound variants).
- Hidden/locked: row `opacity-65` when hidden (icon `opacity-50` if selected); lock and eye are
  hover actions: `actions` slot `flex gap-0.5`, each action `flex size-4 items-center
  justify-center rounded hover:bg-white/15 focus-visible:ring-1
  focus-visible:ring-panel-focus`, icons `size-3`, revealed via `opacity-0 group-hover/row:
  opacity-100 group-focus-within/row:opacity-100`.
- Inline rename: double-click or `⌘R`; rename row/input classes verbatim (§4.2).
- **Drag reorder (pragmatic-drag-and-drop, port `useLayerDrag.ts`):** instructions from
  `@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item` (`attachInstruction`/`extractInstruction`).
  Allowed ops per row: `make-child` (drop on center → becomes child of container), `reorder-
  above`, `reorder-below`, `reparent` (drop on empty area). Containers that can't accept
  children (Text, Image) block `make-child`. Indicators, verbatim from `layer-tree.ts`:
  above `dropIndicator: 'top-0 h-0.5'` (2px accent line), below `bottom-0 h-0.5`, child-drop
  target `row: 'bg-accent/15 text-surface'` + `dropIndicator: 'inset-y-1 rounded border
  border-accent bg-accent/10'` (full-row highlight + inset outline). Dragged row `opacity-30`.
- Empty screen: centered `AppPlaceholder` — muted icon, "This screen is empty", "Drag a
  component from the palette".
- Sticky group headers when scrolling long trees (port `LayerTreeStickyRow`).

### 4.4 Component palette (Components tab; port `AssetsPanel.vue` patterns)

- Header: search input (`AppInput` sm, placeholder "Search components…", ⌘F focuses — OPEN
  QUESTION: ⌘F vs browser find), filter chips: All / Layout / Media / Lists / Inputs /
  Feedback / Navigation / Custom.
- Grid of palette cards: 3–4 columns, each card `rounded border border-border bg-panel-secondary
  p-2` with a 48×48 mini-preview (renders the actual component via react-native-web at 0.6×
  scale — same renderer as canvas, see `02-canvas-architecture.md`), name `text-[11px]
  truncate`, category tag `text-[10px] text-muted`. Hover: `border-muted bg-panel-field`.
- **Drag source — HTML5 DnD, port open-pencil's `AssetsPanel` + `canvas/drop` pair verbatim in
  mechanism:**

  ```ts
  // Palette card (drag source) — mirrors AssetsPanel.vue onDragStart:
  event.dataTransfer.setData('application/x-expoforge-component', componentKey)
  event.dataTransfer.effectAllowed = 'copy'
  // also set a generated PNG thumbnail via setDragImage for the drag ghost

  // Canvas (drop target) — mirrors packages/vue/src/canvas/drop/use.ts:
  const MIME = 'application/x-expoforge-component'
  // dragover/dragenter: if types includes MIME or 'Files' → preventDefault(),
  //   dataTransfer.dropEffect = 'copy', show drop overlay
  // drop: dropPoint = screenToCanvas(clientX - rect.left, clientY - rect.top)
  //   → find parent container under point → insert node at point (centered on cursor)
  ```
- Drop-target computation: while dragging over the canvas, the hovered container gets the
  selection-outline treatment in `--color-slot` and candidate insertion index markers
  (Figma-style blue insert bar) — port `findMoveDropTarget` + `cycleSafeTarget` semantics:
  never drop a subtree into itself; nearest accepting container wins.
- Double-click card inserts at viewport center into the active screen. Keyboard: cards are
  focusable; Enter inserts (port `onAssetKeydown`: Enter/Space insert, ⌘Enter opens details).
- "Custom" category lists user-defined components (created via ⌘⌥K from selection) with the
  `--color-component` tint. Right-click card: Insert, Rename, Delete, Show usages.

---

## 5. Right panel spec

Root aside mirrors the left (`border-l border-border bg-panel`, `contain: paint layout style`).
Header strip `border-b border-border px-1.5 py-1.5` holds: selection summary chip
(`"Button" · 3 selected`), Simulation ▶ button (primary accent, `controlHeight.sm`).

### 5.1 Tabs (port `PropertiesPanel.vue` structure)

Tabs list styled with `properties-tabs` theme (`src/theme/panel/properties-tabs.ts`): 4 tabs —
**Props · Style · Flow · Code** — `text-[11px]`, active underlined accent; when nothing is
selected, tabs show document-level content (§8.4). Tabs keep state while hidden
(`force-mount` + `hidden` pattern from open-pencil — keeps Code tab's scroll and Flow editor
state).

### 5.2 Section pattern (port `src/theme/panel/section.ts` verbatim)

Every group in Props/Style uses collapsible sections:

```
root:    'border-b border-border px-3 pb-3 text-surface data-[disabled]:opacity-60'
header:  'flex h-8 min-w-0 items-center gap-1.5'   // chevron + title + actions
title:   'text-[11px] font-semibold text-surface'  // entire header clickable to collapse
actions: 'flex h-7 w-[26px] justify-end …'          // hover icon-buttons, size-6, rounded
```

Field rows use the `panel-grid` pattern: label (fixed ~64px) + fields grid (`grid-cols-2`/
`grid-cols-3` or `wide-first` 7fr/5fr) + actions rail (`w-[26px]`, e.g. bind-variable icon,
detach icon). Header rows for the selected component use `panel-header.ts`
(`grid-cols-[auto_minmax(0,1fr)_auto] px-3 py-2`, icon + `text-xs font-semibold` name, actions).

### 5.3 Props tab

Per-component schema-driven editors for RN component props, grouped: **Content** (Text `children`,
source URLs, `numberOfLines`, etc.), **Interaction** (`onPress`, `disabled`, hitSlop),
**Advanced** (testID, accessibilityLabel, nativeID, collapsable…). Each prop row: label, type-
appropriate control (switch → toggle; enum → segmented/select; string → input sm; number →
NumberField §5.6; multi-line → textarea sm). Props whose values differ across selection show
MIXED (§5.5). "Bind to state" icon-button per prop (rail) opens the binding popover — binds prop
to a flow variable (§5.5/5.4). Unknown/custom component props render from the component's
TypeScript prop types.

### 5.4 Style tab — the RN inline-style editor

Mirrors open-pencil's section pattern (`PositionSection`, `AppearanceSection`,
`TypographySection` → ours):

- **Layout** — flexbox: `flexDirection` (segmented 4-way icon control), `justifyContent`,
  `alignItems` (icon segmented), `alignSelf`, `flexWrap`, `flex` (grow/shrink/basis row),
  `gap` (rowGap/columnGap 2-field), `position` (`relative|absolute` + absolute inset grid:
  3×3 NineSegment + inset fields).
- **Spacing** — 4-field margin/padding grid (open-pencil's 2×2 layout: top/right/bottom/left
  with linked-chain toggle that applies one value to all).
- **Sizing** — width/height (auto|fill|px|%|hug-for-content segmented + number), `minWidth/
  maxWidth/minHeight/maxHeight`, `aspectRatio`.
- **Typography** — fontFamily (searchable picker), fontSize, fontWeight (segmented 400/500/600/
  700), fontStyle, lineHeight, letterSpacing, textAlign (icon segmented), textTransform,
  textDecorationLine, color (ColorField §5.6.1).
- **Appearance** — backgroundColor, opacity (0–100 slider + number), borderRadius (single or
  per-corner 4-field with link toggle), borderWidth + borderColor (per-side via advanced
  disclosure), overflow (`visible|hidden`), shadow (iOS: offset/opacity/radius/color; Android:
  elevation), tint color, `pointerEvents`, z-index.
- **Style source toggle** at top of tab: `Style | Tailwind` (OPEN QUESTION: p2 — generated
  StyleSheet vs className editing; v1 edits the style object only).

Fields write `style` on the node; the canvas live-updates via the same render path. Every edit
is undoable as one step (§5.6 commit semantics).

### 5.5 Flow tab

Edits the selected component's **action chains** (event → effect list) and state bindings:

- Events list from the component's props (onPress, onChangeText, onSubmitEditing…) each with a
  chain: [Navigate to screen ▾] [Set state ▾] [Call API ▾] [Alert ▾] [+ Add action].
- Actions as rows: icon, type label, inline param editor (screen picker / state key picker /
  method+URL), drag-reorder within chain, delete on hover.
- **State panel (collapsible section):** project state variables (key, type, initial value) +
  "bound props" indicator chips; binding a prop row (§5.3) creates `{state}` binding shown in
  the field as a chip instead of the literal value (port open-pencil's variable-binding visuals:
  bound fields render the value in `--color-component` with a link icon; the rail icon button
  toggles bind/unbind).
- Empty state per event: "No actions — press + to add the first one."

### 5.6 Field components

**NumberField (scrub-commit — port open-pencil semantics from `node-props/helpers.ts` +
`prop-scrub/use.ts`):** input sm (`h-7`, `bg-panel-field`, `focus-visible:ring-panel-focus`);
label-drag scrubs the value (pointer down on label/field background → horizontal drag, 1px =
1unit, Shift = ×10, Alt = ×0.1); during scrub, live-preview updates apply **without** history
(`preview.update(...)`); on pointer-up one undo entry is committed labeled `Change {prop}`
storing the *pre-scrub* value per node (`storePreviousValues` map — multi-selection restores
each node's own previous value, not a shared one); Escape cancels back to pre-scrub value;
ArrowUp/Down ±1 (Shift ±10); unit suffix support (px, %, ms) with bare-number entry allowed.

**ColorField:** swatch button (shows current color or MIXED checkerboard using
`--color-checkerboard`/`--color-checkerboard-muted`) → popover with the `floatingSurface`
chrome: OKLCH sliders (port `okhcl` control: hue rail, chroma, lightness, alpha), hex input,
recent colors, and named-token list (design tokens defined per project), plus "clear" for
transparent.

**MIXED sentinel (port verbatim):**

```ts
export const MIXED = Symbol('mixed')
export type MixedValue<T> = T | typeof MIXED
// prop() across the selection: if any node's value differs from the first → MIXED
// if (all.length === 0) return MIXED
// for (i…) if (all[i][key] !== first) return MIXED
```

Mixed display: controls show an em-dash "—" placeholder styled `text-muted`; **focusing and
typing/scrubbing a mixed field commits the typed value to ALL selected nodes** (that's
`updateAllWithUndo`); leaving the field untouched commits nothing. Multi-edit of arrays (e.g.
per-corner radii) uses per-item MIXED comparison (`isNodeArrayMixed`).

**Select/segmented:** shadcn Select in sm size, or `SegmentedControl` (icon segmented, from
open-pencil's `SegmentedControl.vue` pattern) for ≤4 options; "Mixed" appears as a disabled
first option when MIXED.

### 5.7 Code tab

Live-generated snippet for the selected node(s): the JSX/TSX that the exporter produces
(`import { View, Text } from 'react-native'` … node tree with props + style object), in a
CodeMirror 6 editor themed with the token syntax colors (`--color-code-keyword: #c4a7e7`,
`--color-code-tag: #82aaff`, `--color-code-string: #a3d9a5`, `--color-code-number: #e5bc8b`,
`--color-code-comment: #969eaa`) on `bg-panel-secondary`. Read-only v1 with a Copy button
(clipboard + "Copied" toast) and a target selector: `Node | Screen | File`. Regenerates
debounced 150ms after edits; syntax-highlight async so typing in Style never blocks.

---

## 6. Bottom toolbar spec

### 6.1 Pill container (verbatim from `DesktopToolbar.vue`)

```html
<div class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center">
  <div role="toolbar" aria-label="Editor tools"
       class="flex gap-0.5 rounded-xl bg-panel p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]">
    …tool buttons…
    <div class="mx-1 h-5 w-px bg-border"/>   <!-- separator before right cluster -->
    …right cluster…
  </div>
</div>
```

Right-click on the pill opens **Customize toolbar** (drag to reorder/hide, port
`ToolbarContextMenu` + the customize dialog structure from `layout.ts`'s `toolbarRows` — v2
feature, ship fixed order v1 but keep the data model `ToolbarLayout { groups: Entry[][],
hidden: Entry[] }` from day one).

### 6.2 Button spec (from `toolbar.ts`, verbatim)

```
button:   'flex size-8 cursor-pointer items-center justify-center border-none bg-transparent
           text-muted transition-colors outline-none rounded-lg
           focus-visible:ring-1 focus-visible:ring-panel-focus'
icon:     'size-4'
active:   'bg-accent text-on-accent'    // aria-pressed="true" + data-active
inactive: 'hover:bg-hover hover:text-surface'
flyoutTrigger: 'flex h-8 w-3 … data-[state=open]:bg-hover data-[state=open]:text-surface' + chevron size-2.5
```

### 6.3 Tools (left cluster, fixed order v1)

| Tool | Key | Icon (lucide) | Behavior |
|---|---|---|---|
| Select | `V` | `mouse-pointer-2` | default tool; marquee, select, move |
| Hand | `H` | `hand` | pan |
| Add Screen | `S` | `smartphone` | click canvas → device-picker popover at cursor; drag on canvas → places default device (390×844) sized by drag |
| Text | `T` | `type` | click/drag inserts Text component, enters inline text edit |
| Insert: Layout (flyout) | `W` | `box` | View `W`, ScrollView `⇧W`, KeyboardAvoidingView, SafeAreaView |
| Insert: Media (flyout) | `M` | `image` | Image `M`, BackgroundImage, Video (expo-av) |
| Insert: Lists (flyout) | `L` | `list` | FlatList `L`, SectionList, ScrollView list |
| Insert: Inputs (flyout) | `I` | `text-cursor-input` | TextInput `I`, Switch `⇧I`, Slider, Checkbox, Radio |
| Insert: Feedback (flyout) | `B` | `message-square` | Button `B`, Pressable, Touchable, ActivityIndicator |

Flyout member keys mirror open-pencil (`KeyR` rectangle, `KeyO` ellipse, `KeyL` line within one
flyout): one key per member, listed above.

### 6.4 Flyout behavior (port `ToolbarRoot.vue` + `useToolbarState` exactly)

Structure: `[ToolButton showing selected member][chevron trigger]` group (`flyoutGroup: 'flex
items-center'`). The dropdown opens `side="top" side-offset={8} align="start"` with
`floatingSurface` + menu item styling (§1.7), items are **radio** items with check indicator
(`size-3.5`), icon (`size-3.5`), label, right-aligned shortcut.

Selection memory, verbatim semantics from `ToolbarRoot.vue`:

```ts
// flyoutSelections = Map<ToolKey, ToolKey>  (tool → last-used member)
watch(activeTool, (t) => { for (const tool of tools)
  if (tool.flyout?.includes(t)) flyoutSelections.set(tool.key, t) })

// What the flyout's button shows:
function getToolbarToolSelection(tool, activeTool, flyoutSelections) {
  if (tool.flyout?.includes(activeTool)) return activeTool   // active member wins
  return flyoutSelections.get(tool.key) ?? tool.key          // else last used, else default
}
// Flyout trigger is highlighted (active style) when activeTool ∈ tool.flyout (isToolbarToolActive)
```

### 6.5 Right cluster

1. **Platform variant toggle** — segmented 2-up: `Apple` / `Bot` lucide icons in a
   `bg-panel-field rounded-lg p-0.5` track, active side `bg-panel-selected-muted`; switches the
   canvas' active variant per screen (§3.7). Single-variant screens show both sides disabled
   with `+` mini-button to create the missing variant.
2. **Zoom dropdown** — port `ZoomDropdown.vue` verbatim in behavior: trigger `ml-auto rounded
   px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover` showing `Math.round(zoom*100)%`; menu
   (`min-w-52`, `side="bottom" side-offset={4} align="end"`) contains: editable zoom input
   (`border border-border bg-input px-2 py-1 text-xs`, click to edit, Enter commits
   `zoomToLevel(n/100)`, Escape cancels), separator, Zoom in/out, Zoom to fit (⇧1), presets
   **50% / 100% / 200%** with check marks (`Math.abs(zoom - level) < 0.005` active test),
   separator, toggles: Pixel grid, Snap to pixel grid, Rulers — each with check mark.
3. **Simulation button** — `▶` primary button: `h-7 rounded-lg bg-accent px-2.5 text-[11px]
   font-medium text-on-accent hover:brightness-110` with `play` icon; during sim it becomes
   `■ Stop` in `--color-error-fill`. Tooltip: "Start simulation (⌘⌥↵)".

---

## 7. Micro-interactions & motion (framer-motion ports of open-pencil's motion tokens)

open-pencil animates with tw-animate-css classes; ExpoForge uses framer-motion for the same
durations/curves so the feel is identical. **Reduced motion:** every framer spec below runs
`transition.duration = 0` when `useReducedMotion()` OR the app's `[data-motion='off']` root
attribute is set (port their dual gate).

| Interaction | Spec |
|---|---|
| Menus/popovers/selects/flyouts (open) | opacity 0→1, scale 0.95→1, 150ms `ease-out`, slides 4px from its side (`data-side` equivalent); **no close animation** for menus ("a fading-out modal menu would still block the canvas" — close is instant) |
| Dialog/modal overlay | fade 180ms ease-out in, 120ms ease-in out |
| Tooltip | fade 120ms in (open-pencil `Tip` uses the same floating surface; 300ms hover delay) |
| Panel collapse/expand (tabs in right panel) | height auto-animate 150ms ease-out; content cross-fade 150ms in / 75ms out (`swapTransition`) |
| Left-panel detail drill (palette → component details) | new view slides in 12px from right + fade, 150ms ease-out; back out 100ms ease-in (`drillInTransition` — port `enter: 150ms / leave: 100ms`) |
| Toolbar button hover | background-color 150ms `transition-colors` (CSS, not framer) |
| Flyout open state | trigger gets `data-[state=open]:bg-hover` instantly (no transition on the trigger) |
| Palette card drag ghost | native HTML5 `setDragImage` (screenshot thumbnail at 0.8 opacity, slight 2px scale via pre-rendered canvas) |
| Drop-target highlight (canvas container) | outline fades in 100ms; insert bar (2px accent) animates `top` with spring `{stiffness: 500, damping: 40}` |
| Tree drop indicators | no motion (appear instantly, Figma behavior) |
| Toast | enters `bottom-4 right-4` stack, fade+8px-up 150ms; auto-dismiss 4s with 100ms fade; error toasts persist with close button (port `AppToaster` positioning; surface = `floatingSurface`) |
| Screen name label | on selection, label color transition 150ms |
| Zoom-navigating canvas | while `data-navigating` (settle window §3.2): screen-internal CSS shadows & images render a cheap pass (opacity-preserved snapshots) — motion spec: none (it's a render downgrade, not animation) |
| Command palette | overlay fade 120ms; list items: none; search field auto-focus |

Durations are short by design (75–180ms). Nothing in the builder chrome animates longer than
180ms except toasts' lifetime.

---

## 8. States

### 8.1 Empty project (first run)

Canvas shows: centered stack — logo mark (48px), headline "Let's build your first screen"
(`text-[13px] font-semibold text-surface`), sub "Pick a device and ExpoForge scaffolds the
route, navigator, and app.json entry." (`text-[11px] text-muted`), CTA row of 4 device cards
(iPhone 15 / Pixel 8 / iPad mini / Custom) — `rounded-xl border border-border bg-panel-secondary
p-3 w-32`, hover `border-muted`; below, `text-[10px] text-muted` hint "or press S". Choosing a
card creates screen #1, zooms to fit, and opens the palette tab. Left panel Screens list shows
one row; Layers tree shows the screen's root; right panel shows document tab (§8.4).

### 8.2 Loading

- Project load: splash pattern from open-pencil — `bg-canvas` full-screen with centered logo
  pulse (`animate-pulse motion-reduce:animate-none`) + `text-[11px] text-muted` status line
  cycling "Loading project… / Restoring screens… / Preparing canvas…". Canvas mount is
  non-blocking; screens appear as they hydrate (stagger 50ms fade-in each).
- Sim boot (§8.6): screen shows device frame with centered `ActivityIndicator`-equivalent
  spinner + "Bundling with Metro…" percentage; >3s shows "First bundle takes a moment".

### 8.3 Error

- **Canvas error** (e.g., a screen's component throws): the failing screen renders an error
  card *in place of the frame* — `rounded-xl border border-[--color-error-border]
  bg-[--color-error-bg] p-3` with error name (`text-[11px] text-[--color-error]`), message
  (`text-[10px] text-muted`), "Open in Code" ghost button; other screens unaffected.
- **Save/commit error:** toast, error variant (`--color-error` icon + border), with Retry.
- **Fatal load error:** centered empty-state card, headline in `--color-error`, "Reload" and
  "Download diagnostics" buttons.

### 8.4 Empty canvas vs selection states (right panel)

| Selection | Right panel content |
|---|---|
| Nothing selected | Tabs show document-level: Props → Project settings (name, package id, scheme); Style → theme tokens editor (colors/typography); Flow → app-level state + navigation graph summary; Code → `App.tsx` + `app.json` preview |
| Single node | All four tabs per node (§5) |
| Multi-select | Tabs show MIXED (§5.5); header chip "3 selected"; Style edits apply to all; Flow tab disabled (`data-[disabled]:opacity-60`) |
| Mixed types (e.g. Text + View) | Props shows only shared props (id/name/style subset) + "Editing 2 component types" note; Style shows only shared properties |
| Screen frame selected | Props = screen props (name, route, device, entry-point toggle); Style = screen bg + safe-area settings |

### 8.5 Selection state summary (canvas)

None → cursor default (arrow). Hover → 2px `#3b82f6` at 40% opacity. Selected → 2px `#3b82f6`
solid + handles. Multi-select → union box with handles + 2px outline on each item.
Deep-target hover (⌘/Ctrl held) → nested child outlined 1px dashed `#3b82f6`/60% (open-pencil
parent-outline dash `[4,4]`, `SELECTION_DASH_ALPHA = 0.6`).

### 8.6 Simulation mode

Enter via ▶ / `⌘⌥Enter` / Play in header strip. Chrome: top bar + both panels + toolbar pill
slide out (framer: x ±100%, 150ms ease-in, panels `width` animate for canvas reflow — OPEN
QUESTION: overlay vs reflow); a slim sim bar docks top: `h-9 bg-panel border-b border-border`
with back-to-editor `×` (Escape), screen-route breadcrumb, hot-reload indicator, and platform
switch repeat. The **simulated screen** renders at device scale in the center of the canvas
(Zoom-to-fit on it), with:

- Device frame glow: `box-shadow: 0 0 0 2px #3b82f6, 0 8px 30px rgb(0 0 0/0.4)` (2px accent
  ring + the standard float shadow).
- "SIMULATING" badge: top-right of frame, `rounded-full bg-accent px-2 py-0.5 text-[10px]
  font-medium text-on-accent` with a pulsing dot (`animate-pulse`).
- Interactions inside the screen are live (real RN events); flow actions run against the local
  sim runtime. Canvas pan/zoom stays active; other screens dim to `opacity-40`.
- Exit restores previous viewport exactly (viewport snapshot on enter, restore on exit).

---

## 9. Accessibility

### 9.1 Focus management

- App is a roving tabindex surface: canvas is focusable (`tabindex="0"`, `role="application"`,
  `aria-label="Design canvas"`); click anywhere in it moves focus (tool keys then work — the
  `isCanvasFocus` guard §3.10).
- Panels: each aside gets a labeled landmark (`aria-label="Screens and layers"` /
  `aria-label="Properties"`). Tab order: top bar → left panel interactive controls → canvas →
  right panel → toolbar (DOM order achieves this; floating pill is last in DOM).
- `focus-visible:ring-1 focus-visible:ring-panel-focus` on **every** interactive element
  (non-negotiable, it's on every open-pencil class listed above). Splitters: focusable,
  arrow-keys move by 1% (Shift: 5%), `Home/End` min/max.
- Canvas keyboard editing: arrow keys nudge selection 1px (Shift: 10px) — Figma/open-pencil
  `nudge.ts` semantics; Tab family per §3.10. Focus never escapes to browser chrome except via
  F6 cycling regions (top bar → left → canvas → right).

### 9.2 Roles

- Layers tree: `role="tree"`, rows `role="treeitem"` with `aria-level`, `aria-expanded` on
  containers, `aria-selected`; container = `role="group"`. Rename input announces via
  `aria-label="Layer name"`.
- Screens list: `role="listbox"` / `role="option"` (`aria-selected`), drag handles are separate
  `aria-roledescription="draggable"` buttons with keyboard move (⌥↑/⌥↓).
- Toolbar: `role="toolbar"` with `aria-orientation="horizontal"`; tool buttons `aria-pressed`;
  flyout trigger `aria-haspopup="menu"` + `aria-expanded`.
- Palette grid: `role="grid"`-like list of buttons with `aria-label="{name}, {category},
  press Enter to insert"`.
- Zoom dropdown, menus: standard Radix roles (menu/menuitemradio/menuitemcheckbox).
- Mixed-value fields: `aria-label="{Prop}, mixed values"`. Scrub labels: hidden
  `aria-label="Scrub {prop} value"` instruction (`aria-describedby`).
- Toasts: `role="status"` (`aria-live="polite"`); errors `role="alert"`.

### 9.3 Keyboard-only flows (all must work without pointer)

Create screen (S → menu → Enter) · insert component (palette Tab navigation → Enter) ·
rename (⌘R) · move (arrows/nudge) · reorder layers (Alt+↑/↓ moves selection in tree — pragmatic-
dnd keyboard mode) · edit any property (Tab to field, type) · collapse sections · zoom (§3.5) ·
undo/redo · simulate (⌘⌥Enter) · escape hatches everywhere (Escape always: closes top-most
layer — menu > dialog > rename > drag > selection, port open-pencil's `escapeOrDeselect`
priority chain).

---

## 10. Open questions (tracked for resolution)

1. **OPEN QUESTION:** ⌘K — command palette (ExpoForge choice) vs open-pencil's
   create-component. Also should the palette be `⌘P`-style fuzzy router (screens + props +
   actions)? Default in this doc: ⌘K palette.
2. **OPEN QUESTION:** Device preset list & custom-size editor UX (§3.7) — need product
   sign-off; current defaults: iPhone 15, iPhone SE, iPad mini, Pixel 8, Galaxy S23, Desktop.
3. **OPEN QUESTION:** Platform badge colors in Screens list (§4.2) — proposed
   iOS `--color-surface` / Android `--color-success` (green robot).
4. **OPEN QUESTION:** Palette search focus key — ⌘F (conflicts with browser find only in
   dev; open-pencil doesn't bind it) vs `/`.
5. **OPEN QUESTION:** Simulation layout — panels overlay canvas (canvas keeps size, panels
   slide over) vs reflow (panels exit, canvas grows). Spec assumes reflow.
6. **OPEN QUESTION:** Style tab "Tailwind mode" (§5.4) — v2 or v1.1? Affects whether the style
   editor edits objects or class strings.
7. **OPEN QUESTION:** Multi-screen simultaneous edit in sim (Framer multiplies screens) — v1
   sims one screen only; confirm.
8. **OPEN QUESTION:** Light theme enablement date (tokens ported; switch UI not built).
9. **OPEN QUESTION:** Collaboration/presence UI (open-pencil has cursors/rooms) — out of scope
   v1, but the canvas layer should reserve `--color-component`-style peer colors to avoid
   re-picking later.
10. **OPEN QUESTION:** Mobile/tablet building below 768px (§2.4) — confirmed out of scope v1?

---

## Appendix A — Verbatim source index

| Value/class | open-pencil file |
|---|---|
| All color tokens (dark+light) | `src/theme/tokens.css` |
| `floatingSurface` / `tooltipSurface` | `src/theme/overlay.ts` |
| Toolbar pill + button/flyout classes | `src/components/toolbar/DesktopToolbar.vue`, `src/theme/toolbar.ts` |
| Tool/flyout selection memory | `packages/vue/src/primitives/Toolbar/{ToolbarRoot.vue,useToolbarState.ts}` |
| Toolbar layout model | `src/app/editor/toolbar/layout.ts` |
| Zoom dropdown | `src/components/editor/ZoomDropdown.vue` |
| Wheel math | `packages/vue/src/shared/input/wheel.ts` |
| Touch pinch/pan | `packages/vue/src/shared/input/pan/zoom.ts` |
| Viewport actions/formulas | `packages/core/src/editor/viewport.ts` |
| Snap algorithm | `packages/scene-graph/src/snap.ts` |
| Selection/marquee/handle/ruler constants | `packages/core/src/constants.ts` |
| Splitter sizes + persistence | `src/components/editor/EditorWorkspace.vue`, `src/theme/splitter.ts` |
| Panel section/grid/header classes | `src/theme/panel/{section,grid,header}.ts` |
| Layer tree classes + DnD | `src/theme/layer-tree.ts`, `packages/vue/src/primitives/LayerTree/useLayerDrag.ts` |
| Screens list classes | `src/theme/page-list.ts` |
| Palette DnD MIME pattern | `src/components/assets-panel/AssetsPanel.vue`, `packages/vue/src/canvas/drop/use.ts` |
| MIXED sentinel + scrub-commit | `packages/vue/src/controls/node-props/helpers.ts`, `packages/vue/src/controls/prop-scrub/use.ts` |
| Keyboard registry pattern + guards | `src/app/shell/keyboard/registry.ts` |
| Command keybindings | `packages/vue/src/editor/commands/registry.ts` |
| Menu/command-palette/tab-bar themes | `src/components/ui/menu/menu.ts`, `src/theme/command-palette.ts`, `src/theme/tab-bar.ts` |
| Motion durations/transitions | `src/theme/motion/styles.ts` |
