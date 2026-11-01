# WORKLOG — ExpoForge Visual Builder

> Living document. **Update after every phase.** Never delete entries — mark them.
> Status: ◻ todo · ◐ in progress · ✔ done · ✖ blocked
> Push target: `github.com/imtia33/expo-builder`, branch `main` (owner-provided PAT at push time; never stored in files).

---

## ✔ DONE — shipped in earlier sessions

### 2026-11-01 — v1 foundation (initial commits)
- Theme system (open-pencil `tokens.css` + tailwind-variants ports), app shell, DOM infinite canvas, device artboards, live react-native-web preview per artboard.
- Component registry v1 — 11 entries: view, text, textinput, button (Pressable composite), scrollview, image (expo-image ⇄ core Image impl switching), switch, divider, lineargradient, blurview (platform-variant), activityindicator + tabs group config.
- Zustand project store (`src/lib/project/store.ts`), Expo Router codegen (`src/lib/codegen/`) verified against expo-router@58.0.29, docs 00–12.

### 2026-11-01 — v2 editor rework (docs/09-rework-v2.md)
- Screen hierarchy (groups → screens → inline layers), group nav kinds Stack/Tabs/None, group-creation dialog, DnD across groups.
- Figma-like canvas: placement mode, node selection/move/resize with snap guides, non-overlap placement, sim mode (per-artboard tab/stack navigation), contextual inspector (Props/Style/Screen/Nav/Code/Project), top bar with global iOS/Android + Simulate.
- Verified end-to-end in live browser (see docs/09 §3).

### 2026-11-01/02 — v3 shared contracts + canvas chrome (commits 4dbfb94, 8e84409)
- Rich prop schema, per-component implementations, animations catalog, semantic icon slots (`src/components/builder/icons/slots.tsx`), global platform context, group canvas geometry, code-override fields.
- Icon-slot system + Figma canvas chrome (viewport layer, screen-space chrome, group frames) + tab-bar implementation switching (native ⇄ custom, both previewed from one config).

### 2026-11-02 — M1 correctness (commit 252426b, docs/12 §8)
- Transactional undo/redo (`src/lib/project/history.ts`): leak-proof gesture tokens + watchdog; copy-on-write store mutations; snap-guide coordinate fix (single artboard-local space); inline text editing on canvas; vitest suites (`tests/history.test.ts`, `tests/project-store.test.ts`).

### 2026-11-02 — this session
- Read the improvement spec (Open Pencil parity, component insertion, flicker fixes, capability comparison vs reference apps — `upload/prompt-20261101-231739.txt` context).
- ✔ Created this worklog; ✔ pushed to github.com/imtia33/expo-builder (clean squashed import — old history kept locally on branch `history-backup-preimport`; `.env` + `upload/` de-tracked; note: an intermediate push briefly exposed the old history on the remote — force-pushed over with the clean root; `.env` contains only a local DB path, no secrets).
- ✔ Phase 0 audit completed (see below).

### ✔ 2026-11-02 — Phase 0: implementation audit (spec §1) — COMPLETE
- Inspected: all docs; git history; registry + preview + artboard sources; `types.ts` (full data model); `store.ts` action inventory; `tool-registry.ts`; test baseline **22/22 passing**.
- Open Pencil study → `docs/research/open-pencil-study.md` (concrete values: pill geometry, 24px layer rows, field/section rhythm, tooltip 400/300ms logic, full dark/light token sheet, 10 files worth porting).
- Reference-app study → `docs/research/capability-matrix.md` (Appwrite-Native, Crimson, TravelMate cloned; **z.ai-mobile is 404** — re-check later; Keystone read from upload/). Verdict: builder wins on visual shell + real router codegen, but is an "interactive mockup" — **P0 ladder: events → lists → data → auth → forms** (each used by 3–4/4 apps). Streaming 0/4 (not needed for parity); maps/charts 1/4 each.
- Audit compiled → `docs/13-phase0-audit.md`: inventory (working/needs improvement/partial/broken/missing), both flicker bugs located with fix directions (crossfade alpha-stacking; tooltip enter/leave), phase acceptance criteria, dependencies.

---

## ◐ IN PROGRESS — next: Phase 2 (component insertion)

### ✔ 2026-11-02 — Phase 1: Open Pencil visual alignment + paint system (COMPLETE)

**Scope note:** the user expanded Phase 1 beyond visual alignment: "you will not just copy the ui but features as well — color picking is trash, I cannot pick from gradient like figma" + theme variables "the way reference projects do it without uniwind or nativewind". All three shipped.

