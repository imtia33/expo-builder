# 01 — Research Findings (verified)

> Digest of the three research tasks (2-a open-pencil, 2-b Reanimated/RN, 2-c ecosystem).
> Every version/API claim below was verified against npm registry output, published
> tarballs, or cloned repo source on 2026-10-31/11-01. Full detail lives in the
> domain docs; this file is the shared fact base.

## 1. open-pencil (the UI donor)

Repo: https://github.com/open-pencil/open-pencil — MIT, Bun monorepo, **Vue 3 + Vite 8**
(not React — this drove the canvas decision, `02-architecture.md` §1).

**What we copy verbatim (MIT, with attribution comments):**
- Pan/zoom wheel math — `packages/vue/src/shared/input/wheel.ts`:
  pan = 2×delta capped 120px; Ctrl/Cmd pinch `2^(-deltaY/50)`; plain mouse zoom
  `e^(-0.005·deltaY)`; Windows notch ×2.5 within 50ms; rAF accumulate+flush.
- Touch pan/pinch — `packages/vue/src/shared/input/pan/zoom.ts` (two-finger pinch,
  single-finger pan, synthetic mouse events for tools).
- Anchor zoom formula — `packages/core/src/editor/viewport.ts`:
  `pan' = center - (center - pan) * (zoom'/zoom)`; clamp 0.02–256.
- Theme tokens — `src/theme/tokens.css` (Tailwind 4 `@theme`; dark Figma-like:
  `--color-panel: #2a2a2a`, `--color-component: #bb8cff`, …) + `src/theme/*.ts`
  (tailwind-variants — framework-agnostic, port as-is).
- UX patterns: bottom-center toolbar pill (`src/components/toolbar/DesktopToolbar.vue`,
  `shadow-[0_8px_30px_rgb(0_0_0/0.4)]` + `rounded-xl`), MIXED sentinel for
  multi-selection, scrub-commit number fields, flyout selection memory, undo
  batching + coalescing (`packages/scene-graph/src/undo.ts`, 200-entry cap),
  HTML5 DnD dataTransfer pattern from AssetsPanel, zoom-dropdown presets.

**What we do NOT take:** the CanvasKit/Skia renderer (static drawings; our content is
live RNW), the Vue SDK, Tauri shell, collab/Yjs (v1 single-user), cloud/AI/MCP.

## 2. Expo / React Native core (as of 2026-11-01)

| Package | Latest stable | Note |
|---|---|---|
| expo | **58.0.22** (SDK 58) | GA 2026-09-29 |
| react-native | **0.88.1** | pinned by SDK 58 |
| react / react-dom | **19.3.1** / SDK pins **19.3.0** | |
| expo-router | 58.0.29 | file-based routes; entry `expo-router/entry` |
| react-native-reanimated | **4.7.1** | requires `react-native-worklets` 0.13.x; **New Arch only** (default in SDK 58) |
| react-native-worklets | **0.13.1** | separate package; babel plugin lives here (`react-native-worklets/plugin`) — auto-injected by `babel-preset-expo`, so generated babel.config.js stays plain |
| react-native-gesture-handler | **3.4.0** (SDK pins ~3.3.0) | `Gesture.Tap()` builder **deprecated** → hook API (`useTapGesture` etc.); callbacks `onBegin/onActivate/onUpdate/onDeactivate/onFinalize`; composition `useSimultaneousGestures(...)` |
| react-native-web | 0.21.4 | our canvas renderer |

## 3. Reanimated 4 — the rules that matter to us

- **State-driven animation → CSS transitions** (recommended default):
  `transitionProperty/Duration/Delay/TimingFunction` + pseudo-selectors
  `:hover` / `:active` (press) / `:focus` on `Animated.*` styles. No React state needed.
- **CSS keyframes**: `animationName` + `animationDuration/…` with keyframes objects.
- **Entering/exiting**: `FadeIn/SlideInDown/BounceIn/ZoomIn/...` builders with
  `.duration()/.delay()/.easing()`; custom via `new Keyframe({0:{...},100:{...}})`.
- **Layout**: `Layout`, `LinearTransition`, `SequencedTransition`,
  `EntryExitTransition.entering(a).exiting(b)`.
- **Gestures** (RNGH 3 hooks): `usePanGesture({ onUpdate })` inline callbacks are
  auto-workletized — **no `'worklet';` directive** unless hoisted to a variable.
- **Scroll**: `useScrollOffset(useAnimatedRef())` (renamed from deprecated
  `useScrollViewOffset`); `useAnimatedScrollHandler` still fine for rich events.
