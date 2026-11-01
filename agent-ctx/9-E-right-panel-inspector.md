# Task 9-E — Right Panel (Contextual Inspector)

**Agent:** 9-E · **Scope:** `src/components/builder/right-panel/**` (sole owner) · **Status:** ✅ complete — `bunx tsc --noEmit` clean for these files (only pre-existing `examples/` + `skills/` errors remain project-wide), `bunx eslint src/components/builder/right-panel` 0/0, dev.log clean, live-verified in the browser (selection flows, store writes, ghosts, icon picker, codegen viewer).

## 1. What the panel is

`RightPanel` (default export, `RightPanelProps { className?: string }` — zero data props): the contextual property inspector. Everything comes from `useProjectStore` (`data`, `selection`, `revision`). The tab strip is derived from the selection kind; irrelevant sections NEVER render (contextual-only contract):

| Selection | Tabs | Sections (in render order) |
|---|---|---|
| node | Properties \| Style \| Code | Props: `Layer` (name → setNodeName) + registry `props` grouped by `field.section` (default `Content`). Style: `entry.styleSections` order — Layout / Spacing / Appearance / Typography / Effects |
| screen | Screen \| Code | Screen (name + live route chip `→ /route`) · Device & safe area · Canvas (background + X/Y) |
| group | Navigation \| Code | Group (name → `app/(dir)/` chip) · Navigator (3 cards) · Tab bar + Tab colors + Tabs list (tabs) or Header + Transitions (stack) |
| nothing | Project (single) | Project (name) · Stats · Navigation overview · Routes · left-panel hint (always visible) |

Code tab (all selected kinds): `generateProjectFiles(data)` memoized on `[data, revision]`, `codegenFileList` dropdown tree, `autoPickFile` follows the selection (group → its `_layout.tsx`, screen/node → its screen file, fallback root `_layout.tsx`), Prism + vscDarkPlus via `react-syntax-highlighter` (ambient types in `vendor-types.d.ts` — Prism + one theme only), read-only, path header + copy, empty-project quiet state.

## 2. This session's pass (audit + fixes over the working tree)

The working tree already carried a near-complete rewrite of the Phase-1 scaffolding (no 9-E record existed). I audited it against the spec end-to-end and fixed six concrete defects:

1. **Style-tab color fields ignored current values** — `backgroundColor` (Fill), `borderColor`, typography `color`, `shadowColor` never received `value` from `node.style`. Now every one reads via `str(style, key)` and ghosts to `None` when unset.
2. **ColorField Clear wrote invalid literals** — Clear emits `''`; the store/style/config objects are emitted verbatim by codegen, so `''` would generate `backgroundColor: ''`. Mapped per context: style keys → `undefined` (key removal); props → `undefined` (present-but-undefined = unset for resolve + codegen); screen background → `'#FFFFFF'`; tabs/stack colors → the canonical `defaultTabsConfig([])` / `defaultStackConfig()` values (imported from the store — single source of truth, never duplicated).
3. **`shadowOffset` partial writes** — Offset X/Y now always write a complete `{ width, height }` pair (missing axis defaults 0); codegen emits a valid object literal.
4. **Nav-kind helper line** was tabs-only with wrong copy → now always visible under the cards with the spec text "Switching resets that group's navigation settings."
5. **Project-tab hint** was empty-state-only → now always visible (big treatment when empty, one-liner otherwise).
6. **Empty-commit semantics in props** — a cleared text/color prop now writes `undefined` (revert to registry default) instead of an explicit `''`.

## 3. Verified behaviors (live browser run)

- Node: header `View · on Home`; Layout reset removed `left/top/width/height` from the store; unset W/H shows the muted **Auto** ghost; unset Gap/padding show muted ghosts; Fill displays `#EEF2FF`; Typography Color commit → `color:'#334155'` in store; Clear → key removed, field back to `None` ghost.
- Section order = registry order (`style-typography, style-layout, style-spacing, style-appearance, style-effects` for Text — typography first). Effects follow the SCREEN platform (iOS shadow quad + `iOS shadow` chip / Android elevation).
- Icon picker: 262 curated cells, full-set search ("house" → 36 hits, render cap 60), accent ring on selection, commits through `patchTabItem` (verified `ph:map-pin` persisted).
- Stack config edits → generated `app/(auth)/_layout.tsx` matches field values exactly.
- Code tab: manual pick sticks until the selection moves; auto-pick resolves group layouts and screen files; tree order dirs-first/layouts-first.