**Visual alignment (Open Pencil values)**
- Required 8 icons integrated via the icon-slot system, offline-vendored per-icon (`scripts/vendor-icons.mjs` → `icons/vendor.ts`, 7.5KB — full @iconify-json collections are tens of MB and OOM'd tsc): View `codicon:screen-full` · Screen `ant-design:mobile-filled` · Button `tabler:hand-click` · Image `akar-icons:image` · Text `andrsrxn:text-case-sensitive` (the real prefix of "andrsrx"; verified same glyph) · Text Input `reicon:text-input-focus` · Stack `f7:square-stack-3d-down-right` · Tabs `iconmind:navbar-duotone-thin` — on every surface those concepts appear (toolbar tools, tree, dialogs, canvas group frames).
- Tooltips: hoisted ONE shared Radix Provider to the app root (page.tsx `TipProvider`) with open-pencil timing — 400ms open delay / 300ms global skip window (per-instance providers isolated the skip state; that was why moving along the toolbar re-waited).
- Toolbar pill/buttons/floating surfaces: already matched OP values from the v1 port (verified in study §2 vs `toolbar.ts`) — no churn.
- Canvas selection chrome → open-pencil §7: 1px #3B82F6 outline (was 2px), 6×6px white square handles with 1px selection-color stroke (was 4px dots), accent-filled size pill (18px/4px-radius/white-10px) during resize, NEW position pill during move, NEW hover outline (`NodeHoverOutline`) on the node under the pointer. No rotation handle — the data model has no rotation (documented in the overlay header).
- Align-to-parent toolbar (open-pencil PositionSection parity): 6 lucide align buttons above the X/Y grid in Layout (absolute mode only) → `canvas/align.ts` alignNodeInParent (DOM-truth via measureAgainst + offsetWidth; one setNodeStyle commit = one undo entry). Distribute deliberately omitted (needs multi-select, which the selection model doesn't have).

**Paint system (Figma-like fills) — `src/lib/paint/`**
- PaintValue = solid hex string (fully backward compatible) | gradient `{type: linear|radial, angle, stops}` | theme token `{token}`.
- NEW color picker (`color-field.tsx` rewrite): Solid tab (HSV square + hue rail + alpha rail + hex + % + eyedropper via EyeDropper API) · Gradient tab (draggable/add/remove stops bar, Linear⇄Radial, angle, per-stop solid editor, 5 starter gradients) · Theme tokens row (binds `{token}`) · recent colors (localStorage) · token-bound chip with Detach. Gradient tab only where RN can host it (`field.gradient`: container backgroundColor + screen background).
- Preview: `applyPaints()` resolves tokens via palette+mode, gradients → RNW CSS backgroundImage; gradient capability gated per component (view/scrollview/blurview + containers; Text/Button/etc degrade to first stop) so canvas and code can never drift. Screen background supports solid/token/gradient (artboard div + RNW root View).
- Codegen: tokens → `colors.x` (RawCode) + `const { colors } = useTheme()` + import exactly when used; gradient fills → expo-linear-gradient `<LinearGradient colors locations start end>` wrapper (same math as the lineargradient entry); radial emitted as linear (expo-linear-gradient has no radial — stated in the picker, not hidden).

**Theme variables (reference-app pattern, NO NativeWind/uniwind)**
- Project palette: `data.theme.colors` = light/dark pairs, seeded with 12 TravelMate-style defaults (background/card/text/textSecondary/border/primary/primaryLight/secondary/accent/success/warning/error); store migration seeds it for existing projects.
- Project tab → Theme section (edit light+dark per token via picker, add/delete tokens); top bar → Light/Dark preview-mode toggle (how tokens resolve on canvas).
- Codegen emits `constants/theme.ts` (plain TS COLORS light/dark + ThemeColorName) + `hooks/useTheme.ts` (useColorScheme-based) — the Expo default-template / TravelMate pattern, as requested.

**Fixes found on the way**
- `globals.css`: Tailwind v4 auto-content-detection was scanning `docs/` + WORKLOG — the open-pencil study quotes pseudo-classes with `…` placeholders, which compiled into INVALID CSS (`calc(var(--reka-...-available-height) - 0.5rem)`) and 500'd the app. Added `@source not` excludes for docs/scripts/tests/WORKLOG.
- Falsy-zero bug in gradient angle (`Number(angle) || 45` turned 0° into 45°) — caught by the new unit tests, fixed with isFinite guard.
- tsconfig excludes research/ + examples/ + upload/ + skills/ (untracked research clones were breaking tsc).

**Verification**
- vitest: **49/49** (22 existing + 23 paint + 4 codegen-paint e2e: LinearGradient wrapper, colors.x + useTheme, theme files, SafeAreaView source).
- tsc --noEmit clean; live browser (agent-browser): placed a View → gradient renders on canvas (`linear-gradient(135deg, …)`) → bound `{primary}` (light #2563EB → dark #3B82F6 via toggle) → Code tab emits exactly `import { useTheme } … backgroundColor: colors.primary` and `LinearGradient` wrapper. VLM screenshot review: toolbar pill + 8 square handles + organized right panel confirmed, picker intact (stops bar, Linear/Radial, SV square, tokens), no glitches.

**Phase 3 note:** tooltip timing (400/300 + shared provider) landed here because it was pure Phase-1 chrome; the two flicker ROOT-CAUSE fixes (Bug A crossfade alpha-stacking, Bug B popover enter/leave) remain Phase 3 as planned.

---

## ◻ TODO — committed plan (from the improvement spec)

### Phase 1 — Visual improvements ✔ DONE (2026-11-02, see above) — incl. the user-added scope: canvas selection features (borders/points/alignment), Figma-like gradient color picking, theme variables (plain-TS, no NativeWind)

### Phase 2 — Component insertion improvements
Extend the EXISTING Add Element / registry / rendering infrastructure — no second component picker.
- [ ] View options → Normal View / Safe Area View (via `react-native-safe-area-context`, never RN SafeAreaView) / ScrollView — creating the correct underlying components.
- [ ] Lists: investigate why lists are inaccessible today; then support FlatList, SectionList, horizontal FlatList, grid-style FlatList, ScrollView-based manual lists. Configure: data source, item layout, spacing, headers, footers, separators, empty + loading states. Design ONE item, repeat with dynamic data.
- [ ] Button implementation choice at insertion: Pressable (default) / TouchableOpacity / TouchableHighlight / RN Button — component-specific props, all connected to the existing interaction system (no duplicate engines).

### Phase 3 — Runtime bug fixes (no cosmetic delays)
- [ ] **Tab-switch flicker in simulation.** Initial hypothesis (to verify): `screen-artboard.tsx` crossfades via `AnimatePresence` — during the 150ms transition BOTH layers are semi-transparent, so the screen background bleeds through (flash); plus full `ScreenTreePreview` remount on key change. Fix the underlying mechanism (fade only the incoming layer over an opaque outgoing one, or restructure the swap); preserve screen state per the navigation model.
- [ ] **Popover/tooltip flicker on hover.** Investigate enter/leave handling, pointer boundaries, portal positioning, remounting, hover delays. Moving the pointer from trigger INTO its popover must not close it. Apply consistently to tooltips, menus, popovers.

### Phase 4 — Capability gaps (only what the reference matrix proves relevant)
Filled after the Phase 0 matrix; candidates already visible: flows/interactions wiring, lists runtime, data binding, theme system, custom components. No speculative features.

### Phase 5 — Verification
- [ ] Existing projects still open; existing screens intact; existing components functional.
- [ ] New component types work in editor AND simulation.
- [ ] Tab switching no longer flickers; popovers stable.
- [ ] No regressions in existing functionality.

---

## Development rules (binding — from the spec)
1. Never rebuild; 2. never replace working systems; 3. no duplicate implementations; 4. no unrelated redesigns; 5. never remove existing capabilities; 6. no decorative controls; 7. no hardcoded sample data faking functionality; 8. check dependency compatibility first; 9. follow current Expo/RN docs; 10. parallel subagents for independent research/implementation (coordinate shared files first); 11. verify actual behavior after changes; 12. keep changes scoped and reviewable; 13. document architectural changes; 14. update this worklog after each phase.

---

## Push log
| Date | Commit | Notes |
|---|---|---|
| 2026-11-02 | initial import (squash) | First push; `.env`/`upload/` de-tracked; pre-import history on local branch `history-backup-preimport`. |
| 2026-11-02 | Phase 0 audit | implementation inventory + Open Pencil study + capability matrix. |
| 2026-11-02 | Phase 1 | Open Pencil visual alignment + canvas selection features + gradient color picker + theme variables (see entry above). |
