# 13 — Phase 0 Audit: Existing Implementation Inventory

> Date: 2026-11-02. Closes the audit phase of the improvement spec.
> Sources: full codebase/docs read (02/04/08/09/11/12 + core sources), live test baseline,
> `docs/research/open-pencil-study.md` (UI reference), `docs/research/capability-matrix.md`
> (reference-app comparison). Research clones live in `/research/` (untracked).

## 1. Test baseline (this session)

- `vitest run`: **22/22 passed** (history 10, project-store 12). Working tree = commit `5a4cd3b` + this audit.

## 2. Functionality inventory — classified

### Working correctly (preserve, never rebuild)
| Feature | Evidence |
|---|---|
| DOM infinite canvas: pan/zoom (Figma-calibrated math), placement mode, selection/move/resize, snap guides (artboard-local, post-M1), group frames, screen-space chrome layer | `src/lib/canvas/*`, `src/components/builder/canvas/*`, `screens/*` |
| Live react-native-web preview with global iOS/Android variant simulation | `src/expoforge/preview/renderer.tsx` |
| Sim mode: per-artboard tab/stack navigation, interactive RNW (inputs/scroll/press) | `SimState` in `types.ts`, `screen-artboard.tsx` |
| Screen hierarchy: groups (Stack/Tabs/None) → screens → layers; group dialog; DnD | `left-panel/*`, `dialogs/group-dialog.tsx` |
| Contextual inspector: Props/Style/Screen/Nav/Code/Project tabs, schema-driven fields | `right-panel/*` |
| Registry-driven components (11 entries) + implementation switching (image, tab bar) | `src/expoforge/registry/*` |
| Codegen: complete Expo Router app/ tree, verified vs expo-router@58.0.29 | `src/lib/codegen/*` |
| Transactional undo/redo + inline text editing (M1) — 22 tests | `history.ts`, `tests/*` |
| Persistence: localStorage `expoforge:project:v2` | `store.ts` |

### Working but needs improvement
| Feature | Why |
|---|---|
| Toolbar / panels / icons vs Open Pencil | Entire Phase 1 (see §4) |
| Screen-swap crossfade in sim (tab switching) | Flickers — Phase 3 (see §3) |
| Hover popovers / tooltips | Flicker — Phase 3 (see §3) |
| ScrollView insertion path (palette-only, `contentContainerStyle` gap) | docs/09 §4 — folds into Phase 2 |
| Code tab | Read-only (parse-back store API exists, no UI) — Phase 4 candidate |

### Partially implemented
| Feature | State |
|---|---|
| Interaction/event wiring | `flowHooks`/handler shapes prepared in registry + codegen; nothing user-facing (matrix P0-1) |
| Animation specs | `NodeAnimations` (entering/exiting) in the model + animations catalog; no editor UI |
| `rawCodeProps`/`codeOverride` | Model + codegen emit them; `applyCodePatches` has no UI |
| Server-side project CRUD | `/api/projects` per docs 02 — not re-verified this session; localStorage is the verified path |

### Broken
None beyond the two flickers below (no other regressions found in test baseline + docs).

### Missing (capability-matrix summary — full detail in `docs/research/capability-matrix.md`)
- **P0 ladder** (used by 3–4/4 reference apps): event wiring → dynamic lists (FlatList/SectionList) → data/API binding → authentication → forms.
- **P1**: state management, reusable components/variants, modals & bottom sheets, custom inputs (Password/Select/OTP/Chips), animation editor, nav polish (per-screen transitions/presentation, top-tabs, tab-bar composition), theme system (dark/light).
- **P2**: keyboard handling config, toast/haptics/clipboard actions.
- **P3 (specialized components)**: chat message list, maps, charts, WebView, date pickers, bottom sheets as components.
- **Not needed for parity**: streaming (0/4 apps), push (server-side), SQLite sync (custom code), pathfinding (custom code).

## 3. Confirmed bugs (user-reported) + investigation notes

### Bug A — Tab-switch flicker in simulation
- **Symptom**: screen contents flash while switching tabs during sim.
- **Located**: `screen-artboard.tsx` — `AnimatePresence` + keyed `motion.div` crossfade (150ms). During the transition BOTH layers are semi-transparent (old 1→0, new 0→1), so the screen background bleeds through → perceived flash. Full `ScreenTreePreview` remounts on key change adds teardown cost.
- **Fix direction (Phase 3)**: fade ONLY the incoming layer on top; keep the outgoing layer fully opaque beneath until the incoming reaches opacity 1. No arbitrary delays. Preserve per-artboard nav state (already in `SimState.history`).