- **Springs**: `withSpring` new Gentle defaults (damping 120, mass 4, stiffness 900);
  `duration` is perceptual (actual = 1.5×) — emit explicit configs.
  `restDisplacement/SpeedThreshold` are GONE (→ `energyThreshold`).
- **Threading**: `runOnJS`/`runOnUI` deprecated re-exports → `scheduleOnRN(fn, ...args)`
  / `scheduleOnUI(fn, ...args)` from `react-native-worklets` (new direct-arg signature).
- **Inline shared values**: `<Animated.View style={{ width }} />` — SharedValue
  directly in style; no `useAnimatedStyle` needed for simple cases.
- **Shared transitions**: `sharedTransitionTag` / `sharedTransitionStyle`.
- **FORBIDDEN** (gate G11): `AnimateStyle` type (gone → `AnimatedStyle`),
  `useAnimatedGestureHandler`, `useWorkletCallback`, `combineTransition`,
  `useScrollViewOffset`, `Extrapolate` (→ `Extrapolation`), curried `runOnJS(fn)(args)`,
  `Gesture.Tap()` builders, `entryEffect` (never existed), `addWhitelistedNativeProps`.
- `useAnimatedKeyboard` → use `react-native-keyboard-controller` instead.

## 4. Ecosystem inventory (palette-relevant)

**Use (current, verified):** expo-image, expo-video, expo-audio, expo-camera,
expo-blur (iOS glass; Android via `BlurTargetView` + ref since SDK 55, RenderNode
API 31+), expo-linear-gradient (Android-only `dither` prop), expo-checkbox,
@react-native-community/slider, @react-native-community/datetimepicker,
@shopify/flash-list **2.3.3** (default list — v2 is new-arch-only JS rewrite, no
`estimatedItemSize`, built-in pull-to-refresh, masonry), react-native-svg 15.16.0,
react-native-pager-view 9.0.11 (new-arch only), lottie-react-native 7.5.0,
react-native-webview 14.0.1, react-native-bottom-tabs 1.5.0 (native tabs flavor),
react-native-keyboard-controller 1.22.9, @react-native-async-storage/async-storage
3.1.1, react-native-mmkv 4.3.2 (dev-build only), expo-secure-store, expo-haptics,
expo-notifications, expo-location, expo-local-authentication, expo-sharing,
expo-clipboard, expo-sensors, expo-print, expo-web-browser, expo-linking,
expo-constants, expo-font, expo-splash-screen, expo-status-bar, expo-router,
zustand 5.0.16 (works in RN), @tanstack/react-query 5.105.1 (works in RN).

**Deprecated / banned from palette:** expo-av (→ expo-audio + expo-video),
recyclerlistview (dormant), react-native-keychain (→ expo-secure-store),
@react-native-community/checkbox (→ expo-checkbox), react-native-restart (→
`expo-updates.reloadAsync()`), phantom packages `react-native-mmk` and
`@tanstack/query-react-native` (never existed).

**Full per-component detail (props, flavors, platform tiers, flow hooks):
`04-component-registry.md`.**

## 5. Codegen fact base

- Project template pins + file tree: `06-codegen.md` §1.
- Babel: plain `babel-preset-expo` (auto-injects worklets plugin — verified in
  `babel-preset-expo@58.0.23` source). Emitting a manual plugin fails gate G6.
- Inline styles only — `StyleSheet.create` etc. fail gate G5.
- Press pseudo-selector is **`:active`** (verified in reanimated 4.7.1
  `css/types/pseudo.d.ts`) — earlier ":press" rumor corrected.
- FlashList v2: drop-in FlatList replacement; no `estimatedItemSize`; emit
  `renderItem` from the item-template subtree.
- expo-router: `app/_layout.tsx` wraps `GestureHandlerRootView → SafeAreaProvider →
  Stack/Tabs`; one kebab-case file per screen; typed routes on.
- Flows: async handlers with try/catch/finally; loading state policy and mock API
  shape: `06-codegen.md` §4.

## 6. open-pencil constants we keep (quick reference)

- Wheel: pan `2×delta` cap 120px; pinch `2^(-ΔY/50)`; mouse zoom `e^(-0.005·ΔY)`;
  Windows notch ×2.5 @50ms; flush on rAF.
- Zoom clamp: 0.02–256. Anchor: `pan' = c - (c - pan)(z'/z)`.
- Undo: command pattern `{label, forward, inverse, coalesceKey}`; batch per gesture;
  200-entry cap.
- Toolbar pill shadow: `0_8px_30px_rgb(0_0_0/0.4)`; panel `#2a2a2a`;
  component accent `#bb8cff`; selection/snap magenta `#ff0090` (5px snap, 6-line).
