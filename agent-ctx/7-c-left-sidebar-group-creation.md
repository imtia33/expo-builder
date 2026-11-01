# Task 7-C — Left Sidebar (Hierarchy Tree) + Group Creation Dialog

**Agent:** 7-C · **Scope:** `src/components/builder/left-panel/**`, `src/components/builder/dialogs/**` (only these) · **Status:** ✅ complete — `bunx tsc --noEmit` clean for owned dirs (only pre-existing errors under examples/ + skills/), `bun run lint` 0 findings, and every behavior exercised end-to-end in the running app (agent-browser against dev server, all against the real store — no mocks in code; test fixtures were injected through the store's own persistence layer only, then removed).

## 1. What shipped

### Deliverable 1 — one hierarchy tree (`left-panel/`)
`LeftPanel` (default export, `LeftPanelProps { className?: string }`, zero data props — everything from `useProjectStore`):
- **`left-panel.tsx`** — SCREENS header (live count + `ph:plus` DropdownMenu: *New group…* → dialog, *New screen* → `addScreen()` standalone), `PanelSearchInput` + `/` kbd hint, `HierarchyTree`, `GroupDialog`. `/` focuses the filter while the panel holds focus (guard: skips when target is INPUT/TEXTAREA/contenteditable).
- **`hierarchy-tree.tsx`** — the tree controller. Rows from `buildTreeModel`; renders `TreeRow`s + the Standalone divider + the dashed "Drop here to make standalone" zone (mounted only during a screen drag). Owns: selection dispatch (`select`, `setActiveScreen` for screens/nodes), inline-rename commit routing, all DnD zone math + drop resolution, keyboard (Enter/Space select, F2 rename, Alt+↑/↓ reorder, ←/→ collapse/expand/focus), delete-confirm AlertDialogs, auto-expand effect, reveal-on-create + reveal-on-canvas-selection.
- **`tree-model.ts`** — pure projection `ProjectData → TreeRow[]` (groups → screens → layers, standalone after divider; layers mounted only while the screen is expanded or a search is active). Search: screens match name/route/any layer name; layers match override-name/type/registry-name/text content; non-matching layers stay only as ancestors of matches; groups always render. Also `nodeDisplayName` (`Text “Welcome”` snippet, curly quotes, 24-char cap), `nodeIcon`, `nodeAcceptsChildren` (`children === 'any'` only), `isInSubtree` (cycle guard), `nodeCountOf`.
- **`tree-row.tsx`** — RowShell (24px `h-6` rows, `4 + depth*12` indent, chevron, drag/drop/keyboard wiring, three-zone drop indicator) + the three kind contents, each reading its entity from the store by id:
  - group: nav-kind glyph + name + kind label (hidden `< sm:`) + count badge; hover actions `ph:plus` (add screen to THIS group), `ph:gear-six` (select → inspector), `ph:trash-simple` (AlertDialog confirm).
  - screen: `ph:device-mobile` + name + live `→ /route` secondary + platform-icon·device chip; hover `ph:trash-simple` (AlertDialog confirm).
  - layer: registry glyph + label; hover eye (`ph:eye`/`ph:eye-slash`, `toggleNodeHidden`) + `ph:trash-simple` (`deleteNode`, **no** confirm — undo exists).
- **`tree-theme.ts`** — local tailwind-variants theme; two-state selection (panel focus → `bg-panel-selected`, focus leaves → `bg-panel-selected-muted`), hidden-layer dim, inside-target tint, per-zone drop indicators, hover-revealed actions.
- **`kind-icons.ts`** — spec-verified nav glyphs (tabs `ph:squares-four` / stack `ph:stack` / none `ph:rows`), labels "Tab group"/"Stack group"/"Group" (+ short forms), `ph:device-mobile`, platform glyphs.
- **`search-input.tsx`**, **`use-focus-within.ts`**, **`use-reduced-motion.ts`** — kept/adapted from the prior panel.

### Deliverable 2 — `dialogs/group-dialog.tsx`
Controlled `GroupDialog({ open, onOpenChange })`, single `<form>`: name (prefilled `Group N` mirroring the store's `nextGroupName`; empty → store falls back), three nav cards (Tabs/Stack/None, each resetting count 3/2/1), screens stepper (−/+ clamped 1–10, `aria-live`) + live inline-editable name list (`Screen N…` continuing store numbering; blanks fall back), device `Select` from `DEVICE_PRESETS` (read-only import; platform glyph + label; seeded from `ui.lastDeviceId`), summary line `app/(<kebab-dir>)/ · N screens · <Nav> · <Device>` with dir mirroring `createGroup`'s slug+uniquify. Create → `createGroup({ name, navKind, screenCount, deviceId, screenNames })` → close; the store auto-expands the new group and the tree scrolls it into view. Esc/Cancel via Radix + `DialogClose`. `onOpenAutoFocus` focuses + selects the name input so **Enter creates** (previously focus landed on the first tabbable — the ✕ — so Enter closed the dialog; fixed and verified).

## 2. DnD operations (HTML5 pattern reused from the old layers-section — see note)
| drag | targets | store call |
|---|---|---|
| group | group rows, edge zones (½ split) | `moveGroup(id, idx or idx+1)` |
| screen | screen rows (edge, ½) — reorder within AND across groups; group rows (whole row = inside) — append to that group; bottom dashed zone — make standalone | `moveScreen(id, groupId, index)` |
| layer | layer rows three-zone (¼ edge / middle inside; inside only when registry `children === 'any'`); own screen row (inside → root) | `moveNode(id, parentId, index)` |

Guards: no self-drop; layers never leave their screen; layer-into-own-subtree blocked (tree-side `isInSubtree` + store-side `collectSubtree` check). `moveScreen` in/out of tabs groups rebuilds `items` binding (verified: dragging Login into a tabs group re-serialized tab labels). Indicator: `above`/`below` hairlines + `inside` inset ring; cleared on list dragleave. Keyboard equivalents Alt+↑/↓.

> **Note on "dnd-kit":** the task said to reuse the DnD patterns from `layers-section.tsx`, but that file's actual machinery was **HTML5 drag events with zone math** (open-pencil port), not dnd-kit — dnd-kit is installed but unused here. I reused/adapted that HTML5 pattern (same contract the canvas host's placement code still expects). No new dependencies either way.

## 3. Icons used (all verified against `@iconify-json/ph`, icons+aliases)
`ph:plus` `ph:folder-plus` `ph:file-plus` `ph:caret-right` `ph:gear-six` `ph:trash-simple` `ph:eye` `ph:eye-slash` `ph:squares-four` `ph:stack` `ph:rows` `ph:device-mobile` `ph:square` `ph:apple-logo` `ph:android-logo` `ph:x` `ph:check` `ph:minus` — 18/18 OK (script: strip `ph:` prefix, check `icons`+`aliases`). Layer glyphs come from the registry (`ph:square` view, `ph:text-aa` text, etc.).

## 4. Files deleted (palette removal)
`palette-section.tsx`, `stub-data.ts`, plus the rest of the old multi-section panel superseded by the single tree: `layers-section.tsx`, `screens-section.tsx`, `panel-header.tsx`. Palette/stub types scrubbed from `left-panel/types.ts`. No file outside the two owned directories was touched (verified via `git status` + import sweep: only `src/app/page.tsx` imports `LeftPanel`, already zero-props).

## 5. Runtime verification (agent-browser, real dev server)
Empty state CTA → dialog (defaults, name→summary live kebab, nav switch resets count, stepper, inline screen names, device select) → create (4-screen Stack "Shopping": custom "Catalog" + Screen 2–4, pixel-10/android, 3-per-row canvas layout, group selected+expanded+scrolled into view) → Enter-create with defaults (Group 1, tabs, Screen 5–7) → Esc-cancel (no side effects) → header + quick standalone screen (Screen 3 → selected+active) → group inline rename (`Main`→`Main area`, dirName regen) → screen rename (`Screen 5`→`Profile`, route regen `/profile`) → layer rename (`View`→`Card`, `setNodeName`) → eye toggle (`hidden:true`) → layer trash (no confirm, selection cleared) → group delete confirm (Cancel no-op; Delete cascades group+screens+nodes, selection/active nulled) → DnD: Login→Main group row (cross-group, tabs rebuilt), Text→View edge (below, reindexed), Text→View center (inside reparent), Auth→below Main (group reorder), Screen 2→Screen 1 row (into standalone bucket), Settings→dashed zone (standalone append) → search (sett→Settings only; no-match keeps groups; real-keystroke clear restores all rows + divider) → `/` focuses filter → two-state selection (`bg-panel-selected` ⇄ `bg-panel-selected-muted` on canvas focus). One test-tool artifact (Playwright programmatic `fill("")` + React value-tracker dedup) was investigated and confirmed NOT an app bug — real keystrokes clear correctly.

## 6. Store API gaps (report-only — store NOT edited)
1. **`setExpanded` is a plain `set`, not `commit`** — intentional (view state), but it means expansion changes are not undoable while `ui` IS snapshotted (undo restores an older `ui.expanded`). No action needed; noting the asymmetry.
2. **No `setLastDevice`/`setLastPlatform` without a screen** — the dialog works around it by always passing `deviceId` through `createGroup`/`addScreen` (which do record it); a TopBar-style workaround (`useProjectStore.setState`) is already documented by task 10-F for platform.
3. **`moveScreen` does not move the artboard canvas position** when a screen changes groups — the artboard stays where it is (fine today; a future "repack group block" nicety).
4. **`deleteGroup`/`deleteScreen` don't clean `ui.expanded` keys** for removed ids (harmless orphans in the persisted map).
5. **`renameGroup` cannot rename to the same dirName as another group's *name*** edge cases are handled via `uniqueSlug`; no gap in practice.

## 7. Handoff notes for other tasks
- **Canvas rework:** the tree expects node creation via `insertNode` (that's the only remaining source of layers); `data-tree-id` on rows + `[role=treeitem]` are stable hooks. Canvas-side `select`/`setActiveScreen` already highlight + auto-expand + scroll the tree (verified).
- **`screens/canvas-host.tsx`** (not mine) still carries the old palette-drop mime listener (`palette drops — left panel contract`); dead code now that the palette is gone — the canvas task should remove or repoint it to the toolbar insert tools.
- **Right panel inspector:** group rows' `ph:gear-six` selects the group (selection `{kind:'group'}`) — the inspector's nav tab already keys off that.
