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

### 2026-11-02 — session restore after sandbox reset
- Sandbox reset reverted the working tree to the platform Next.js template (builder sources, docs, WORKLOG gone locally). Restored everything from `origin/main` @ c4ba001; re-ran `bun install`; vitest **49/49**; `tsc --noEmit` had one latent error from the Phase 1 push (tests/paint.test.ts accessed `.angle` on the `GradientPaint` union — fixed with a linear type-guard narrow; test semantics unchanged). `.env` + `upload/` (untracked) preserved through the reset.

---

## ◐ IN PROGRESS — Phase 4 (capability gaps — P0 ladder: events → lists runtime → data → auth → forms)

### ✔ 2026-11-02 — Phase 4 / slice 1: event wiring — P0-1, the navigate/back rung (COMPLETE)

**Scope:** the #1 capability-matrix blocker (4/4 reference apps — "buttons exist but are inert") shipped as the two actions the builder can already execute END-TO-END: **Navigate (push/replace)** and **Back**. State/set-state/submit/open-modal actions stay unshipped until their systems exist (P1-6 state, P0-5 forms, P1-8 modals) — no decorative controls (rule 6/7).

**Model** (`src/lib/project/types.ts`)
- `InteractionAction = { kind:'navigate', screenId, mode:'push'|'replace' } | { kind:'back' }`; `NodeInteractions = Record<hook, InteractionAction>` on `ProjectNode.interactions`. Deliberately the single-step degenerate case of the docs/05 flow model — flows can later supersede the action type with step lists without a migration.
- `RegistryEntry.hooks?: { hook, label }[]` — the wireable surface is registry-declared (button: `onPress` today), not hardcoded per component.

**One resolver** (`src/lib/interactions/resolve.ts`) — preview, inspector, and codegen all validate through `resolveInteraction()`; `fireInteraction()` executes against the sim runtime. Dangling targets (screen deleted after wiring) resolve to UNWIRED everywhere: preview inert, codegen emits nothing, inspector shows the kind + an empty Screen select to re-pick. The wiring itself survives in the model.

**Store** — `setNodeInteraction(id, hook, action | null)`: registry-validated (only declared hooks wireable), one undo entry per change, `interactions` key dropped entirely when the last hook unwires.

**Inspector** — new "Interaction" section in the Props tab (after Implementation/List role): action select (None/Navigate/Go back) → screen select (every screen, labeled `Name (/href)`, own screen marked `· current`) → Push/Replace segmented. One Radix pitfall found live: **Select items cannot carry empty-string values** — the unwired state uses a `'none'` sentinel (this crashed the panel on first run; fixed and verified).

**Preview** — `PreviewNavContext` (context, not another threaded prop — the recursion already carries childIndex/platform/binding). The artboard provides `{ navigate, back }` bound to its own sim history, ONLY in sim mode (edit mode stays inert — the honest state; the edit pane swallows pointer events anyway). All four button implementations render the wired `onPress`; store is read at click time so a deleted target unwires live. RNW Button keeps its no-op fallback (rendering requirement) when unwired.

**Codegen** (`src/lib/codegen/interactions.ts` + nodes/screens)
- `screenHref()`: `/(group)/route` for grouped screens (the same group-prefixed name form the layout emitters use for Stack.Screen/Tabs.Screen), `/route` standalone — belt-and-braces since route slugs are globally unique.
- Handler attr `onPress={() => { router.push('/(main)/detail'); }}` — inline arrow, valid at screen level AND inside list renderItem templates. `useRouter` imported + `const router = useRouter()` emitted exactly when some handler was emitted (`ctx.nav.router`), never otherwise.
- RN Button: the wired action REPLACES the `/* TODO: wire an action */` placeholder; unwired keeps it. Composite variants gain the handler as the leading attr only when wired — unwired emission is byte-identical to before (pinned by tests).