## 4. Infra reused vs rewritten

**Reused as-is** (per the task brief): `fields/number-field` (scrub), `fields/color-field` (hex+alpha popover), `fields/simple-fields`, `fields/field-control`, `fields/quad-field`, `fields/slider-field`, `collapsible-section.tsx`, `field-grid.tsx` (SectionFields), `shared.tsx` (QuietHint), `schema.ts` (FieldSpec/PanelSection + MIXED), `motion.ts`, `vendor-types.d.ts`, all `@/app/theme/*` ports, `@/components/builder/icons`.

**Rewritten (the contextual layer):** `right-panel.tsx` (identity header + contextual strip + forceMount bodies + registry fallback), all of `tabs/` — `props-tab`, `style-tab`, `screen-tab`, `nav-tab`, `code-tab`, `icon-picker`, `project-tab` — plus `icons-catalog.ts`. Deleted the Phase-1 scaffolding (`stubs.ts`, `tabs/flow-tab.tsx`).

## 5. Store / registry / codegen API gaps (REPORT ONLY — those modules untouched)

1. **Store has no `patchStackConfig` action** (it ships `patchTabsConfig` + `patchTabItem` for tabs only). `nav-tab.tsx` carries a local `patchStackConfig(groupId, patch)` that replicates the store's commit funnel (snapshot → `past`, clear `future`, bump `revision`) so undo/redo stays exact — but it bypasses the internal `commit()` (no gesture coalescing: each stack scrub = one undo entry, acceptable but not optimal). **Request:** add the action so the local fork can be deleted.
2. **`setNodeProps` merges without key removal** — writing `undefined` leaves the key present-but-undefined. `resolve.ts` and codegen both treat present-but-undefined as unset so it works, but a real `delete` would keep `node.props` clean.
3. **`setScreenBackground` / nav color configs have no "unset" concept** — they are complete scalar fields; `''` is accepted by the store and would be emitted verbatim by codegen. The inspector guards this (Clear → canonical defaults), but a store-level guard would be more robust.
4. **`setNavKind` resets the target config wholesale** (by design — the helper line says so); switching away and back cannot restore tab settings except via undo.
5. **Registry `PropField` has no platform gating** — iOS-only props (`bounces`) and Android-only props (`overScrollMode`) always render; platform-awareness exists only in the Style Effects section. Not blocking.
6. **Codegen is complete for this consumer** — `generateProjectFiles` is pure/synchronous, `codegenFileList` nodes carry content as specified. The file map covers `app/` only (per the 6-B spec) — when project export lands, non-app files will need a list extension, not a change to `codegenFileList`.

## 6. Icon verification

All names verified against `@iconify-json/ph` (`bun -e "const j=require('@iconify-json/ph/icons.json'); console.log(!!j.icons['name'])"`): the 262-entry curated catalog (`icons-catalog.ts`, parsed from the `icons: [...]` arrays — 0 invalid), plus every directly referenced name (`apple-logo`, `android-logo`, `squares-four`, `stack`, `rows`, `device-mobile`, `cube`, `square`, `text-aa`, `cursor-click`, `cursor-text`, `mouse-scroll`, `image`, `toggle-right`, `spinner-gap`, `minus`, `gradient`, `drop-half-bottom`, the 10 `DEFAULT_TAB_ICONS`). `IconifyIcon` takes no `size` prop — sizing via `className` utilities applied to the rendered SVG (consistent with the rest of the builder).

## 7. Files (exhaustive, all under `src/components/builder/right-panel/`)

`right-panel.tsx` · `schema.ts` · `shared.tsx` · `field-grid.tsx` · `collapsible-section.tsx` · `motion.ts` · `icons-catalog.ts` · `vendor-types.d.ts` · `index.ts` · `fields/{number-field,color-field,simple-fields,field-control,quad-field,slider-field}.tsx` · `tabs/{props-tab,style-tab,screen-tab,nav-tab,code-tab,icon-picker,project-tab}.tsx`. No other directories touched.
