# Open Pencil — Editor Chrome Study for ExpoForge

Study of `github.com/open-pencil/open-pencil` @ main (cloned to `/home/z/my-project/research/open-pencil`, v0.16.0, MIT).
Goal: extract concrete, portable UI values for ExpoForge's editor chrome (toolbar, panels, icons, menus, popovers, canvas presentation).

---

## 1. Stack & repo layout

- **Monorepo** (Bun workspaces + Vite). Root `package.json` name `open-pencil-app`.
  - **The editor app is NOT a package** — it lives at the repo root in `src/` (Vue 3.5 SFCs, single Vite app).
  - `src/components/**` — all editor chrome components (toolbar, LayerTree, properties, ui primitives).
  - `src/theme/**` — **one `.ts` file per component**, each exporting a `tailwind-variants` theme object. This is the single best thing to imitate: theme files are data, components are structure.
  - `src/app/**` — state/stores/commands (no markup except overlay hosts).
  - `packages/vue` (`@open-pencil/vue`) — headless Vue primitives (NumberField, LayerTree, Toolbar, PropertySection, canvas input) reusable across apps.
  - `packages/core` — editor model + **Skia (CanvasKit-WASM) canvas renderer**; all canvas chrome constants in `packages/core/src/constants.ts`.
  - `packages/scene-graph`, `pen` (file format), `fig` (Figma import), `dom-css`, `design-jsx`, `cli`, `mcp`, etc.
  - `desktop/` — Tauri shell.
- **Key deps** (root `package.json`): `vue ^3.5.43`, `reka-ui ^2.10.5` (the Radix-Vue successor — all menus/popovers/tabs/tooltips primitives), `tailwindcss ^4.3.3` + `@tailwindcss/vite` (**Tailwind v4, CSS-first `@theme` tokens, no tailwind.config**), `tailwind-variants ^3.3.1`, `tw-animate-css ^1.4.0` (enter/exit animation utilities), `@floating-ui/vue ^1.1.11`, `unplugin-icons ^23.0.1` + `@iconify-json/lucide ^1.2.139`, `@vueuse/core`.
- **Window layout** (`src/components/editor/EditorWorkspace.vue`): 3-pane reka-ui `SplitterGroup` (horizontal): `layers` panel (default **18%** width, min 10%, max 30%) | canvas | `properties` panel (**fixed 256px opening width** converted to %, min 10% max 30% — `src/app/shell/layout-storage.ts`: `DEFAULT_LEFT_PANEL = 18`, `DEFAULT_RIGHT_PANEL_WIDTH = 256`, nominal window 1280px). Above it a 36px tab bar (`src/theme/tab-bar.ts`: `h-9`). Splitters (`src/theme/splitter.ts`): 8px-wide invisible hit area (`-mx-1 w-2 cursor-col-resize`) over a 1px divider that turns **accent** on hover/drag.

> ExpoForge parallel: they are Vue+Tailwind4+tailwind-variants, we are React+Tailwind+tailwind-variants — the *theme data files and numeric constants port 1:1*; component logic maps to Radix/shadcn equivalents.

---

## 2. Toolbar

Files: `src/components/toolbar/{DesktopToolbar,ToolButton,ToolFlyout,ShapeToolButton,EditorToolbar}.vue`, theme `src/theme/toolbar.ts`, layout model `src/app/editor/toolbar/layout.ts`, tool registry `packages/core/src/editor/tool-registry.ts`.

**Position & container** (DesktopToolbar.vue):
- `absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center` — floating pill, **16px from bottom edge, horizontally centered** over the canvas (canvas pane is a flex child; toolbar is a sibling absolutely positioned inside it).
- Pill: `flex gap-0.5 rounded-xl bg-panel p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]` → **radius 12px (rounded-xl), padding 4px, 2px gap between buttons, panel bg #2a2a2a, drop shadow 0 8px 30px rgba(0,0,0,.4)** — the same shadow is reused on every floating surface (see §8).
- `data-canvas-obstacle` attribute marks it so canvas overlays can exclude it.