**Verification**
- vitest **91/91** (76 + 15 new: resolver, store wiring/unwire/validation/undo, href forms, all four impls, item-template button inside renderItem, no-router backward compat, dangling-target no-op, full-file @babel/parser parse). `tsc --noEmit` clean; eslint clean on changed files (the 6 `react-hooks/refs` errors in screen-artboard.tsx pre-exist at HEAD — Phase 3's deliberate read-during-render pattern, not touched).
- Live browser (agent-browser, DOM-level): Interaction section renders on button select; wired On press → Navigate → Screen 2 (push); **Sim mode: clicking the button swaps Screen 1's artboard to Screen 2's tree** (text marker node appears at artboard-1 coordinates); a second button on Screen 2 wired to Go back returns the artboard to Screen 1's tree (full round trip); Code tab: Screen 1 file emits `import { useRouter } from 'expo-router'` + `const router = useRouter();` + `onPress={() => { router.push('/screen-2'); }}`, Screen 2 file emits `router.back()` and no push; switching the wired button to the RN Button implementation keeps the wiring and replaces the TODO placeholder in generated code.

**Next (Phase 4 remaining):** P0-3 data/API binding (mock API layer + fetch + loading/error/empty), P0-4 auth, P0-5 forms — each builds on the state model (P1-6). P0-2's remainder (pull-to-refresh/refreshing, loading states) also waits on state.

### ✔ 2026-11-02 — Phase 5: regression verification (COMPLETE)

**Acceptance checklist (audit §5) — item by item**
- [x] Existing projects still open / screens intact / components functional — `tests/phase5-regression.test.ts`: a pre-Phase-2-shaped project (no impls, no listRole, v1 prop habits) generates its full file set, and every node emits EXACTLY its pre-Phase-2 form: view → plain react-native View (the screen-level wrapper is the only SafeAreaView); button → the Pressable composite with variant preset + hitSlop (node style wins per key); image → the real expo-image API (contentFit prop, tint→tintColor); ScrollView fanout; Switch trackColor composition; Divider axis visual; LinearGradient wrapper; BlurView system→default tint mapping; TextInput; ActivityIndicator. Plus the theme files + useTheme wiring, unchanged.
- [x] New component types work in editor AND simulation — live-verified during Phases 2/3 (canvas placement, array editor, roles, bindings; the sim session rendered the list screen while switching tabs in the tabs group).
- [x] Tab switching no longer flickers — timed DOM probe (Phase 3): outgoing layer opacity 1.0 at 60/120/180ms, incoming fades 0.23→0.77→0.99, held layer unmounts by 300ms.
- [x] Popovers stable — probe (Phase 3): one MOUNT per dwell, single initial positioning pass, clean UNMOUNT, no stuck states.
- [x] No regressions in existing functionality — vitest **76/76** (69 + 7 Phase-5), `tsc --noEmit` clean, and every generated file parses as valid JSX/TS via @babel/parser (two file-level parse suites: phase2 + phase5).
- Two Phase-5 assertions were corrected against the ACTUAL emission during development (image codegen emits the real expo-image API — contentFit — not the preview's RNW resizeMode mapping; the BlurView fixture now exercises the system→default mapping) — the tests pin real behavior, not guesses.

### ✔ 2026-11-02 — Phase 3: runtime bug fixes — both flickers, root causes (COMPLETE)

**Bug A — tab-switch flicker in simulation** (`screen-artboard.tsx`)
- Root cause confirmed: the `AnimatePresence` crossfade animated BOTH layers (old 1→0, new 0→1) — at the midpoint each was ~50% transparent, so the artboard background bled through BOTH → the flash. (The secondary suspect — `ScreenTreePreview` remount cost — was real but secondary.)
- Fix: the outgoing screen now stays **fully opaque beneath (z-1)** for the whole transition; only the incoming layer (z-2) fades in on top. Composite at any t = new·t + old·(1−t) — the crossfade look with nothing behind it but the old screen's own opaque pixels. No AnimatePresence anymore: the held layer is state-driven (`lastShownRef` is read during render, so the first frame of a change already paints the old screen beneath — no intermediate blank frame), and a timer unmounts it after the fade has fully covered it (200ms; 40ms for reduced motion). The timer is the transition's own lifecycle — an animation duration, not a masking delay.
- Live-verified with a timed DOM probe during a real tab switch: old layer opacity stays **1.0** at 60/120/180ms while the incoming layer fades 0.23 → 0.77 → 0.99; held layer unmounts by 300ms. Per-artboard nav history untouched.

**Bug B — hover tooltip flicker** (`toolbar/tip.tsx` + new `toolbar/tooltip.ts`)
- Root cause: our Radix-Tooltip port carried the Radix popper context across triggers — live probes showed the damage: repeated reposition writes per mount (7 style mutations on one tooltip), rapid mount/unmount cycles during sweeps, and dwell-hovers that stopped mounting at all after a fast sweep. Open Pencil hit the same class of problems and **replaced the primitive tooltip with a custom implementation** (documented in the study §6) — we ported that instead of patching Radix.
- The port keeps open-pencil's semantics verbatim: open on pointerover (400ms intent delay) + `:focus-visible` only; instant inside the 300ms global skip window (module-level "warmth"); hides on pointerdown/click and pointer-leave; **claim event** (`expoforge:tooltip-claim`) — an opening tooltip closes any other instantly (nested triggers included); trigger wrapper is `display:contents`; content is pointer-events-none, teleported, positioned by `@floating-ui/dom` with `strategy: fixed` + left/top writes (`transform: false` — the mount animation owns transform), middleware offset(4)+flip+shift, 8px padding; motion `animate-in fade-in zoom-in-95` (tw-animate-css), motion-reduce aware.
- `@floating-ui/dom` added as an explicit dependency (Radix shipped it only transitively). `TipProvider` removed from page.tsx — there are no Radix tooltips left in the builder; the `Tip` API is unchanged, so all six call sites (top bar, toolbar, flyout, variants, style tab) kept working without edits.
- Live-verified: one MOUNT per dwell with correct labels, two position writes per mount (the initial left+top pass — the content is still at opacity 0), clean UNMOUNT on leave, no stuck states across sweeps. Compare the old system's 7-write churn.

**Also resolved from the Phase 0 audit §2 table**
- "ScrollView insertion path (palette-only)" — folded into Phase 2 as planned: ScrollView is now insertable from the View tool's variant menu (and stays a registry/flyout entry); lists carry the `contentContainerStyle` gap need (itemSpacing) — ScrollView keeps its documented children-style-their-own-layout policy.

**Verification**
- vitest **69/69** (no regressions; the two fixes are DOM-level, covered by the live probes above), `tsc --noEmit` clean.

### ✔ 2026-11-02 — Phase 2: component insertion improvements (COMPLETE)

**Scope (spec §2, all three bullets shipped):** View options (3 types), Lists (5 forms + data source + roles + bindings), Button implementation choice (4 impls). Everything extends the EXISTING registry/insert/inspector/codegen systems — no second picker, no duplicate engines.

**Implementation-awareness (the foundation — also fixed a pre-existing gap)**
- `ProjectNode.impl` now flows through EVERY consumer: `resolveNode` + `textPropField` (preview) and `resolveEntry(type, impl)` (codegen) use `effectiveProps` + the active impl's import/component. Until now image's `react-native` variant emitted `expo-image` imports in generated code (v3 shipped impl switching to the preview only) — the inspector also showed no impl props. Both fixed; switching is now consistent end-to-end.
- New inspector section "Implementation" (entries with >1 variants) wired to the existing `setNodeImpl` (which keeps the keys both impls share). The prop surface swaps live with the implementation.

**View options (3 types)**
- View tool → open-pencil dual-button [main][caret]; menu: View / **Safe Area View** (`react-native-safe-area-context`, never RN core SafeAreaView — the package the screen wrapper already uses; `edges` enum maps to the array form, 'all' = package default, nothing emitted) / Scroll View (existing entry — cross-type variant, no duplicate implementation).
- Preview: RNW SafeAreaView (real component; web insets are zero inside the artboard — renders as a plain container, documented in the impl description).

**Button implementation choice (4)**
- One composite look (variant presets + typography split, shared by preview and emitter) across **Pressable** (default) / **TouchableOpacity** / **TouchableHighlight** / **RN Button**. Impl-specific props (activeOpacity, underlayColor, hitSlop, android_ripple) are emitted only when set — RN's documented defaults apply on device.
- RN Button: RN's types REQUIRE onPress, so generated code carries an explicit `/* TODO: wire an action */` placeholder (stated in the impl description); the other variants keep onPress omitted — no dead handlers. All variants remain wired to the same interaction model (onPress stays code-controlled until the flow system lands).

**Lists (5 forms + the full list stack)**
- Toolbar List tool (L) → menu: Flat List (vertical) / Horizontal (inserts `horizontal: true`) / Grid (numColumns=2) / Section List (cross-type) / Manual list (ScrollView — existing entry). Horizontal/grid are insert-time props: visible + editable in the inspector afterwards; `numColumns` is hidden while horizontal (`visibleWhen` — new generic schema gate, applied by inspector AND emitter).
- **Data source**: static array (array editor — the registry 'array' PropField finally gets its control; ghost rows = registry defaults, first edit commits the whole array, one undo entry). flatlist `data` (title/subtitle/image rows), sectionlist `sections` (header + nested rows).
- **Roles** (`node.listRole`): direct list children are the **item template** (default) or header/footer/separator/empty (ListHeader/FooterComponent, ItemSeparatorComponent, ListEmptyComponent; for sectionlist, header = renderSectionHeader). Inspector "List role" select + tree chips; `setNodeListRole` in the store.
- **Bindings** (`src/lib/lists/bindings.ts` — ONE resolver, preview + codegen both consume it, so canvas and code can never drift): Text content / Image source / button title accept `{item.title}`, `{item.address.city}`, `{section.header}`. Safe member chains only (1–4 identifier segments) — user strings can never become arbitrary generated code. Preview: resolved → value, missing/non-primitive → the raw `{item.…}` text (honest unresolved signal). Codegen: real expressions (`<Text>{item.title}</Text>`, `source={{ uri: item.image }}`) via a new RawCode-spliced attr form.
- **Seeding**: inserting a list creates its item template (in-flow card View + bound Text) in the SAME undo entry — the canvas immediately shows repeating rows fed by the data source. SectionList also seeds a header child bound to `{section.header}`. Everything seeded is ordinary model content (restyle/re-bind/delete freely).
- Codegen: `renderItem` / `renderSectionHeader` arrow attrs + element-typed chrome attrs (new JSX-IR attr kinds 'arrow'/'jsx'); fragment support (`<>`) for multi-child templates; `data`/`sections` inline literals (explicit rows, else registry default); `itemSpacing` → `contentContainerStyle={{ gap }}`; `keyExtractor` deliberately omitted (RN's index default is correct for static arrays — reasoning in nodes.ts).

**Fixes found on the way**
- jsx.ts fragment open tags rendered `<>>` (the generic `>` suffix applied to `<>`); arrow/jsx attr bodies joined with double indentation (renderElement lines already carry their own indent). Generated output re-validated with @babel/parser (full-file JSX parse OK).
- RNW 0.21.4 ships Button/FlatList/SectionList/SafeAreaView/Touchables as real components — only the ambient .d.ts lacked them; extended `react-native-web.d.ts` from the dist flow types (same discipline as the original file).
- `setNodeListRole` first draft guarded on the wrong side (child-is-list instead of parent-is-list) — caught by the new store tests.
- Seed styles cleared `height` (the view entry's insert default 120 leaked into template cards).

**Verification**
- vitest **69/69** (49 existing + 20 new: bindings, impl-aware registry, store insertion, seed, and end-to-end emitter assertions on exact generated source). `tsc --noEmit` clean.
- Live browser (agent-browser, DOM-level assertions — no VLM available in this session): toolbar carets + all variant menus; Flat List placed on canvas → 3 repeated rows with per-row bindings; array editor edit ("Item 1"→"Espresso") updates the canvas instantly; role switch to header renders once with the raw binding (honest); Code tab shows the live file — FlatList + data literal + `renderItem={({ item}) => (` + bound expressions; Safe Area View variant emits node-level SafeAreaView; RN Button variant renders a real RNW button; Section List variant renders per-section headers from `{section.header}`.
- **Honest gaps documented, not hidden**: numColumns on the RNW canvas may not lay out as a grid (device-only behavior, previewNote + description state it); pull-to-refresh/refreshing and loading/error states need state — deferred to the events/data module (Phase 4) per the Phase 0 matrix; API data binding likewise (static local arrays ship now — the TravelMate pattern).

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

### Phase 2 — Component insertion improvements ✔ DONE (2026-11-02, see above)
Extended the EXISTING Add Element / registry / rendering infrastructure — no second component picker.
- [x] View options → Normal View / Safe Area View (via `react-native-safe-area-context`, never RN SafeAreaView) / ScrollView — creating the correct underlying components.
- [x] Lists — were inaccessible because no list entries existed in the registry (the audit's finding); now: FlatList, SectionList, horizontal FlatList, grid FlatList, ScrollView-based manual lists. Configured: data source (static array editor), item layout (in-flow template + spacing), headers, footers, separators, empty states (roles). Design ONE item, repeat with dynamic data (bindings + real RNW FlatList/SectionList on canvas).
- [x] Button implementation choice at insertion: Pressable (default) / TouchableOpacity / TouchableHighlight / RN Button — component-specific props, all connected to the existing interaction system (no duplicate engines).

### Phase 3 — Runtime bug fixes (no cosmetic delays) ✔ DONE (2026-11-02, see above)
- [x] **Tab-switch flicker in simulation.** Root cause: crossfade alpha-stacking — both layers semi-transparent, background bled through. Fixed by holding the outgoing screen opaque beneath the fading-in layer; verified with a timed DOM probe (old layer stays opacity 1.0 through 60/120/180ms).
- [x] **Popover/tooltip flicker on hover.** Root cause: the Radix-Tooltip port's shared popper context (reposition churn, stuck open state). Replaced with open-pencil's custom tooltip system (claim event, global warmth, display:contents trigger, floating-ui fixed/transform-less positioning) — the study's reference solution.

### Phase 4 — Capability gaps (only what the reference matrix proves relevant)
Filled after the Phase 0 matrix; candidates already visible: flows/interactions wiring, lists runtime, data binding, theme system, custom components. No speculative features.
- [x] **Slice 1 (P0-1 event wiring) — DONE 2026-11-02, see above:** registry-declared hooks (button `onPress` today) wire to Navigate (push/replace) / Back — one resolver, sim runtime, inspector section, expo-router codegen (inline handlers incl. list item templates; RN-Button placeholder replaced; dangling targets emit nothing).
- [ ] P0-3 data/API binding (mock API layer, fetch, loading/error/empty states) — needs the state model.
- [ ] P0-4 auth flows — needs state + data.
- [ ] P0-5 forms (validation, secure entry, submit lifecycle) — needs state + events(actions beyond nav).
- [ ] P1-6 state management (screen state + app store) — the enabler for the above + set-state actions + P0-2's remainder (pull-to-refresh, loading states).

### Phase 5 — Verification ✔ DONE (2026-11-02, see above)
- [x] Existing projects still open; existing screens intact; existing components functional (pre-Phase-2 fixture + live persistence).
- [x] New component types work in editor AND simulation.
- [x] Tab switching no longer flickers; popovers stable (timed probes).
- [x] No regressions in existing functionality (76/76, tsc clean, generated files parse as JSX).

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
| 2026-11-02 | restore after sandbox reset | Working tree re-cloned from origin/main; latent tsc error in tests/paint.test.ts fixed. |
| 2026-11-02 | Phase 2 | Component insertion: impl-aware registry/codegen/inspector end-to-end; View 3 options; Button 4 implementations; Lists 5 forms + data sources + roles + bindings (see entry above). |
| 2026-11-02 | Phase 3 | Both flickers fixed at root cause: opaque-under-fade screen swap; open-pencil custom tooltip system replacing the Radix port (see entry above). |
| 2026-11-02 | Phase 5 | Regression verification: pre-Phase-2 backward-compat emission pinned by tests; generated files parse as JSX; 76/76 (see entry above). |