### Bug B — Popover/tooltip flicker on hover
- **Symptom**: tooltips/hover popovers flash while appearing.
- **Suspects (to investigate in Phase 3)**: enter/leave handling on the trigger boundary, portal positioning updates, repeated open/close updates, mount animations. Requirement: moving the pointer from trigger INTO the popover must not close it.
- **Reference solution**: Open Pencil's tooltip system (400ms open delay, 300ms skip window, claim event, `pointer-events-none`) — full spec in `docs/research/open-pencil-study.md` §6; port pattern to our `toolbar/tip.tsx` + radix overlays.

## 4. Open Pencil comparison — actionable deltas (Phase 1 scope)

Full study with every value: `docs/research/open-pencil-study.md`. The 12 numbers that matter most:
1. Toolbar pill: 12px radius, 4px padding, 2px gaps, `0 8px 30px rgba(0,0,0,.4)`, 16px off bottom, centered; 32×32 buttons, 16px icons; active = solid accent + white icon.
2. Layer rows 24px, 16px indent/level, 12px icons; unfocused-selection gray state.
3. Panel sections: 12px h-padding, 32px headers, 11px semibold titles, 1px dividers; fields 24px, 2-col grid, 6px gaps, #383838→#404040 hover→#3b82f6 focus; 11px tabular-nums, ew-resize scrub.
4. Floating surfaces: 12px radius, panel bg, hairline ring + soft shadow, 150ms zoom-95 grow + 4px side slide-in, **no exit animation**.
5. Tooltips: 400ms open delay, 300ms skip window, max 320px, 4px offset.
6. Tokens: the full dark/light sheet is in the study §8 — port into our `theme/tokens.css` gap analysis during Phase 1.
7. Type: Inter 13px base, 11px panels; semibold only titles/active.

**Apply to OUR existing components** (improve, not replace): `toolbar/builder-toolbar.tsx` + `tool-flyout.tsx` + `tip.tsx`; `left-panel/tree-row.tsx` + `tree-theme.ts`; `right-panel/*` field grid + section headers; `theme/*` token gaps. Icon replacements per the required identifiers table (WORKLOG Phase 1) via new `@iconify-json/*` collections — never random substitution.

## 5. Proposed improvements → phases (with acceptance criteria)

| Phase | Scope | Acceptance |
|---|---|---|
| 1 — Visual | Toolbar/panels/menus/popovers/tooltips/canvas controls to Open Pencil values; required icon identifiers integrated | Side-by-side parity on the 12 numbers; no functionality change; 22 tests still pass |
| 2 — Insertion | View options (View/SafeAreaView/ScrollView); lists (FlatList, SectionList, horizontal, grid, manual; data source, item template, headers/footers/separators/empty/loading); button impl choice (Pressable default/TouchableOpacity/TouchableHighlight/RN Button) | Inserting each creates the correct underlying RN component in preview AND codegen; extends existing registry/picker — no second picker |
| 3 — Runtime | Bug A (crossfade), Bug B (popovers) + any remount/state-preservation issues found | Tab switching visually clean at 60fps; pointer can travel trigger→popover without closing; no delays as "fixes" |
| 4 — Capability gaps | P0 ladder first (events → lists-runtime → data → auth → forms), then P1 by frequency | Each capability demonstrable in a reference-app scenario; no speculative features |
| 5 — Verification | Regression list | Existing projects open; screens intact; components functional; new types work in editor+sim; flickers gone |

## 6. Technical dependencies

- **Phase 1**: `@iconify-json/codicon`, `-ant-design`, `-akar-icons`, `-andrsrx`, `-reicon`, `-f7`, `-iconmind` (offline collections; verify each exists on npm — fall back to curated local collections if a name is absent).
- **Phase 2**: `react-native-safe-area-context` (codegen side; already the emitted safe-area source — reuse, don't add). No new editor deps expected.
- **Phase 4**: reanimated already modeled (`NodeAnimations`); data/auth/forms introduce no new editor deps until their design lands (per-milestone decision).