**Buttons** (theme/toolbar.ts):
- Tool button: `size-8` (**32×32px**), `rounded-lg` (8px) on desktop, transparent bg, icon `size-4` (**16px**), text color `--color-muted` (#a6a6a6).
- Hover (inactive): `hover:bg-hover hover:text-surface` (#353535 / #f0f0f0). Active tool: **`bg-accent text-on-accent`** (#2563eb bg, white icon), no transition on active state other than `transition-colors`.
- Focus: `focus-visible:ring-1 focus-visible:ring-panel-focus` (1px ring #3b82f6).
- `aria-pressed` + `data-active` set on the button; `ToolbarButton` from reka-ui.

**Control order (default layout)** — from `EDITOR_TOOLS` in `packages/core/src/editor/tool-registry.ts`, rendered left→right:
1. **Move** (SELECT, V) — pinned, never hideable (`PINNED_TOOLBAR_ENTRY` in layout.ts)
2. **Frame flyout** (F): Frame ▸ Section (Shift+S)
3. **Shape flyout** (R): Rectangle ▸ Line (L) ▸ Ellipse (O) ▸ Polygon ▸ Star
4. **Pen flyout** (P): Pen ▸ Pencil (Shift+P)
5. **Text** (T)
6. *(hidden by default, appear when enabled: Sticky note, Shape, Connector)*
7. **Hand** (H)
8. **Comment** (C)
9. **Insert icon** action (lucide `smile-plus`, opens IconPicker popover)
The toolbar is **user-customizable**: right-click pill → "Customize toolbar" opens Settings (`ToolbarContextMenu.vue`); entries can be hidden/shown/reordered/merged into flyouts, persisted in preferences (`appPreferences.value.toolbar`); layout model in `src/app/editor/toolbar/layout.ts` (`groups: Tool[][]` + `hidden: Tool[]`; a group of 1 = button, >1 = flyout).

**Flyout behavior** (ToolFlyout.vue + `packages/vue/src/primitives/Toolbar/ToolbarRoot.vue`):
- A flyout renders as `[32px tool button][12px chevron trigger]` — the chevron trigger is `h-8 w-3` (**12px wide**), icon `lucide/chevron-down` at `size-2.5` (10px), hover `bg-hover`, open state `data-[state=open]:bg-hover`.
- **The tool button shows the last-used member of the flyout** (`flyoutSelections: Map<Tool,Tool>` in ToolbarRoot.vue, updated by a `watch` on `activeTool`); if the active tool belongs to this flyout, it shows that.
- Clicking the tool button re-selects the shown tool; clicking chevron opens a reka-ui `DropdownMenu` (radio group) with `side="top" :side-offset="8" align="start"` (opens **upward, 8px above**, since pill is bottom-docked).
- Flyout menu items: menu item style + `justify-start`, row = [14px check indicator box][14px tool icon][label][shortcut right-aligned]. Check = `lucide/check` size-3.5 in a `size-3.5` fixed slot so labels never shift.
- Selecting a tool from flyout sets it and closes.
- The SHAPE_WITH_TEXT tool is a special picker button (ShapeToolButton.vue) whose icon redraws the shape kind last picked (custom SVG outlines in `src/components/icons/shapes.ts`).
- Mobile variant (MobileToolbar.vue) pages tools into 3 categories with slide animation — not relevant to desktop ExpoForge.

**Tooltips on every button**: `Tip :label="toolTip(label, shortcut)"` → format `"Move (V)"` (`src/app/editor/toolbar/shortcuts.ts: toolTip()`).

---

## 3. Icons

- **Single set: Lucide** via Iconify, loaded **offline at build time**:
  - `unplugin-icons` vite plugin with `Icons({ compiler: 'vue3' })` + `unplugin-vue-components` resolver `IconsResolver({ prefix: 'icon' })` (`vite.config.ts`). Deps: `@iconify-json/lucide ^1.2.139` (full collection vendored in node_modules — no network API).
  - Two import styles: explicit `import IconX from '~icons/lucide/x'` (typed component) and auto-registered `<icon-lucide-x />` in templates.
  - No custom icon font; a few **custom inline SVG cursors** for pen/pencil/hand/comment tools (`packages/vue/src/shared/assets/cursors/*.svg` → data-URI CSS cursors in `packages/vue/src/editor/tool-cursor/index.ts`), plus generated shape outline icons (`src/components/icons/{shapes,outlines,connectors,mask}.ts` drawing polygon outlines in a 24px box, stroke 1.5, inset 3).
- **Exact tool→icon map** (`src/components/icons/index.ts`, `toolIcons`):
  - SELECT → `lucide/mouse-pointer`, FRAME → `lucide/frame`, SECTION → `lucide/layout-grid`, RECTANGLE → `lucide/square`, ELLIPSE → `lucide/circle`, LINE → `lucide/minus`, POLYGON → `lucide/triangle`, STAR → `lucide/star`, PEN → `lucide/pen-tool`, PENCIL → `lucide/pencil`, TEXT → `lucide/type`, STICKY → `lucide/sticky-note`, SHAPE_WITH_TEXT → `lucide/shapes`, CONNECTOR → `lucide/spline`, HAND → `lucide/hand`, COMMENT → `lucide/message-circle`, insert-icon → `lucide/smile-plus`.
- **Layer tree node icons** (`NODE_ICONS`): FRAME→`frame`, SECTION→`layout-grid`, GROUP→`group`, COMPONENT/INSTANCE→`diamond`, COMPONENT_SET→`component`, TEXT→`type`, VECTOR→`pen-tool`, RECTANGLE→`square`, ELLIPSE→`circle`, LINE→`minus`, STICKY→`sticky-note`, CONNECTOR→`spline`; auto-layout frames override with `rows-3`/`columns-3`/`grid-3x3`; slots→`square-dashed`; masks→`squares-intersect`; image fills→`image`; icon frames→`smile`.
- **Rendered sizes** (from themes): toolbar buttons 16px (`size-4`); flyout trigger chevron 10px (`size-2.5`); layer tree rows 12px (`size-3`); panel/section icon buttons 14px (`size-3.5`); number-field leading icons 12px (`size-3`); menu item icons 12px (`size-3`); properties tab icons 12px (`size-3`).
- Other lucide names seen in chrome: `chevron-down`, `chevron-right`, `check`, `plus`, `x`, `settings`, `sidebar`, `play`, `rotate-ccw`, `sparkles`, `code`, `list-checks`, `layers-3`, `crosshair`, `unlink`, `diamond-plus`, `lock`, `unlock`, `eye`, `eye-off`, `align-start-vertical`, `align-center-vertical`, `align-end-vertical`, `align-start-horizontal`, `align-center-horizontal`, `align-end-horizontal`, `scan`, `rotate-cw`, `rotate-cw-square`, `flip-horizontal-2`, `flip-vertical-2`, `blend`, `square-round-corner`, `panel-top/right/bottom/left`, `align-horizontal-space-between`, `align-vertical-space-between`, `alert-triangle`, `image`, `sliders-horizontal`.

---

## 4. Left panel (Layers)

Files: `src/components/LayersPanel.vue`, `src/components/LayerTree/**`, `src/components/PagesPanel.vue`, themes `src/theme/layer-tree.ts`, `src/theme/page-list.ts`.

**Structure top→bottom** (`LayersPanel.vue`, `<aside class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-panel">`):
1. **AppMenu** (`src/components/shell/AppMenu.vue`): row `px-2 py-1.5` with 24px brand mark, editable document name (`text-xs`, double-click to rename, hover bg), cloud status, settings icon-button, toggle-UI icon-button; below it a web-only menubar (File/Edit/…, trigger `px-2 py-1 text-[11px]`).
2. **Segmented control** “File | Assets” in a `border-b px-2 py-1.5` strip (SegmentedControl: `h-5` items, `px-1.5 text-[11px]`, container `rounded bg-panel-field p-0.5`).
3. Vertical splitter: **Pages list (default 30%, min 10/max 60)** above **Layers tree (default 70%)**, reka-ui Splitter with 8px handle / 1px divider.
4. **Pages panel** (`page-list.ts`): header `px-3 py-1.5` with `text-[11px] font-semibold` title + plus icon-button; rows `h-6 px-2 gap-1.5 rounded text-[11px]`, 12px `notebook-pen`-style icon (opacity .70), active page `bg-hover text-surface`, inactive `text-muted` + hover `bg-hover`; inline rename swaps to input with `border-accent bg-input`; reorder drop indicator 2px `bg-accent` rounded line.
5. **Layers header**: `px-3 py-2 text-[11px] font-semibold text-surface` — label only.
6. **Layer tree** — virtualized (reka-ui `TreeVirtualizer`, `estimate-size` 24).

**Row geometry & behavior** (`layer-tree.ts`, `LayerTree/geometry.ts`):
- **Row height: exactly 24px** (`LAYER_TREE_ROW_HEIGHT = 24`); rows are `flex items-center gap-1 rounded pr-1 text-[11px]` inside a viewport with `px-1` gutter.
- **Indent: 16px per level** (`INDENT = 16` in LayerTree.vue; `padLeft = (level-1)*16px` in `packages/vue/src/primitives/LayerTree/LayerTreeItem.vue`).
- **Chevron disclosure** (LayerTreeDisclosure.vue): 16px-wide cell (`w-4`), `lucide/chevron-right` at `size-3` (12px), `transition-transform`, expanded = `rotate-90` (rotates clockwise, points down); leaf nodes render an empty 16px placeholder so icons align.
- Row content: [chevron][12px type icon][label `truncate`][variable-mode pills `rounded-full border border-current/40 px-1.5 text-[10px] leading-3.5`][hover actions].
- **Hover actions** (LayerTreeActions.vue): lock + visibility buttons `size-4` (16px), icons `size-3` (12px), `opacity-0 → group-hover/row:opacity-100`; **persist visible when layer is locked or hidden** (`actionsVisible` variant). Icons: `lock`/`unlock`, `eye`/`eye-off`.
- States: selected+focused `bg-panel-selected text-on-accent` (#2f6fdd + white); selected+unfocused `bg-panel-selected-muted text-surface` (#353b46 — the “gray selection when panel not focused” trick); hover `bg-hover`; hidden layer `opacity-65` (icon only dims to 50% when selected, to keep highlight readable); component icons tinted `--color-component` (#bb8cff), slots `--color-slot` (#f45cc4).
- **Drag & drop**: rows draggable to reparent/reorder; drop indicator: `above/below` = 2px `bg-accent` line at row top/bottom edge; `make-child` = `inset-y-1 rounded border border-accent bg-accent/10` outline around the row; dragging row `opacity-30`.
- Double-click row → inline rename input (`border-accent bg-input px-1 text-[11px]`).
- Right-click row → canvas context menu (`CanvasMenu` via ContextMenuPortal), selecting node first if not in selection.
- **Sticky pinned top-level row** (LayerTreeStickyRow.vue): the top-level ancestor of the scroll viewport pins over the top of the list while scrolled — Figma-style.
- **No search field** in the layer tree itself (search lives in the command palette, Ctrl+P style). No per-panel empty states here; tree always shows page children.
- Scrolling: `scrollbar-thin` (6px overlay-ish thumb in `--color-border`, hover `--color-muted` — utility defined in `src/theme/tokens.css`).

---

## 5. Right properties panel

Files: `src/components/PropertiesPanel.vue` (tab shell), `src/components/DesignPanel.vue` (section composition), `src/components/properties/**` (sections), themes `src/theme/panel/*.ts`, `src/theme/input/*.ts`.

**Tab organization** (PropertiesPanel.vue + `src/theme/panel/properties-tabs.ts`):
- Tabs list: `h-10` (40px), `border-b`, `px-2`, items `gap-0.5`, `overflow-x-clip` (never scrolls; labels hide via container query `@[240px]/tabs` when narrow).
- Trigger: `px-1.5 py-1 text-[11px] text-muted`, hover `text-surface`, active = **`font-semibold text-surface` + 2px underline accent** implemented as `after:absolute after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-accent` (absolutely positioned 2px bar overlapping the border).
- Tabs: **Design** (label), **Code** (`lucide/code`), **AI** (`lucide/sparkles`), **Design Check/Lint** (`lucide/list-checks`, icon tints `--color-error`/`--color-warning` by issue count). Tabs keep state via `force-mount` + `hidden`.
- **Zoom readout** lives in this tab row, right-aligned (`ml-auto`): plain text button `px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover` showing `NN%` — see §7.
- Above the tabs (outside PropertiesPanel, in EditorWorkspace.vue): a `border-b px-1.5 py-1.5` strip with collaboration presence + a Play (preview) icon-button (`lucide/play` size-3.5).
- Comment tool or version history replaces the whole sidebar content.

**Section stack for a single selection** (DesignPanel.vue): PanelHeader (icon + node name + contextual icon actions) → TextContentSection (text only) → StatusSection → ComponentPropertiesSection (instances) → … → **PositionSection** → **ConstraintsSection** → LayoutSection (auto-layout) → **AppearanceSection** (opacity/blend/radius) → MaskSection → **TypographySection** (text only) → **FillSection** → **StrokeSection** → **EffectsSection** → SelectionColorsSection → LayoutGridSection → **ExportSection**. Empty selection shows PageSection, VariablesSection, StatusesSection, DocumentSection, ExportSection. Multi-selection shows a count header + Position/Constraints/Appearance/Fills… Frame *tool* active shows frame presets instead of selection properties (Figma behavior).

**Section anatomy** (`src/theme/panel/section.ts`, `src/components/ui/panel/PanelSection.vue`, reka-ui Collapsible under it):
- Root: `border-b border-border px-3 pb-3` (**12px horizontal padding, 12px bottom padding, 1px divider between sections; no top padding — the header provides it**), disabled → `opacity-60`.
- Header: `flex h-8` (**32px tall**), title `text-[11px] font-semibold truncate`, right side action slot `h-7 w-[26px]` holding up to one 24px icon-button.
- Main sections **do not collapse** (no chevron; the Collapsible machinery is used for empty-state "open" actions and nested groups like component property groups, which do use a rotating chevron — `src/theme/collapsible/collapsible.ts`: chevron `size-3.5 transition-transform group-data-[state=open]:rotate-90`, content animates `collapsible-down/up duration-180`).

**Field rows** (`src/theme/panel/grid.ts` + PanelGrid.vue):
- 2-column grid default (`grid-cols-2`), **column gap 6px** (`gap-1.5`), row gap 6px; optional `wide-first` distribution `minmax(0,7fr) minmax(0,5fr)` for label+value pairs like “W | H”.
- Labeled field group (`src/theme/panel/field/group.ts`): label `mb-1 text-[11px] leading-none text-muted` above the control; controls stacked with 6px gaps.
- Extra spacing between logical rows is done with `mt-1.5`/`mb-1.5`/`mb-3` utilities at call sites (6px/12px).

**Control repertoire & sizes**:
- **Number scrub field** (`src/theme/input/number-field.ts`, primitive `packages/vue/src/primitives/NumberField/NumberFieldRoot.vue`, 456 lines): `h-6` (24px) `rounded` (4px) `bg-panel-field` (#383838) pill; hover `bg-panel-field-hover` (#404040); focus `border-panel-focus` (#3b82f6); **`cursor-ew-resize`** on the whole root when not editing; leading icon/letter (X/Y/W/H or 12px lucide icon) in a `px-[5px]` slot; value `text-[11px] tabular-nums`.
  - **Scrub**: pointerdown anywhere → pointer capture; **2px movement threshold** then `document.body.style.cursor='ew-resize'`; `value += dx * step * sensitivity`, accumulated in whole steps; Escape cancels back to start; pointerup without move = click → enters edit mode with value selected.
  - **Edit**: click (no drag) focuses an inner input; **full expression evaluator** (`packages/vue/src/controls/number-expression.ts`): typing `*2`, `-1`, `/2` is relative to start value; plain number is absolute; `Enter` commits, `Esc` cancels; `ArrowUp/Down` step (with Shift = ×10-ish per `stepNumberValue`), `Alt` fine.
  - **MIXED**: multi-selection with differing values shows placeholder **“Mixed”** in `text-muted` (i18n `panels.mixed`), an empty draft on edit, and a symbol `modelValue`; invalid expression → red border state (`panelFieldState.invalid: border-error`).
  - Bound-to-variable fields show the variable value + a trailing bind button; `detach-on-edit` policy emits `detach-request` on first mutation.
- **Selects** (`src/theme/select/select.ts`): trigger = same 24px panel-field pill with chevron `size-3`; content = floating surface (12px radius) with 24px items, **fixed 24px check gutter** (`pl-6`) so text never shifts, group labels `text-[10px] text-muted`.
- **Combobox** (font picker etc., `src/theme/select/combobox.ts`): same trigger; content has a search field (`h-7 rounded-md border bg-input`, 12px search icon at `left-2`), items `min-h-8` with mono 9px descriptions.
- **Segmented control** (`src/theme/select/segmented-control.ts`): container `rounded bg-panel-field p-0.5`, items `h-5 px-1.5 text-[11px] rounded-sm`, on = `bg-hover text-surface`.
- **Switch** (`src/theme/toggle/switch.ts`): sm = `h-4 w-7` (16×28px) track, thumb `size-3`, checked track `bg-accent`, thumb→white `translate-x-3`; **mixed state**: track `border-accent/60 bg-accent/20` with thumb `translate-x-1.5 bg-accent`.
- **Icon buttons** (`src/theme/button/icon-button.ts` + `panelIconButtonBase` in `src/theme/panel/field/base.ts`): 24px (`size-6`) `rounded` transparent, hover `bg-hover text-surface`, active (toggle) = `border-accent text-primary`; panel variant guarantees 24px footprint for section action slots.
- **Color/paint field** (`src/theme/paint/field.ts` + FillSection): 24px-high row: [checkerboard-backed swatch][hex/value text][1px divider `bg-muted/40`][opacity mini-field `w-13`][bind button]. Swatches: 16px (`size-4`) rounded-sm with **8px CSS checkerboard** (`src/theme/paint/checkerboard.ts`: four 45° linear-gradients, `bg-[size:8px_8px]`, colors `--color-checkerboard` #3a3a3a / `-muted` #4a4a4a).
- **Fill picker popover** (FillPicker.vue): opens `side="left"` (from right panel), `side-offset 4`; header = 3 tabs (solid `lucide/square`, gradient `lucide/blend`, image `lucide/image`) as 24px icon buttons; then OKhcl color sliders (`src/theme/color-slider.ts`: slider `h-3 rounded-md` track, 14px white-ringed thumb, 10px `w-7` label, 56px number input), gradient bar stops 14px squares `rounded-sm border-2 border-white/60`.
- **Constraint picker** (`src/theme/constraints.ts`): a 72×64px diagram box with pin buttons; active pin `border-accent bg-accent/12 text-primary`.
- **Typography section** (TypographySection.vue): SharedStyleField, font picker row (`min-w-0 flex-1` + font-settings icon + missing-font warning icon `text-warning-action`), then 2-col grids: weight select | size number field; variable axes; line-height | letter-spacing; then a `border-t border-border pt-3` subgroup: direction, alignment (segmented), text case/list/paragraph spacing fields, OpenType feature switches.
- **Position section**: align toolbar row (`mb-1.5 flex justify-between`, 3+3 icon buttons `gap-0.5`) above X/Y grid; rotation row: number field with `°` suffix and `lucide/rotate-cw` icon + flip-h/flip-v/rotate-90 icon buttons; auto-layout frames add “ignore auto layout” `lucide/scan` toggle in the section header.
- **Header of panel** (`src/theme/panel/header.ts`): grid `[icon | title | actions]`, `px-3 py-2 border-b`, title `text-xs font-semibold` (12px), icon 14px muted (tinted `--color-component` for components), actions = 24px icon buttons.

**Typography scale overall**: panel body text is **11px** (text-[11px]) everywhere, section titles 11px semibold, panel header 12px, labels 11px muted, tiny meta 9–10px, body base font-size 13px (`src/app.css`). Weights: semibold (600) for titles/active tab only.

---

## 6. Menus, popovers, tooltips

**Floating surface** (single source of truth — `src/theme/overlay.ts`):
```ts
floatingSurface = 'rounded-xl bg-panel text-surface shadow-[0_0_0_1px_var(--color-border),0_8px_30px_rgb(0_0_0/0.4)]'
tooltipSurface = 'rounded-md bg-panel text-surface shadow-[0_0_0_1px_var(--color-border),0_8px_30px_rgb(0_0_0/0.4)]'
```
i.e. **12px radius, panel bg, hairline ring drawn via shadow (so it doesn't affect size) + the 8px/30px soft shadow.** Popover content z-index `z-[100]`, menus `z-50`, selects/comboboxes `z-[110]`.

**Motion** (`src/theme/motion/styles.ts`, powered by `tw-animate-css`):
- `floating` (menus/popovers/selects/pickers): `animate-in fade-in-0 zoom-in-95 duration-150 ease-out` **plus 4px slide-in from the side it opens on** (`data-[side=bottom]:slide-in-from-top-1` etc.); **no exit animation** — “a fading-out modal menu would still block the canvas and shortcuts until it unmounts” (they close instantly and unmount).
- `overlay` (dialogs): fade-in 180ms ease-out / fade-out 120ms ease-in.
- `popup` (tooltips): `animate-in fade-in zoom-in-95`.
- `motion-reduce:` variants disable all of it; global `data-motion='off'` also kills them.
- Drill-in transitions: enter 150ms ease-out / leave 100ms ease-in, 12px x-slide (`drillInTransition`).

**Menus** (reka-ui DropdownMenu/ContextMenu/Menubar; `src/components/ui/menu/menu.ts`):
- Content: `p-1` + floatingSurface + floating anim, `z-50`, max-height clamped to available height − 8px (`max-h-[calc(var(--reka-...-available-height)-0.5rem)]`).
- Item: `flex items-center gap-2 rounded px-2 py-1.5 text-[11px]` (**24px+ rows: 6px 12px padding, 11px text, 4px radius**), highlight = `data-[highlighted]:bg-hover` (keyboard/hover), disabled `text-muted/50`; shortcut text right-aligned `text-[11px] text-muted` with `justify-between gap-6`; separator `mx-1 my-1 h-px bg-border`; group label `px-2 pt-1.5 pb-1 text-[11px] text-muted`.
- **No visible scrollbars** in menus: chevron “scroll strips” (`h-5` gradient buttons top/bottom) over a `scrollbar-none` viewport (`MenuScrollArea.vue`, mimicking macOS/Figma).
- Component-tinted menus: `tone: component` → `text-component` (#bb8cff) with `bg-component/12` highlight.
- Positioning: reka-ui (floating-ui under the hood) with `side-offset 4–8`, `collision-padding 8`, align start/end per context.
- Context menu on canvas (`CanvasMenu.vue`): `min-w-56 max-w-80`, side-offset 2; submenus `w-max`; right-click first selects the node under cursor if not selected; closes hand focus back to canvas (`@close-auto-focus.prevent`).

**Tooltips** — **custom implementation, not reka-ui** (`src/components/ui/overlay/Tip.vue` + `tooltip.ts`; the file documents why: reka shares one popper context which breaks nested triggers). Numbers:
- **Open delay 400ms** (`TOOLTIP_OPEN_DELAY_MS`), **skip delay 300ms** (`TOOLTIP_SKIP_DELAY_MS`): after any tooltip closes, a *different* tooltip opened within 300ms shows instantly (global “warmth” state via `createGlobalState`) — moving along a toolbar never waits twice.
- Placement via `@floating-ui/vue` `useFloating`: `strategy: fixed`, `transform: false` (so the grow animation owns transform), middleware `offset(4) + flip + shift` with **8px viewport padding**.
- Style: `max-w-80` (320px), `px-2 py-1 text-[11px] break-words`, tooltipSurface (6px radius), `pointer-events-none`, teleported to body.
- Trigger wrapper is `display:contents`; opens on pointerover **and** keyboard `:focus-visible` only; hides on pointerdown/click; a custom `open-pencil:tooltip-claim` DOM event makes an opening tooltip close any other instantly; nested tooltip triggers (e.g., a button inside a labeled row) suppress the outer one.

**Hover intent for popovers**: popovers/menus use reka-ui defaults (open on click); hover-intent logic exists only for tooltips (delays above) and the **canvas selection toolbar / auto-layout hover overlays** (drawn in canvas, not DOM). `useHeldContent` (`src/components/ui/overlay/held.ts`) freezes a closing popover’s content during exit so it doesn’t flash empty.

---

## 7. Canvas presentation

Rendering: two stacked `<canvas>` elements (scene layer pointer-events-none + interactive overlay layer) inside `div.canvas-area` (`src/components/EditorCanvas.vue`); drawn by CanvasKit/Skia in `packages/core/src/canvas/**`. Zoom/pan/rulers/handles are all canvas-drawn; only popovers/tooltips/comments are DOM.

**Constants** (all in `packages/core/src/constants.ts` unless noted):
- **Canvas/page background**: page color from document; app chrome bg `--color-canvas: #1e1e1e` (dark) / `#f3f4f6` (light). Default light page `CANVAS_BG_COLOR = rgb(0.96,0.96,0.96) = #F5F5F5`.
- **Pixel grid** (design docs): one hairline per document pixel, **only when zoom×dpr ≥ 8** (i.e. 800% at 1×) — `PIXEL_GRID_MIN_DEVICE_PIXELS = 8` (`packages/core/src/canvas/overlays/pixel-grid.ts`); line color white at **14.2% alpha** on dark pages / black at **5.3%** on light; drawn as a single-shader draw call.
- **Board dot grid** (FigJam-style boards): dots every **16 units** (`BOARD_GRID = 16`), dot color **#C4C4C4**, dot diameter 2 units but **min 1.35 screen px**, spacing **doubles while zooming out until dots are ≥8 screen px apart** (`packages/core/src/canvas/page/background.ts`). Shader-based, single draw.
- **Selection**: `SELECTION_COLOR = rgb(0.23,0.51,0.96)` (#3B82F6) — accent-derivable (`DEFAULT_SELECTION_THEME` + `src/app/shell/accent/palette.ts` maps UI accent → selection color); outline stroke **1px screen** (`setStrokeWidth(1/zoom)`); component outlines tint `COMPONENT_COLOR #9700FF-ish rgb(0.592,0.278,1)`; slots `#F24BBC`.
- **Selection handles**: **6×6px white-filled squares** (`HANDLE_HALF_SIZE = 3`) stroked 1px in selection color, at the 4 corners (`drawHandle` in `packages/core/src/canvas/overlays/selection.ts`); hit radius 6px (`HANDLE_HIT_RADIUS`); **rotation handle 24px above top-center** with a 1px stalk line (`ROTATION_HANDLE_DISTANCE = 24`); handles hidden when selection is tiny on screen (`hasTransformHandles`); handles only for single selection / group bounds.
- **Size pill**: under selection during resize — height 18px, radius 4px, 6px x-padding, filled selection color, white 10px text (`SIZE_*` constants); measurement pills (redlines) 18px/3px radius/5px padding in `MEASUREMENT_COLOR #F24822-ish rgb(0.949,0.282,0.133)`.
- **Snap guides** (during move): 1px lines in `SNAP_COLOR rgb(1.0,0.0,0.56)` (hot pink #FF008F); snap threshold **5 screen px** (`SNAP_THRESHOLD_SCREEN_PX`); vertex snap crosses at radius 2.5, rust color `rgb(0.81,0.3,0.18)` 60% alpha.
- **User guides** (ruler-drawn persistent guides): idle `rgb(0.85,0.29,0.2, .78)` dashed `[3,4]`; hovered brighter; selected blue `rgb(0.1,0.45,0.95)` (`packages/core/src/canvas/guides/draw.ts`).
- **Marquee**: fill alpha 0.08 selection color. Hover outline: 1px selection-color shape outline. Parent/entered container: dashed `[4,4]` at 60% alpha.
- **Frame name labels**: drawn on canvas above top-level frames, **11px** (`LABEL_FONT_SIZE`), offset 8px above (`LABEL_OFFSET_Y`), auto-contrast foreground with alpha 0.23 dark / 0.5 light when idle, full strength on hover/selection (`FRAME_TITLE_ALPHA` in `packages/core/src/canvas/labels/style.ts`). **Section titles**: 24px-high pill, radius 5, 11px SemiBold (bundled “OpenPencil Section Title” = Inter SemiBold), fills from section fill or #5e5e5e. Component labels: diamond icon 10px + 4px gap + 11px name.
- **Rulers**: 20px thick (`RULER_SIZE = 20`), bg #242424 (dark; from `--color-ruler-bg` tokens), ticks #666, text #8c8c8c, major tick 0.5 / minor 0.25 of thickness, ~100px target tick spacing, badge 14px-high/2px radius; highlight alpha 0.3. Toggle in zoom dropdown (⌘R/`view-rulers`).
- **Zoom**: readout button in properties tab row (“NN%”, 11px muted); dropdown (`src/components/editor/ZoomDropdown.vue`, `min-w-52`) contains: **inline zoom input** (click the % row → text input, Enter commits, Esc cancels), Zoom in/out, Zoom to fit, presets 50/100/200 with check marks, then toggles: Pixel grid, Snap to pixel grid, Rulers, Multiplayer cursors, Design issues on canvas, Comments on canvas. Zoom step: `store.applyZoom(±100, center)` (±1% per wheel tick at center). Cursor per tool (`packages/vue/src/editor/tool-cursor/index.ts`): shapes=crosshair, text=text, move=default, plus SVG cursors for pen (hotspot 4,4), pencil (4,20), comment (5,24), hand open/closed (16,16).
- **Canvas-only mode**: hiding UI (`lucide/sidebar` toggle, Cmd+\ shortcut label) keeps the floating toolbar if the profile allows; a **WorkspacePill** (`src/components/editor/WorkspacePill.vue`) floats at `top-7 left-7` (28px): rounded-lg border bg-panel px-2 py-1, 24px brand mark, doc name (12px), show-UI + AI-chat icon buttons; preview mode adds a “Previewing” badge (`bg-accent/15 text-primary text-[10px]`) + Reset/Leave buttons.

---

## 8. Design tokens (copy these)

From `src/theme/tokens.css` (Tailwind v4 `@theme`, dark = default, light under `html[data-theme='light']`):

| Token | Dark | Light |
|---|---|---|
| `--color-panel` | **#2a2a2a** | #ffffff |
| `--color-panel-secondary` | #242424 | #f7f8fa |
| `--color-panel-field` | **#383838** | #f0f1f3 |
| `--color-panel-field-hover` | **#404040** | #e4e7ea |
| `--color-panel-focus` | **#3b82f6** | #2563eb |
| `--color-panel-selected` | **#2f6fdd** | #2563eb |
| `--color-panel-selected-muted` | **#353b46** | #e5e7eb |
| `--color-canvas` | **#1e1e1e** | #f3f4f6 |
| `--color-border` | **#3a3a3a** | #d8dce3 |
| `--color-hover` | **#353535** | #eef1f5 |
| `--color-accent` | **#2563eb** | #2563eb |
| `--color-on-accent` | #ffffff | — |
| `--color-primary` | **#60a5fa** | #1d4ed8 |
| `--color-on-primary` | #1f2328 | #ffffff |
| `--color-surface` (text) | **#f0f0f0** | #1f2328 |
| `--color-muted` (text) | **#a6a6a6** | #5f6673 |
| `--color-input` | **#1e1e1e** | #ffffff |
| `--color-component` | **#bb8cff** | #7c3aed |
| `--color-slot` | **#f45cc4** | #db2777 |
| `--color-warning` | #ffb314 | #8f5500 |
| `--color-success` | #4ade80 | #15803d |
| `--color-error` | #fa8585 | #b91c1c |
| `--color-checkerboard` / `-muted` | #3a3a3a / #4a4a4a | #d1d5db / #e5e7eb |
| `--color-ruler-bg/tick/text` | rgb(36,36,36) / rgb(102,102,102) / rgb(140,140,140) | rgb(250,250,251) / rgb(163,171,182) / rgb(90,99,112) |

- Tailwind's default palette is fully dropped (`--color-*: initial`); the whole UI uses only these names — that's why the theme is so consistent.
- Accent system is pluggable: 8 presets (blue #2563EB, purple #9333EA, pink #BE185D, red #B91C1C, orange #C2410C, yellow #A16207, green #15803D, graphite #52525B), each re-derives `accent/panel-focus/panel-selected/panel-selected-muted/primary` preserving OKhcl relations, with WCAG AA (4.5) enforcement (`src/app/shell/accent/palette.ts`).
- **Typography**: `body { font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 13px; color: var(--color-surface); background: var(--color-canvas); user-select: none }` (`src/app.css`). Numeric fields `tabular-nums`. Number inputs have spinners stripped.
- **Radii scale in practice**: fields 4px (`rounded`), small controls 4px, buttons 6px (`rounded-md`), icon buttons 4–6px, menus/popovers/toolbar pill **12px (`rounded-xl`)**, tooltips 6px (`rounded-md`), swatches 2–4px.
- **Scrollbars** (tokens.css `@utility scrollbar-thin`): 6px, thumb `--color-border` radius 3, hover `--color-muted`, transparent track; `scrollbar-none` utility for menus.
- Shadows: only one floating shadow `0 8px 30px rgb(0 0 0 / 0.4)` (+1px ring via `0 0 0 1px var(--color-border)`), and `shadow-sm` on small floating bits (pill, switches, thumbs).
- Sizing ladder: 24px (field rows, section icons), 28px (sm controls), 32px (tool buttons, section headers), 36px (tab bar), 40px (properties tabs). Text ladder: 9, 10, 11 (workhorse), 12, 13 (base), 14+.

---

## 9. License & what to port

**MIT** (`/LICENSE`: “Copyright (c) 2026 Danila Poyarkov and OpenPencil contributors”). Practical attribution: keep their copyright + permission notice in a copy of the MIT text near ported code (e.g. header comment or `THIRD_PARTY_NOTICES.md`); no other obligation. Note `REUSE.toml`/`LICENSES/` exist because bundled assets (fonts, mermaid upstream, kiwi NOTICE) have their own terms — irrelevant if you only port theme values/patterns (facts & values aren't copyrightable anyway, but verbatim *files* are).

**Files worth porting verbatim (values/structure, adapted to React):**
1. `src/theme/tokens.css` — the entire token sheet; drop-in for Tailwind v4 `@theme`, immediate visual baseline (both dark+light).
2. `src/theme/toolbar.ts` + `src/components/toolbar/DesktopToolbar.vue` — toolbar pill geometry, 32px buttons, active states, flyout trigger anatomy; the Vue template is trivially readable as JSX.
3. `src/components/ui/overlay/Tip.vue` + `src/components/ui/overlay/tooltip.ts` — the best file in the repo: 400/300ms intent logic, claim event, focus-visible rules, floating-ui setup. Port to React with @floating-ui/react.
4. `src/theme/overlay.ts` + `src/theme/motion/styles.ts` — one-line floating surface + the animation utility strings (150ms grow, side-based slide-in, no exit anim) usable directly with tailwindcss-animate.
5. `src/theme/layer-tree.ts` (+ `geometry.ts` 24px/16px constants) — complete layer row styling incl. unfocused-selection color, hidden-layer opacity, drop indicators.
6. `src/theme/panel/section.ts` + `src/theme/panel/grid.ts` + `src/theme/panel/field/base.ts` — right-panel section/field/grid rhythm (32px headers, 12px padding, 6px gutters, 24px fields) and the `panelFieldBase` field style.
7. `packages/core/src/constants.ts` — every canvas chrome number (handles 6px, rotation 24px, snap pink, snap threshold 5px, pill sizes, ruler 20px, board grid 16…). Pure data, zero deps.
8. `src/components/ui/menu/menu.ts` + `MenuScrollArea.vue` — menu item/separator/label/scroll-strip styling; maps directly onto Radix DropdownMenu.
9. `packages/vue/src/primitives/NumberField/NumberFieldRoot.vue` — the scrub/edit/expression state machine (2px threshold, pointer capture, relative expressions, mixed handling). Reimplement in React; the logic comments alone are a spec.
10. `src/theme/panel/properties-tabs.ts` + `src/components/editor/ZoomDropdown.vue` — properties tab bar (2px accent underline overlap trick, container-query label hiding) and the zoom dropdown content model (editable %, presets, view toggles).

Honorable mentions: `src/theme/paint/checkerboard.ts` (one-line alpha checkerboard), `src/app/shell/accent/palette.ts` (accent derivation with contrast clamping), `packages/core/src/canvas/page/background.ts` (dot-grid spacing algorithm).

---

## 10. Not worth copying

- **The canvas renderer** (`packages/core/src/canvas/**`, CanvasKit-WASM): the polish we envy (labels, handles, guides) is Skia-drawn; ExpoForge's DOM infinite canvas would gain nothing but 3MB of wasm and a rewrite. Copy the *constants* (§7), not the code.
- **Vue/reka-ui component tree**: primitives are Vue-specific (provide/inject, `~icons` compiler); re-derive with Radix/shadcn — port values, not components (except as reading material).
- **Collaboration/multiplayer cursors, comments layer, presence, cloud, AI chat, MCP/CLI, FigJam board mode** (`src/app/{collab,cloud,ai,comments,presence}`, `packages/{mcp,cli,cloud}`): product surface area, not chrome polish.
- **Mobile toolbar/drawer/HUD** (`MobileToolbar.vue`, `MobileHud/`): paging categories + slide gestures for touch; ExpoForge is desktop-first.
- **Tab bar & document tabs** (`TabBar.vue`, `src/app/tabs`): browser-chrome metaphor for a multi-doc desktop app; our builder is single-document.
- **The user-customizable toolbar layout model** (`src/app/editor/toolbar/layout.ts`, 315 lines of group normalization): delightful but expensive; ship fixed grouping first, add later if ever.
- **SF Symbols bridge / Tauri desktop shell** (`desktop/`): platform-specific.
- **Figma-compat behaviors that fight our tool**: e.g. “frame tool replaces inspector with presets”, board profiles with fixed toolbars — tied to their document model, not ours.

---

## TL;DR — the 12 numbers that make it look Figma-grade

1. Toolbar pill: 12px radius, 4px padding, 2px gaps, `0 8px 30px rgba(0,0,0,.4)` shadow, 16px off the bottom, centered.
2. Tool buttons 32×32, icons 16px; active = solid #2563eb + white icon; hover #353535.
3. Flyout chevron zone only 12px wide, 10px chevron; menu opens upward with 8px offset; remembers last-used tool per flyout.
4. Layer rows exactly 24px, 16px indent/level, 12px icons, chevron rotates 90°.
5. Selection: 1px #3B82F6 outline + 6×6px white handles + rotation handle 24px above.
6. Snap guides: 1px hot-pink #FF008F, 5px threshold; size pills 18px tall, 4px radius.
7. Panel sections: 12px h-padding, 32px header, 11px semibold titles, 1px #3a3a3a dividers, no collapse chevrons.
8. Field grid: 2 columns, 6px gaps, 24px-tall fields (#383838 → #404040 hover → #3b82f6 focus ring), 11px tabular-nums, ew-resize scrub cursor.
9. Menus: 12px-radius surface, items 11px/24px+ with 4px radius, 6px×12px padding, `bg-hover` highlight, right-aligned muted shortcuts, no exit animation, 150ms zoom-95 grow-in with 4px slide.
10. Tooltips: 400ms delay, 300ms skip window, 11px text, 6px radius, max 320px, 4px offset, pointer-events-none.
11. Type: Inter 13px base UI, 11px panels, 12px headers; semibold only for titles/active.
12. Panels: left 18% (min 10/max 30), right fixed 256px opening width; 8px splitter hit areas with 1px dividers that turn accent on hover.
