# 04 · Component Registry — ExpoForge Palette Specification

> **Status:** v1.0 — SINGLE SOURCE OF TRUTH for the ExpoForge palette, props panel, platform-variant simulation, flows, and codegen.
> **Target runtime:** Expo SDK 58 (`expo@58.0.22`, `react-native@0.88.1`, `react@19.3.0` / `react-dom@19.3.0`, new architecture only).
> **Canvas runtime:** `react-native-web@0.21.4`.
> **Version provenance:** every version in this doc was verified against the npm registry (`npm view`) on 2026-11-01 (Task 2-c research), plus Expo/Shopify official docs where noted.
> **Hard product constraints:** (1) inline style objects only — no `StyleSheet`, no NativeWind/Tailwind/Tamagui/styled-components; (2) users never write native code — only existing npm packages via `npx expo install` semantics; (3) per-platform variant behavior (iOS vs Android) must be encoded per component; (4) all interactive components are flow-capable.

---

## Table of contents

1. [Registry schema](#1-registry-schema)
2. [Palette conventions](#2-palette-conventions)
3. [The palette — visual components](#3-the-palette--visual-components)
4. [Behavior blocks — non-visual flow actions](#4-behavior-blocks--non-visual-flow-actions)
5. [Deprecated / do-not-expose list](#5-deprecated--do-not-expose-list)
6. [Custom components (user-defined)](#6-custom-components-user-defined)
7. [Dependency pinning table (codegen)](#7-dependency-pinning-table-codegen)
8. [Open questions](#8-open-questions)

---

## 1. Registry schema

One TypeScript definition drives the palette UI, the props panel, the platform-variant simulator, the flows editor, and the code generator. The registry is a typed JSON document consumed by all four subsystems — never forked.

```ts
// ─── Core enums ────────────────────────────────────────────────────────────
type Category =
  | 'layout' | 'overlay' | 'media' | 'lists'
  | 'inputs' | 'feedback' | 'navigation' | 'device';

type StyleGroup =
  | 'flexbox'        // display, flexDirection, justifyContent, alignItems, alignSelf, gap, flexWrap...
  | 'sizing'         // width, height, minWidth/Height, maxWidth/Height, aspectRatio, flex
  | 'spacing'        // margin*, padding*
  | 'position'       // position, top/right/bottom/left, zIndex
  | 'border'         // borderWidth/Radius/Color, borderStyle
  | 'color'          // backgroundColor, opacity
  | 'typography'     // fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign,
                     // textTransform, fontStyle, textDecorationLine, color, textShadow*
  | 'effects';       // shadow*(iOS)/elevation(Android), transform, overflow, backdropFilter hooks

type ChildrenPolicy =
  | 'leaf'                    // no children (Image, Switch, Slider…)
  | 'container'               // any components as children (View, Modal…)
  | 'text-only'               // plain text content (Text, Button label)
  | 'template';               // fixed slots (FlashList item template, Pager pages, Tabs screens)

type CanvasFidelity =
  | 'native'          // react-native-web renders the real thing
  | 'approximated'    // RNW renders functionally-correct but visually-divergent UI
  | 'shim'            // ExpoForge injects a web-only stand-in for the canvas only
  | 'static-preview'; // canvas shows a locked frame / permission gate; real render on device

type FlavorKind = 'default' | 'native' | 'js' | 'custom' | 'core';

// ─── Props panel ───────────────────────────────────────────────────────────
interface PropDef {
  key: string;                    // exact component prop name in emitted code
  label: string;                  // builder-facing label
  group: 'content' | 'behavior' | 'animation';
  type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'asset'
      | 'date' | 'object' | 'binding'; // 'binding' = value comes from state/flow var
  enumValues?: string[];
  default?: unknown;
  min?: number; max?: number; step?: number;
  bindable?: boolean;             // can the user bind it to screen state / store?
  platform?: 'ios' | 'android' | 'web' | 'all'; // shown only in that variant's panel
  flavors?: string[];             // only applies to these flavor ids
  hint?: string;
}

// ─── Flavors (one palette entry, multiple implementations) ─────────────────
interface Flavor {
  id: string;                     // e.g. 'flashlist' | 'flatlist'
  kind: FlavorKind;
  label: string;                  // "FlashList (recommended)"
  package: string;                // npm dependency (empty = react-native core)
  import: string;                 // EXACT import line emitted
  component: string;              // exported symbol
  isDefault: boolean;
  differences: string;            // what the props panel + codegen change
  expoGoCompatible: boolean;      // works in Expo Go, or needs dev build?
}

// ─── Flows ──────────────────────────────────────────────────────────────────
interface FlowHook {
  prop: string;                   // e.g. 'onPress'
  signature: string;              // e.g. '(e: GestureResponderEvent) => void'
  payload: string;                // what flow steps can reference: '{{event.value}}'
  asyncCapable?: boolean;         // handler may await flow steps
}

interface FlowStep {
  blockId: string;                // behavior-block id from §4, e.g. 'api-call'
  params: Record<string, unknown>;      // may reference '{{event.*}}' / '{{flow.vars.*}}'
  branches?: { onSuccess?: FlowStep[]; onError?: FlowStep[] };
}
interface Flow {
  id: string;
  hookProp: string;               // which FlowHook this flow attaches to
  steps: FlowStep[];
}

// ─── Platform variants (per component, the iOS/Android/web matrix) ─────────
interface PlatformVariant {
  platform: 'ios' | 'android' | 'web';
  canvas: CanvasFidelity;         // how the RNW canvas renders/simulates
  simulation: string;             // what the builder must fake (device-frame chrome, insets…)
  differences: string[];          // API/visual differences vs the other platforms
  codegenExtra?: string;          // platform-specific emission (e.g. android_ripple)
}

// ─── Animation (Reanimated 4) ───────────────────────────────────────────────
type AnimationProp =
  | 'entering' | 'exiting' | 'layout'   // Reanimated entry/exit/layout presets
  | 'sharedTransitionTag'               // shared-element transitions
  | 'css-transition';                   // Reanimated 4 CSS `transition` style key

interface AnimatedSupport {
  wrappable: boolean;             // can wrap in Animated.createAnimatedComponent(X)
  props: AnimationProp[];         // which animation props the panel exposes
  presets: string[];              // e.g. ['FadeIn','SlideInDown','ZoomIn', …]
}

// ─── The registry entry (ONE source of truth) ──────────────────────────────
interface RegistryEntry {
  id: string;                     // kebab-case, stable, referenced by instances
  name: string;                   // builder-facing name in the palette
  category: Category;
  description: string;
  package: string;                // primary npm package ('react-native' for core)
  import: string;                 // exact import line
  component: string;              // exported symbol
  flavors?: Flavor[];             // absent → single implementation
  children: ChildrenPolicy;
  slots?: Array<{                 // for ChildrenPolicy = 'template'
    name: string;                 // e.g. 'itemTemplate', 'page', 'tab'
    description: string;
    repeat?: 'per-data-item' | 'per-child';
  }>;
  props: PropDef[];
  styleProps: StyleGroup[];       // which inline-style groups the style panel shows
  flowHooks: FlowHook[];
  animated: AnimatedSupport;
  platformVariants: PlatformVariant[];
  codegen: {
    dependencies: string[];       // npm deps added on first drop (pinned per §7)
    setup?: string;               // root-level setup emitted once (providers etc.)
    emits: string;                // one-line description of generated output
  };
  docsUrl?: string;
  status?: 'stable' | 'beta' | 'experimental';
}

// ─── Behavior blocks (non-visual) ───────────────────────────────────────────
interface BehaviorBlock {
  id: string;
  name: string;
  category: 'data' | 'storage' | 'device' | 'navigation' | 'state' | 'feedback';
  package: string;                // '' = react-native core, no dep
  import: string;
  call: string;                   // e.g. "Haptics.impactAsync(Haptics.ImpactFeedbackStyle.{{style}})"
  params: PropDef[];
  returns: string;                // what flows can consume: '{{result.json}}', '{{result.uri}}'…
  async: boolean;
  canvasSimulation: string;       // what happens when the flow runs on the web canvas
  flavors?: Flavor[];
  expoGoCompatible: boolean;
  requires?: string[];            // e.g. permissions, EAS setup
}
```

**Rules of the registry:**

- `import` lines are emitted **verbatim** by codegen — they must be exact.
- If a prop appears in `platformVariants[].codegenExtra`, the generator wraps it with `Platform.select`-free per-platform emission (see §2.5).
- `expoGoCompatible: false` forces the builder UI into **Dev Build mode** for that project (banner + `expo-dev-client` dependency).
- Props marked `bindable` can hold `{{state.xxx}}` / `{{store.xxx}}` expressions instead of literals.

---

## 2. Palette conventions

### 2.1 Categories

`layout` · `overlay` · `media` · `lists` · `inputs` · `feedback` · `navigation` · `device`

### 2.2 Canvas fidelity tiers (how RNW renders each entry)

| Tier | Meaning | Examples |
|---|---|---|
| `native` | expo-web/RNW ships real web support — render as-is | View, Text, Image, Video, Camera, BlurView |
| `approximated` | Works on web but visuals diverge from device | Switch, Slider, Modal, Pager |
| `shim` | ExpoForge injects a canvas-only web stand-in; codegen still emits the real component | DateTimePicker → HTML `<input type="date">`; SecureStore → localStorage |
| `static-preview` | Locked frame / permission gate on canvas | native Tabs chrome, BiometricGate |

### 2.3 Inline-style-only enforcement

Every style the builder emits is an **object literal** inline in JSX: `style={{ flexDirection: 'row', padding: 12 }}`. The style panel offers exactly the groups in `StyleGroup[]` per component. Pressable pressed/hover states use inline style functions (`style={({ pressed }) => ({ … })}`) — still object literals, no StyleSheet.

### 2.4 Flows

Every entry with `flowHooks` shows a ⚡ icon in the palette and a **Flows tab** in the props panel. Flow steps compose behavior blocks (§4). Example: `onPress → haptics.impact(light) → api-call(GET /items) → state-set(list, {{result.json}})`.

### 2.5 Platform variants

The canvas has an iOS / Android / Web toggle. Each variant:
1. Re-renders the canvas using the variant's `simulation` directives (device chrome, insets, fallbacks).
2. Filters the props panel to `platform: 'all'` + the active variant.
3. Tags emitted code with `codegenExtra` (e.g. `android_ripple` is only emitted when the Android variant is the active target, as a prop on the real component for all platforms where supported — RN handles the no-op).

### 2.6 Animation panel (Reanimated 4.7.1 + react-native-worklets 0.13.1)

- Components with `animated.wrappable` get an **Animation** group: `entering` / `exiting` / `layout` preset pickers (FadeIn/Out, SlideIn/Out ×4 directions, ZoomIn/Out, BounceIn/Out, FlipIn/Out ×2, Linear/Curved/Springy transition), each with duration / delay / spring config.
- `css-transition` exposes Reanimated 4's CSS `transition` style key: user picks which style props transition (width/height/opacity/transform…) + duration/easing, emitted inside the inline style object.
- Codegen: `react-native-reanimated@4.7.1` + `react-native-worklets@0.13.1`; babel plugin auto-configured by `babel-preset-expo@~58.0.23` (no user config).

---

## 3. The palette — visual components

> 38 visual entries across 8 categories. Format per entry: header table + props (grouped content/behavior/animation) + style groups + flow hooks + variants + codegen + children policy.

### 3.1 LAYOUT

---

#### `view` · View

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { View } from 'react-native'` |
| **Category / Flavors** | Layout / none |
| **Children** | `container` — any components |

- **Props · content:** —
- **Props · behavior:** `pointerEvents` (enum: auto/box-none/box-only/none)
- **Props · animation:** entering, exiting, layout, sharedTransitionTag, css-transition *(full set — View is the primary animation surface)*
- **Style groups:** flexbox, sizing, spacing, position, border, color, effects
- **Flow hooks:** none (use Pressable for taps)
- **RNW:** `native` — pixel-accurate div mapping; box-shadow/elevation approximated on web.
- **Variants:** iOS — shadows via `shadow*` style keys; Android — `elevation` (and `overflow: 'hidden'` clipping differences); Web — CSS box-shadow fallback for both.
- **Codegen:** no dependency; emits plain `<View style={{ … }}>`.

---

#### `scrollview` · Scroll View

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { ScrollView } from 'react-native'` |
| **Category / Flavors** | Layout / default; *Keyboard-aware flavor: `KeyboardAwareScrollView` from `react-native-keyboard-controller@1.22.9` (recommended on device — needs `KeyboardProvider` at root)* |
| **Children** | `container` |

- **Props · content:** `contentContainerStyle` (inline style object, spacing+flexbox groups only)
- **Props · behavior:** `horizontal` (bool), `showsScrollIndicator` (bool), `scrollEnabled` (bool, default true), `bounces` (bool, default true, **iOS**), `overScrollMode` (enum: auto/always/never, **Android**), `refreshEnabled` (bool → emits RN `<RefreshControl>` wiring, see below), `refreshing` (binding), `keyboardDismissMode` (enum: none/on-drag/on-interact, platform), `keyboardShouldPersistTaps` (enum: never/always/handled)
- **Props · animation:** css-transition (on scroll-content), layout
- **Style groups:** flexbox, sizing (must be bounded — scroll needs a height), border, color, effects
- **Flow hooks:** `onScroll` (`{offsetX, offsetY}`), `onRefresh` (pull-to-refresh — flow-capable), `onScrollToEndReached`, `onMomentumScrollEnd`
- **RNW:** `native` scrolling; `bounces`/`overScrollMode` no-op on web.
- **Variants:** iOS — bounce + momentum physics; Android — overscroll glow + `overScrollMode`; Web — native scrolling, no bounce.
- **RefreshControl note (verified against FlashList v2 docs):** on ScrollView the builder emits RN-core `<RefreshControl refreshing={…} onRefresh={…} colors={[…]} tintColor={…} />`. On the web canvas pull-to-refresh is unreliable → the interaction panel gets a **"Simulate pull-to-refresh"** button (`shim` for the refresh affordance only).
- **Codegen:** core only; keyboard-aware flavor adds `react-native-keyboard-controller` + `KeyboardProvider` root setup.

---

#### `safeareaview` · Safe Area View

| | |
|---|---|
| **Package / Import** | `react-native-safe-area-context@5.11.0` — `import { SafeAreaView } from 'react-native-safe-area-context'` |
| **Category / Flavors** | Layout / default (safe-area-context). *Legacy flavor: RN-core `SafeAreaView` — NOT exposed (deprecated, iOS-only), see §5.* |
| **Children** | `container` |

- **Props · content:** —
- **Props · behavior:** `edges` (multi-enum: top/right/bottom/left — default all)
- **Props · animation:** entering/exiting/layout via wrap
- **Style groups:** flexbox, sizing, spacing, color, border
- **Flow hooks:** none
- **RNW:** `approximated` — safe-area-context has web support but the browser canvas has no notch: the builder's device frame supplies **simulated insets** (iPhone Dynamic Island, Android camera punch-hole) that the canvas applies as padding overrides.
- **Variants:** iOS — inset by notch/Dynamic Island + home indicator; Android — status/nav bar (edge-to-edge in SDK 58 default); Web — 0 insets (chrome comes from browser).
- **Codegen:** adds `react-native-safe-area-context@~5.11.0`; `SafeAreaProvider` is **already provided by the expo-router root** — never double-wrap. (Verified: expo-router@58.0.29 peers `react-native-safe-area-context >= 5.4.0`.)

---

#### `keyboardavoidingview` · Keyboard Avoiding View

| | |
|---|---|
| **Package / Import** | flavor A (default): `react-native@0.88.1` — `import { KeyboardAvoidingView } from 'react-native'`; flavor B (**recommended**): `import { KeyboardAvoidingView } from 'react-native-keyboard-controller'` (`react-native-keyboard-controller@1.22.9`) |
| **Category / Flavors** | Layout / `core` (RN) and `keyboard-controller` (default on new projects) |
| **Children** | `container` |

- **Props · behavior:** `behavior` (enum: height/padding/position — default `padding`), `keyboardVerticalOffset` (number)
- **Style groups:** flexbox, sizing, spacing, color
- **Flow hooks:** none
- **RNW:** `approximated` — no virtual keyboard on canvas; the builder's device frame can show an **optional fake keyboard overlay** to preview avoidance.
- **Variants:** iOS — needs `behavior: 'padding'` (default); Android — native `adjustResize` usually suffices (keyboard-controller flavor unifies both); flavor B adds `KeyboardProvider` root requirement.
- **Codegen:** flavor B adds `react-native-keyboard-controller@~1.22.9` + `KeyboardProvider` setup at app root.

---

#### `statusbar` · Status Bar

| | |
|---|---|
| **Package / Import** | `expo-status-bar@58.0.4` — `import { StatusBar } from 'expo-status-bar'` |
| **Category / Flavors** | Layout / none |
| **Children** | `leaf` |

- **Props · content:** `style` (enum: auto/light/dark, default auto), `hidden` (bool)
- **Props · behavior:** `backgroundColor` (color, **Android only**), `translucent` (bool, **Android only**), `edgeToEdge` (bool)
- **Style groups:** none (all via props)
- **Flow hooks:** none (state changes via flows → `state-set` on a bound `hidden` value)
- **RNW:** `shim` — no-op on web; the device-frame chrome renders the simulated status bar and honors `style`/`hidden` for preview.
- **Variants:** iOS — `style` only (light/dark text); Android — `backgroundColor` + `translucent` + edge-to-edge interplay; SDK 58 defaults to edge-to-edge.
- **Codegen:** adds `expo-status-bar@~58.0.4`; emits `<StatusBar … />` in the screen, or maps into `<Stack.Screen options={{ statusBarStyle: … }} />` when the screen has a Stack parent.

---

#### `lineargradient` · Linear Gradient

| | |
|---|---|
| **Package / Import** | `expo-linear-gradient@58.0.3` — `import { LinearGradient } from 'expo-linear-gradient'` |
| **Category / Flavors** | Layout / none |
| **Children** | `container` |

- **Props · content:** `colors` (color[] — min 2, order = start→end), `locations` (number[] | null — ascending 0..1 stops), `start`/`end` (point `{x,y}` | null), `dither` (bool, default true, **Android only**)
- **Style groups:** flexbox, sizing, spacing, position, border
- **Flow hooks:** none
- **RNW:** `native` — renders a real CSS gradient.
- **Variants (verified from Expo docs):** iOS — full start/end control; Android — `dither` reduces color banding (off = faster); **Web — `start`/`end` only control the gradient angle** (CSS gradients don't support arbitrary endpoints). Note: RN `View` now supports `backgroundImage` with CSS gradient syntax as a zero-dependency alternative for simple cases — surfaced as a hint in the panel.
- **Codegen:** adds `expo-linear-gradient@~58.0.3`.

---

#### `svgshape` · SVG Shape

| | |
|---|---|
| **Package / Import** | `react-native-svg@15.16.0` — `import Svg, { Circle, Rect, Path, Line, Polygon, Ellipse } from 'react-native-svg'` |
| **Category / Flavors** | Layout / none |
| **Children** | `leaf` (single shape) — advanced users may add child shapes via the tree editor |

- **Props · content:** `shape` (enum: circle/rect/ellipse/line/polygon/path — picks the emitted element), `d` (string, path flavor), `points` (string, polygon flavor)
- **Props · behavior:** `fill` (color), `stroke` (color), `strokeWidth` (number), `strokeLinecap`/`strokeLinejoin` (enum), `viewBox` (`{width, height}`), `onPointerDown` etc.
- **Props · animation:** wrappable — transforms, morph via `css-transition`
- **Style groups:** sizing (width/height), color, effects (transform)
- **Flow hooks:** `onPress` (via wrapping in Pressable is preferred; native shape events exposed advanced-only)
- **RNW:** `native` — react-native-svg ships web support (renders real `<svg>`).
- **Variants:** none of consequence — identical cross-platform (that's the point).
- **Codegen:** adds `react-native-svg@~15.16.0`.

---

#### `divider` · Divider *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | composite — emits plain `react-native` `View` |
| **Category / Flavors** | Layout / `custom` (builder-built) |
| **Children** | `leaf` |

- **Props · content:** `axis` (enum: horizontal/vertical), `length` (number|string, default '100%'), `thickness` (number, default 1), `color` (color, default #E5E7EB)
- **Style groups:** spacing, color
- **Flow hooks:** none · **RNW:** `native` · **Variants:** none
- **Codegen:** no dep; emits `<View style={{ height: thickness, width: length, backgroundColor: color }} />` (or rotated for vertical).

---

### 3.2 OVERLAY

---

#### `blurview` · Blur View

| | |
|---|---|
| **Package / Import** | `expo-blur@58.0.5` — `import { BlurView, BlurTargetView } from 'expo-blur'` |
| **Category / Flavors** | Overlay / none |
| **Children** | `container` |

- **Props · content:** `intensity` (number 0–100, default 50), `tint` (enum: system/light/dark, default system)
- **Props · behavior:** `experimentalBlurMethod` (enum: none/dime/none — legacy Android method, hidden behind "advanced")
- **Style groups:** flexbox, sizing, position (overlay/absolute-fill typical), border radius
- **Flow hooks:** none
- **RNW:** `native` — Expo docs list Web in the platform matrix; renders CSS `backdrop-filter` blur (verify browser support during canvas build — **OPEN QUESTION #12**).
- **Variants (verified from Expo docs — critical):**
  - **iOS:** plain `<BlurView>` "just works" — true native `UIVisualEffectView` frosted glass. `tint` applies.
  - **Android (SDK 55+):** blur is **stable** but requires the **BlurTargetView pattern** — wrap the content-to-be-blurred in `<BlurTargetView ref={ref}>` and pass the ref to `<BlurView blurTargetRef={ref}>`. The builder **auto-wires this**: when the Android variant is active and a BlurView overlaps content, the tree editor links the nearest ancestor content container as the BlurTargetView and emits the ref plumbing. Efficient blur uses the Android **RenderNode API (Android 12 / API 31+)** — below API 31 it falls back to a semi-transparent view.
  - Known quirk (docs): blur doesn't update when BlurView renders before dynamic content (e.g. inside FlatList) — builder validation warns about BlurView-before-list layouts.
- **Codegen:** adds `expo-blur@~58.0.5`; Android variant emits `useRef` + `BlurTargetView` wrapper automatically.

---

#### `modal` · Modal

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { Modal } from 'react-native'` |
| **Category / Flavors** | Overlay / flavor A `core` (RN Modal, default — in-screen overlay); flavor B `route-modal` (expo-router Stack `presentation: 'modal'` — full native modal screen; converts the node into a route) |
| **Children** | `container` |

- **Props · content:** —
- **Props · behavior:** `visible` (binding, default false), `animationType` (enum: none/slide/fade, default none), `transparent` (bool, default false), `presentationStyle` (enum: fullScreen/pageSheet/formSheet/overFullScreen — **iOS**), `statusBarTranslucent` (bool, **Android**), `hardwareAccelerated` (bool, **Android**), `navigationBehavior` (flavor B only: push/replace)
- **Style groups:** flexbox, sizing, spacing, color, border (for the content container)
- **Flow hooks:** `onShow`, `onDismiss`, `onRequestClose` (Android hardware back — **required**; builder auto-attaches a close-flow)
- **RNW:** `approximated` — RNW implements Modal as a fixed-position overlay; sheet presentation styles degrade to centered card.
- **Variants:** iOS — `pageSheet`/`formSheet` cards, swipe-down dismiss hint in device frame; Android — full-screen + hardware-back wiring; Web — overlay + focus trap.
- **Codegen:** flavor A inline `<Modal>`; flavor B emits a new route file `app/<slug>.tsx` with `presentation: 'modal'` in Stack options.

---

#### `actionsheet` · Action Sheet *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | composite — RN `Modal` + animated `View` (iOS: optional `ActionSheetIOS` fast path) |
| **Category / Flavors** | Overlay / `custom` (builder-built) — cross-platform by design |
| **Children** | `template` — slots: `action` (repeat per action) |

- **Props · content:** `actions` (list of {label, style: default/destructive/cancel, icon?}), `title`, `message`
- **Props · behavior:** `visible` (binding), `destructiveColor` (color, default #EF4444)
- **Flow hooks:** `onSelect` (payload `{{event.index}}`, `{{event.label}}`), `onCancel`
- **RNW:** `approximated` — composite renders as slide-up card in canvas.
- **Variants:** iOS — optional native `ActionSheetIOS` emission (flag in flavor panel); Android — bottom sheet style; Web — centered dialog.
- **Codegen:** no dep (core RN); emits inline composite component in the screen file.

---

### 3.3 MEDIA

---

#### `image` · Image

| | |
|---|---|
| **Package / Import** | `expo-image@58.0.18` — `import { Image } from 'expo-image'` |
| **Category / Flavors** | Media / default (expo-image). *Core flavor `Image` from react-native exists but is NOT exposed (expo-image is strictly better) — §5.* |
| **Children** | `leaf` |

- **Props · content:** `source` (asset | uri string — bindable), `placeholder` (asset | blurhash string | thumbhash string), `contentFit` (enum: cover/contain/fill/center/none, default cover), `transition` (number ms, crossfade on load — default 300, **OPEN QUESTION #11**), `tint` (color)
- **Props · behavior:** `cachePolicy` (enum: none/disc/data/memory, default disc), `recyclingKey` (string), `accessibilityLabel`
- **Props · animation:** wrappable — entering/exiting/layout presets
- **Style groups:** sizing (aspectRatio!), position, border (radius), effects (transform)
- **Flow hooks:** `onLoad` (payload `{{event.source}}`, `{{event.width/height}}`), `onError` (payload `{{event.error}}`)
- **RNW:** `native` — expo-image supports web; blurhash placeholders render on canvas.
- **Variants:** minor — Android uses its own memory cache limits; iOS prioritizes decoding downscale. No user-facing API divergence.
- **Codegen:** adds `expo-image@~58.0.18`.

---

#### `video` · Video Player *(composite)*

| | |
|---|---|
| **Package / Import** | `expo-video@58.0.13` — `import { VideoView, useVideoPlayer } from 'expo-video'` |
| **Category / Flavors** | Media / `composite` — expo-video is hook-based; ExpoForge emits the player hook + view |
| **Children** | `leaf` |

- **Props · content:** `source` (uri | asset — bindable), `contentFit` (enum: cover/contain/fill/center, default contain), `placeholder` (poster image uri)
- **Props · behavior:** `autoplay` (bool), `loop` (bool), `muted` (bool), `nativeControls` (bool, default true), `allowsFullscreen` (bool, default true), `allowsPictureInPicture` (bool, **iOS only**), `timeouts` (inactivity auto-hide controls)
- **Props · animation:** wrappable (entering/exiting); `css-transition` on container
- **Style groups:** sizing, position, border, effects
- **Flow hooks:** `onEnd`, `onPlay`, `onPause`, `onError` (all wired to `useVideoPlayer` event listeners in codegen), `onProgressChange` (payload `{{event.currentTime}}`)
- **RNW:** `native` — **verified from Expo docs: expo-video has full Web support** (HTML5 video). Canvas plays real video; `nativeControls` renders browser chrome.
- **Variants:** iOS — PiP + AirPlay pickers; Android — PiP via system; Web — browser controls (visual divergence on controls, `approximated` for controls specifically).
- **Codegen:** adds `expo-video@~58.0.13`; emits `const player = useVideoPlayer(source, p => { … })` + `<VideoView player={player} … />`; refs forwarded for flow methods (play/pause/seek).

---

#### `camera` · Camera Preview

| | |
|---|---|
| **Package / Import** | `expo-camera@58.0.14` — `import { CameraView, useCameraPermissions } from 'expo-camera'` |
| **Category / Flavors** | Media / none |
| **Children** | `container` (overlay UI on top of the preview) |

- **Props · content:** —
- **Props · behavior:** `facing` (enum: front/back, default back), `enableTorch` (bool), `zoom` (number 0–1 normalized), `barcodeScannerEnabled` (bool), `barcodeTypes` (multi-enum: qr/ean13/code128/pdf417…)
- **Style groups:** sizing, position, effects
- **Flow hooks:** `onBarcodeScanned` (payload `{{event.data}}`, `{{event.type}}`), `onCameraReady`, `onMountError`
- **Actions (flow-callable):** `takePicture()` → `{{result.uri}}`, `startRecording()` / `stopRecording()` → `{{result.uri}}`
- **RNW:** `native`-with-gate — **verified: expo-camera supports Web** (getUserMedia). The canvas shows a **permission gate** first (browser camera prompt); if denied → `static-preview` placeholder frame.
- **Variants:** iOS — AVCaptureSession; Android — CameraX; permissions auto-added by config plugin on both; Web — getUserMedia (secure context required).
- **Codegen:** adds `expo-camera@~58.0.14`; emits `useCameraPermissions` gate UI + `<CameraView>`; permission strings via app.json plugin config.

---

#### `lottie` · Lottie Animation

| | |
|---|---|
| **Package / Import** | `lottie-react-native@7.5.0` — `import LottieView from 'lottie-react-native'` |
| **Category / Flavors** | Media / none |
| **Children** | `leaf` |

- **Props · content:** `source` (asset — .json or .lottie file), `progress` (number 0–1, bindable — controlled mode)
- **Props · behavior:** `autoPlay` (bool, default true), `loop` (bool, default true), `speed` (number, default 1), `resizeMode` (enum: cover/contain/center)
- **Props · animation:** wrappable; `css-transition` on container
- **Style groups:** sizing, position, effects
- **Flow hooks:** `onAnimationFinish` (payload `{{event.isCancelled}}`)
- **RNW:** `shim`-ish — **v7 on web requires `@lottiefiles/dotlottie-react` as an extra web dependency (verified from README)**. Codegen adds it under the web condition; canvas uses it to render.
- **Variants:** iOS — Lottie iOS engine; Android — lottie-android; Web — dotlottie player (rendering parity is high but not pixel-identical → `approximated`).
- **Expo Go:** lottie-react-native is **not listed in the SDK 58 reference module list** (verified) — **OPEN QUESTION #4**: may require a dev build in SDK 58; builder treats it as dev-build-leaning.
- **Codegen:** adds `lottie-react-native@~7.5.0` (+ `@lottiefiles/dotlottie-react` web-only).

---

#### `webview` · Web View

| | |
|---|---|
| **Package / Import** | `react-native-webview@14.0.1` — `import { WebView } from 'react-native-webview'` |
| **Category / Flavors** | Media / none |
| **Children** | `leaf` |

- **Props · content:** `source.uri` (uri — bindable), `injectedJavaScript` (string, advanced)
- **Props · behavior:** `javaScriptEnabled` (bool, default true), `domStorageEnabled` (bool, default true, **Android**), `startInLoadingState` (bool), `allowsInlineMediaPlayback` (bool, **iOS**), `allowsBackForwardNavigationGestures` (bool, **iOS**), `setSupportMultipleWindows` (bool, **Android**, security default true)
- **Style groups:** sizing, position, color (background)
- **Flow hooks:** `onLoad`, `onError`, `onMessage` (payload `{{event.data}}` — from injected JS postMessage)
- **RNW:** `shim` — react-native-webview has **no react-native-web target**; the canvas renders a sandboxed `<iframe>` of the same URI (labeled "Web preview — device renders native WebView").
- **Variants:** iOS — WKWebView (Safari engine), inline media flag; Android — Chromium WebView, DOM storage flag; Web — iframe.
- **Expo status:** react-native-webview **is listed in the Expo SDK reference** (expo-managed version, verified) — but Expo Go bundling for SDK 58 unconfirmed (**OPEN QUESTION #3**); dev-build fallback always valid.
- **Codegen:** adds `react-native-webview@~14.0.1`.

---

#### `audioplayer` · Audio Player *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | `expo-audio@58.0.11` — `import { useAudioPlayer } from 'expo-audio'` |
| **Category / Flavors** | Media / `custom` composite (expo-audio is headless; ExpoForge ships the player UI) |
| **Children** | `leaf` (composite renders play/pause + progress + time) |

- **Props · content:** `source` (uri | asset — bindable), `variant` (enum: full/mini/button)
- **Props · behavior:** `autoPlay`, `loop`, `muted`, `showSeekBar` (bool), `playerOptions.interruptionMode` (enum: mixWithOthers/doNotMix/duckOthers)
- **Flow hooks:** `onEnd`, `onPlaybackStatusChange` (payload `{{event.isPlaying}}`, `{{event.currentTime}}`)
- **RNW:** `native` — **verified: expo-audio supports Web** (HTML5 audio).
- **Variants:** iOS — AVAudioSession interruption modes; Android — audio-focus handling; Web — element audio. Headphone-disconnect auto-stop applies on all (docs).
- **Codegen:** adds `expo-audio@~58.0.11`; emits `useAudioPlayer` + inline composite component. (Successor of expo-av — see §5.)

---

### 3.4 LISTS

---

#### `list` · List ⭐ *the* builder list

| | |
|---|---|
| **Package / Import** | flavor **flashlist** (default): `@shopify/flash-list@2.3.3` — `import { FlashList } from '@shopify/flash-list'` · flavor **flatlist**: `react-native` `import { FlatList } from 'react-native'` · flavor **sectionlist**: `react-native` `import { SectionList } from 'react-native'` · flavor **masonry**: FlashList with `masonry` prop |
| **Category / Flavors** | Lists / `flashlist` (default — view recycling, no estimates, new-arch-only) · `flatlist` (core fallback, for old-arch projects — builder notes it as legacy) · `sectionlist` (grouped data with section headers) · `masonry` (Pinterest-style columns via FlashList) |
| **Children** | `template` — slot `itemTemplate` (repeat per data item) + optional slots `header`, `footer`, `separator`, `emptyState` |

- **Props · content:** `itemsSource` (binding: static JSON | state | store | flow result — **bindable**), `numColumns` (number, default 1), `masonry` (bool — flashlist only), `horizontal` (bool), `itemSpacing` (number → gap), `listPadding` (inline style object)
- **Props · behavior:** `pullToRefresh` (bool — flashlist: emits built-in `onRefresh` + `refreshing`; flatlist/sectionlist: emits RN `<RefreshControl>`), `refreshing` (binding), `infiniteScroll` (bool → `onEndReached`), `endReachedThreshold` (number), `stickyHeaders` (bool — sectionlist), `estimatedItemSize` (number — **FlashList v1 only; FlashList v2 needs no estimates — verified from its docs; ignored by FlatList/SectionList**), `overrideItemLayout` advanced
- **Props · animation:** layout animations on items (`layout` preset — FlashList v2 supports layout animations), `entering`/`exiting` on item template
- **Style groups:** flexbox, sizing, spacing (container), color
- **Flow hooks:** `onRefresh` (payload none), `onEndReached` (payload `{{event.distanceFromEnd}}`), `onItemPress` (delegated — the item template's Pressable carries it; payload `{{event.item}}`, `{{event.index}}`), `onViewableItemsChanged` (advanced)
- **RNW:** `native` — FlashList v2 is **JS-only** (verified from README), so it runs identically on the web canvas; recycling behavior is a device concern.
- **Variants:** none user-facing; overscroll/bounce follows ScrollView platform rules.
- **RefreshControl compat note (verified against FlashList v2 docs):** FlashList v2 has **built-in** pull-to-refresh — provide `onRefresh` and a `refreshing` prop and "a standard RefreshControl will be added"; a custom `refreshControl` element **overrides and ignores** `onRefresh`/`refreshing`; it **only works for vertical lists**. The builder always uses the built-in path (onRefresh + refreshing), never a custom element.
- **Codegen:** adds `@shopify/flash-list@~2.3.3` (flashlist/masonry) or nothing (flatlist/sectionlist); emits data source resolution + `renderItem` from the item-template tree; FlashList v2 requires **new architecture** (SDK 58 default ✔).

---

#### `pager` · Pager (swipeable pages)

| | |
|---|---|
| **Package / Import** | `react-native-pager-view@9.0.11` — `import { PagerView } from 'react-native-pager-view'` |
| **Category / Flavors** | none |
| **Children** | `template` — slot `page` (repeat per child, one page per child) |

- **Props · content:** `initialPage` (number, default 0), `dotIndicator` (bool → ExpoForge-generated dot overlay — pager-view has no built-in dots)
- **Props · behavior:** `orientation` (enum: horizontal/vertical), `offscreenPageLimit` (number), `overdrag` (bool), `overScrollMode` (enum, **Android**), `swipeEnabled` (bool, default true)
- **Props · animation:** page transitions are native; `css-transition` on page content
- **Style groups:** flexbox, sizing, spacing, color
- **Flow hooks:** `onPageSelected` (payload `{{event.position}}`), `onPageScroll` (payload `{{event.offset}}`, `{{event.position}}`), `onPageScrollStateChanged`
- **RNW:** `approximated` — pager-view ships web support; swipe physics differ slightly from native.
- **Variants:** **verified from README:** v9.x supports RN 0.86–0.88 and **New Architecture only** (SDK 58 ✔). Android gets native ViewPager2; iOS UIPageViewController; web = JS implementation.
- **Codegen:** adds `react-native-pager-view@~9.0.11`; emits dot-indicator overlay composite when enabled.

---

### 3.5 INPUTS

---

#### `text` · Text

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { Text } from 'react-native'` |
| **Category / Flavors** | none |
| **Children** | `text-only` |

- **Props · content:** `text` (string — bindable; multi-line in the editor), `numberOfLines` (number), `ellipsizeMode` (enum: head/middle/tail/clip, default tail), `adjustsFontSizeToFit` (bool)
- **Props · behavior:** `selectable` (bool, default false), `allowFontScaling` (bool, default true), `maxFontSizeMultiplier` (number)
- **Props · animation:** wrappable (`AnimatedText`) — entering/exiting/layout
- **Style groups:** typography (full), color, spacing, effects (textShadow)
- **Flow hooks:** `onPress` (payload `{}`), `onLongPress`
- **RNW:** `native`.
- **Variants:** fonts — custom fonts come from `expo-font@58.0.11` `useFonts` (codegen loads project fonts once at root); system font stack differs per platform (SF Pro / Roboto / browser) — canvas honors the variant's font stack.
- **Codegen:** no dep; emits `<Text style={{ … }}>{text}</Text>`.

---

#### `textinput` · Text Input

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { TextInput } from 'react-native'` |
| **Category / Flavors** | none |
| **Children** | `leaf` |

- **Props · content:** `value` (**bindable** — controlled), `placeholder` (string), `placeholderTextColor` (color), `multiline` (bool), `maxLength` (number)
- **Props · behavior:** `keyboardType` (enum: default/number-pad/decimal-pad/email-address/phone-pad/ascii-capable/numbers-and-punctuation/url), `autoCapitalize` (enum: none/sentences/words/characters), `autoCorrect` (bool, default true), `secureTextEntry` (bool), `returnKeyType` (enum: done/go/next/search/send), `clearButtonMode` (enum: never/while-editing/unless-editing/always — **iOS**), `textAlignVertical` (enum — **Android**), `editable` (bool), `inputMode` (enum — web-friendly alternative to keyboardType)
- **Props · animation:** wrappable; `css-transition` on border/color (focus styles)
- **Style groups:** typography, color, border, spacing, sizing, flexbox
- **Flow hooks:** `onChangeText` (payload `{{event.value}}` — **flow-capable**, also auto-binds to state), `onFocus`, `onBlur`, `onSubmitEditing` (payload `{{event.text}}`)
- **RNW:** `native` — keyboardType maps to HTML input types.
- **Variants:** iOS — `clearButtonMode` renders in-canvas via device frame; Android — `textAlignVertical`, underline stock styling; Web — HTML input.
- **Codegen:** no dep; always emitted as controlled input with a `useState` (local) or store binding.

---

#### `button` · Button

| | |
|---|---|
| **Package / Import** | flavor **pressable** (default): `react-native` — `import { Pressable } from 'react-native'` · flavor **expoui**: `@expo/ui@58.0.26` — `import { Button } from '@expo/ui'` · flavor **core**: `react-native` — `import { Button } from 'react-native'` |
| **Category / Flavors** | Inputs / `custom-pressable` (default — fully styleable, inline styles incl. pressed state) · `expoui-native` (native SwiftUI button — iOS-first, **OPEN QUESTION #1** re Android) · `core-button` (RN Button — minimal styling, kept for parity) |
| **Children** | `text-only` (label) |

- **Props · content:** `label` (string — bindable), `leftIcon` / `rightIcon` (asset | symbol — pressable flavor)
- **Props · behavior (pressable):** `disabled` (bool), `hitSlop` (number), `pressedOpacity` (number, default 0.7), `pressedScale` (number, default 1), `android_ripple` (color | null — **Android only**, emitted only when set; iOS uses opacity), `role` (enum: button/link/none)
- **Props · behavior (expoui):** `intent` (enum: primary/secondary/tertiary — maps to SwiftUI variants), `prominent` (bool)
- **Props · behavior (core):** `color` (color), `disabled`
- **Props · animation:** wrappable — entering/exiting/layout + **pressed-state spring** (Reanimated) + `css-transition`
- **Style groups:** all except typography-derived color (typography group applies to the label span) — flexbox, sizing, spacing, border, color, effects
- **Flow hooks:** `onPress` (payload `{}`) ⭐ primary flow hook, `onLongPress`, `onPressIn`, `onPressOut`
- **RNW:** pressable = `native`; expoui = **not supported on web** → canvas falls back to pressable rendering with a "Native (device-only)" badge; core = `native`.
- **Variants:** iOS — opacity pressed state, no ripple; Android — `android_ripple` material ripple; Web — hover state via RNW.
- **Codegen:** pressable emits `<Pressable style={({pressed}) => ({ … })} …>`; expoui adds `@expo/ui@~58.0.26` (project flips to dev-build if iOS-only target conflicts — flagged).

---

#### `gesturepressable` · Gesture Surface

| | |
|---|---|
| **Package / Import** | `react-native-gesture-handler@3.4.0` — `import { GestureDetector, Gesture } from 'react-native-gesture-handler'` |
| **Category / Flavors** | Inputs / none (it's the "advanced pressable") |
| **Children** | `container` |

- **Props · content:** —
- **Props · behavior:** `gesture` (enum: tap/double-tap/long-press/pan/pinch/rotate/force-touch — **iOS** for force-touch), `numberOfTaps`, `minDurationMs` (long-press), `minDistancePx` (pan), `minPointers`/`maxPointers` (multi-touch), `activateAfterLongPressMs`, `cancelsTouchesInView` (bool)
- **Props · animation:** wrappable — gestures pair with Reanimated (`useSharedValue` reactions exposed as "gesture-driven animation" presets: drag-follow, pinch-scale, rotate-follow)
- **Style groups:** all
- **Flow hooks:** `onGestureBegin`, `onGestureStart`, `onGestureEnd` (payload `{{event.translationX/Y}}`, `{{event.velocityX/Y}}`, `{{event.scale}}`, `{{event.rotation}}`, `{{event.absoluteX/Y}}`), `onGestureFail`
- **RNW:** `approximated` — RNGH supports web via pointer events; multi-touch gestures (pinch/rotate) work with trackpads/touchscreens, not plain mouse — canvas notes this.
- **Variants:** iOS — native UIGestureRecognizer (forceTouch available); Android — native detectors; Web — pointer-event emulation.
- **Codegen:** adds `react-native-gesture-handler@~3.4.0`; `GestureHandlerRootView` is **already provided by the expo-router root** (never double-wrap; only emitted for non-router custom roots).

---

#### `switch` · Switch

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { Switch } from 'react-native'` |
| **Category / Flavors** | none |
| **Children** | `leaf` |

- **Props · content:** —
- **Props · behavior:** `value` (**bindable**), `disabled` (bool), `trackColor` ({false, true} colors), `thumbColor` (color), `ios_backgroundColor` (color — **iOS**)
- **Style groups:** spacing, sizing (scale), position (no backgroundColor — colors are props)
- **Flow hooks:** `onValueChange` (payload `{{event.value}}` — flow-capable + auto-bind)
- **RNW:** `approximated` — functional web toggle, visually divergent from iOS/Android natives.
- **Variants:** iOS — UISwitch look, `ios_backgroundColor`; Android — Material switch; Web — checkbox-styled toggle.
- **Codegen:** no dep.

---

#### `slider` · Slider

| | |
|---|---|
| **Package / Import** | `@react-native-community/slider@5.2.2` — `import Slider from '@react-native-community/slider'` |
| **Category / Flavors** | none |
| **Children** | `leaf` |

- **Props · content:** —
- **Props · behavior:** `value` (**bindable**, number), `minimumValue` (number, default 0), `maximumValue` (number, default 1), `step` (number), `minimumTrackTintColor` / `maximumTrackTintColor` / `thumbTintColor` (colors), `inverted` (bool), `tapToSeek` (bool — **Android only**), `disabled` (bool)
- **Style groups:** sizing (width), spacing, position
- **Flow hooks:** `onValueChange` (payload `{{event.value}}`), `onSlidingStart`, `onSlidingComplete` (payload `{{event.value}}`)
- **RNW:** `approximated` — web slider via range input styling.
- **Variants:** Android — `tapToSeek`; iOS — continuous/descrete appearance; Web — HTML range.
- **Codegen:** adds `@react-native-community/slider@~5.2.2`. (No `expo-slider` package exists — verified npm 404 — community slider is the canonical choice.)

---

#### `checkbox` · Checkbox

| | |
|---|---|
| **Package / Import** | flavor **expo** (default): `expo-checkbox@58.0.2` — `import { Checkbox } from 'expo-checkbox'` · flavor **community**: `@react-native-community/checkbox@0.6.0` |
| **Category / Flavors** | Inputs / `expo` (default — first-party, in Expo SDK reference) · `community` (legacy parity) |
| **Children** | `leaf` |

- **Props · content:** —
- **Props · behavior:** `value` (**bindable**), `onValueChange` (payload `{{event.value}}` — **verified prop name from Expo docs**), `disabled` (bool), `color` (color — checked tint)
- **Style groups:** sizing, spacing, position, color (expo-checkbox accepts a style prop — verified in docs example)
- **Flow hooks:** `onValueChange` (flow-capable + auto-bind)
- **RNW:** `native` — **verified: expo-checkbox supports Web**.
- **Variants:** iOS — checkbox tint; Android — Material checkbox; Web — styled checkbox.
- **Codegen:** adds `expo-checkbox@~58.0.2` (default flavor).

---

#### `datetimepicker` · Date & Time Picker

| | |
|---|---|
| **Package / Import** | `@react-native-community/datetimepicker@9.2.2` — `import DateTimePicker from '@react-native-community/datetimepicker'` |
| **Category / Flavors** | none |
| **Children** | `leaf` (or `container` in inline display mode) |

- **Props · content:** `value` (**bindable**, date), `mode` (enum: date/time/datetime — datetime **iOS only**), `display` (enum: default/spinner/calendar/compact/inset/insetDays — availability varies per platform & mode)
- **Props · behavior:** `minimumDate` / `maximumDate` (date), `minuteInterval` (enum: 1/2/3/5/10/15/20/30), `is24Hour` (bool — **Android**), `timeZoneName` / `timeZoneOffsetInMinutes`, `disabled` (bool, **iOS**), `onChange` (payload `{{event.date}}`, `{{event.type}}` — flow-capable + auto-bind)
- **Style groups:** sizing, spacing (minimal — chrome is native)
- **Flow hooks:** `onChange`, `onDismiss` (**Android** dialog dismiss)
- **RNW:** **`shim`** — the community package has **no web target**. The canvas renders an HTML `<input type="date|time|datetime-local">` stand-in (builder-built, canvas-only). Codegen still emits the real component.
- **Variants (big divergences):** **Android — renders as a modal dialog** (system-styled, dismissable, `is24Hour`); **iOS — renders inline** (`compact` = tappable capsule → calendar popover; `spinner` = wheel) with `presentationStyle` popover options; datetime mode iOS-only.
- **Codegen:** adds `@react-native-community/datetimepicker@~9.2.2`; the builder wraps it in a platform-adaptive composite so one tree serves both variants.

---

#### `icon` · Icon *(experimental)*

| | |
|---|---|
| **Package / Import** | `expo-symbols@58.0.4` — `import { SymbolView } from 'expo-symbols'` |
| **Category / Flavors** | Inputs (visual) / `sf-symbols` (**iOS/tvOS only** — verified) |
| **Children** | `leaf` |

- **Props · content:** `name` (enum — SF Symbols picker), `size` (number), `weight` (enum), `tintColor` (color), `fallback` (asset uri — used on Android/Web)
- **Flow hooks:** none (wrap in Pressable) · **Style groups:** color, sizing, effects
- **RNW / Variants:** iOS renders native SF Symbol; Android/Web render the `fallback` image — **cross-platform icon parity is unresolved — OPEN QUESTION #8** (@expo/vector-icons unverified; candidate replacement).
- **Codegen:** adds `expo-symbols@~58.0.4`; status `experimental`.

---

### 3.6 FEEDBACK

---

#### `activityindicator` · Activity Indicator

| | |
|---|---|
| **Package / Import** | `react-native@0.88.1` — `import { ActivityIndicator } from 'react-native'` |
| **Category / Flavors** | none |
| **Children** | `leaf` |

- **Props · behavior:** `animating` (bool, default true), `size` (enum: small/large), `color` (color, prop not style), `hidesWhenStopped` (bool — **iOS**)
- **Flow hooks:** none · **Style groups:** spacing, sizing, position
- **RNW:** `native`. **Variants:** iOS UIActivityIndicator vs Android Material spinner vs Web CSS spinner — all approximated fine.
- **Codegen:** no dep.

---

#### `skeleton` · Skeleton Loader *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | composite — `View` + `react-native-reanimated@4.7.1` pulse loop |
| **Category / Flavors** | `custom` |
| **Children** | `leaf` |

- **Props · content:** `variant` (enum: text-line/avatar/rect/circle), `lines` (number, text variant)
- **Props · behavior:** `pulseDurationMs` (number, default 1200), `pulseColor` / `baseColor` (colors)
- **Flow hooks:** none · **Style groups:** sizing, spacing, border, color
- **RNW / Variants:** `native` (Reanimated works on web). No platform divergence.
- **Codegen:** adds `react-native-reanimated@~4.7.1` + `react-native-worklets@~0.13.1` (if not already present); emits inline composite with `useEffect` pulse.

---

#### `progress` · Progress Bar *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | composite — `View` track + Reanimated animated width |
| **Category / Flavors** | `custom` |
| **Children** | `leaf` |

- **Props · content:** `progress` (**bindable**, 0–1), `trackColor`, `fillColor` (colors), `height` (number, default 8), `cornerRadius` (number, default 4)
- **Props · behavior:** `indeterminate` (bool — looping animation)
- **Flow hooks:** none (drive via state bindings) · **Style groups:** sizing, spacing, color
- **RNW / Variants:** `native`; no divergence. **Codegen:** reanimated deps as above.

---

#### `toast` · Toast *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | composite — animated `View` overlay (no dep beyond reanimated) |
| **Category / Flavors** | `custom` |
| **Children** | `text-only` (message) |

- **Props · content:** `message` (bindable), `variant` (enum: info/success/error)
- **Props · behavior:** `durationMs` (number, default 2500), `position` (enum: top/bottom)
- **Flow hooks:** `onDismiss` · **Style groups:** typography, color, spacing, border, effects
- **RNW / Variants:** `native`; iOS/Android differ only in safe-area offsets (auto-honored).
- **Codegen:** emits a screen-level toast host + imperative `showToast` helper for flows (the **toast** behavior block in §4 targets it).

---

### 3.7 NAVIGATION

> Navigation nodes are **screen-container nodes** in ExpoForge's tree — they own route files, not free-drop children. Dropping them creates/edits the route structure; their "children" are screens.

---

#### `stackscreen` · Stack Screen (route)

| | |
|---|---|
| **Package / Import** | `expo-router@58.0.29` — `import { Stack } from 'expo-router'` |
| **Category / Flavors** | Navigation / none (native-stack via react-native-screens under the hood) |
| **Children** | `container` — the screen's component tree |

- **Props · content:** `title` (header title), `headerShown` (bool, default true)
- **Props · behavior:** `animation` (enum: default/fade/slide-from-right/slide-from-left/flip/none — **iOS**; Android uses platform default), `gestureEnabled` (bool — **iOS** swipe-back), `orientation` (enum), `presentation` (enum: card/modal/formSheet/pageSheet/fullScreenModal), `headerStyle` (inline style object: backgroundColor, height), `headerTintColor` (color), `headerTitleStyle` (inline typography object), `statusBarHidden`, `autoHideHomeIndicator`
- **Style groups:** via header style props above (not the general style panel)
- **Flow hooks:** screen events — `onFocus`, `onBlur` (via router listeners in codegen), plus the screen's component tree carries its own components
- **RNW:** expo-router works on web — but the **canvas renders screens standalone** (no live router on canvas); codegen emits real files.
- **Variants:** iOS — slide animations + swipe-back gesture + sheet presentations; Android — system back (router `BackHandler` integration) + shared-element transitions; Web — URL-based, animations degrade.
- **Codegen:** emits `app/<slug>.tsx` (screen component) + `<Stack.Screen options={{ … }} />` (inline options object); expo-router peer deps auto-resolved (`expo-linking@~58.0.15`, `expo-constants@~58.0.14`, `expo-symbols@~58.0.4`, `react-native-screens@~4.30.1`, `react-native-safe-area-context@~5.11.0` — verified peer set).

---

#### `tabs` · Tab Navigator

| | |
|---|---|
| **Package / Import** | flavor **js-tabs** (default): `expo-router@58.0.29` — `import { Tabs } from 'expo-router'` (renders `@react-navigation/bottom-tabs@7.21.0`) · flavor **native-tabs**: `import { Tabs } from 'expo-router/native-tabs'` (renders `react-native-bottom-tabs@1.5.0` — native UIKit/BottomSheet tab bar) · flavor **custom-js**: no dep — builder-generated Pressable tab bar + conditional screens |
| **Category / Flavors** | Navigation / `js-tabs` (default — full styling control, all platforms) · `native-tabs` (OS-native look, **experimental in expo-router — OPEN QUESTION #2**, limited styling) · `custom-js` (max control, single-screen, no route-level tabs) |
| **Children** | `template` — slot `tab` (repeat per tab; each tab binds to a screen route) |

- **Props · content:** `tabs` (list editor: {label, icon (asset/symbol), screenRoute} — each tab creates a screen file), `showLabels` (bool, default true)
- **Props · behavior:** `tabBarPosition` (enum: bottom/top — bottom-tabs v7 feature, js-tabs only), `activeTintColor` / `inactiveTintColor` (colors), `swipeEnabled` (custom-js only), `labeled` (native-tabs)
- **Style groups:** js-tabs/custom-js — `tabBarStyle` (inline style object), `labelStyle` (typography), icon sizing
- **Flow hooks:** `onTabPress` (payload `{{event.tabIndex}}`, `{{event.route}}` — via router tabPress listener), per-screen focus/blur
- **RNW:** js-tabs/custom-js = `approximated` (render fine on web); native-tabs = `static-preview` (native tab chrome not renderable on web canvas — locked frame with tab labels).
- **Variants:** native-tabs flavor — true native tab bar per OS (iOS UIKit / Android Material); js-tabs — same JS rendering everywhere; custom-js — builder-owned styling.
- **Codegen:** emits `app/(tabs)/_layout.tsx` with `<Tabs>` (+ `expo-router` dep) or, for custom-js, a single screen with tab state. Native-tabs adds `react-native-bottom-tabs@~1.5.0`.

---

#### `drawer` · Drawer Navigator

| | |
|---|---|
| **Package / Import** | `expo-router@58.0.29` — `import { Drawer } from 'expo-router'` (renders `@react-navigation/drawer@7.14.4`) |
| **Category / Flavors** | none |
| **Children** | `template` — slot `drawerScreen` (repeat per drawer route) |

- **Props · content:** `screens` (list: {name, label, icon, route}), `drawerContent` (slot — custom drawer panel template)
- **Props · behavior:** `drawerPosition` (enum: left/right), `drawerType` (enum: front/back/slide), `swipeEnabled` (bool, default true), `swipeEdgeWidth` (number), `drawerWidth` (number, default 320), `headerShown` (bool), `backBehavior` (enum)
- **Style groups:** `drawerContentStyle` / item styles via the custom drawer-content template
- **Flow hooks:** `onDrawerItemPress` (payload `{{event.route}}`), screen focus/blur
- **RNW:** `approximated` — drawer works on web (mouse drag supported).
- **Variants:** iOS/Android — native-feel swipe drawer via RNGH; Android also gets system back integration; Web — click/drag.
- **Codegen:** adds `@react-navigation/drawer@~7.14.4` + **`react-native-gesture-handler@~3.4.0` + `react-native-reanimated@~4.7.1` (drawer hard-requires both — verified dependency set)**; emits `app/(drawer)/_layout.tsx`.

---

#### `link` · Link

| | |
|---|---|
| **Package / Import** | `expo-router@58.0.29` — `import { Link } from 'expo-router'` |
| **Category / Flavors** | none |
| **Children** | `text-only` or one child component (asChild pattern) |

- **Props · content:** `href` (route picker — bindable), `asChild` (bool — style the child instead)
- **Props · behavior:** `push` (bool — push vs navigate), `replace` (bool), `disabled`
- **Flow hooks:** `onPress` (fires **after** navigation — flow-capable)
- **Style groups:** all (when not asChild, styles the text)
- **RNW:** `native` — renders a real `<a>` on web (proper URLs — a router superpower).
- **Variants:** none user-facing; web renders anchor + hover.
- **Codegen:** no extra dep (expo-router); emits `<Link href="…" asChild?>…</Link>`.

---

### 3.8 DEVICE

---

#### `biometricgate` · Biometric Gate *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | `expo-local-authentication@58.0.2` — `import * as LocalAuthentication from 'expo-local-authentication'` |
| **Category / Flavors** | Device / `custom` composite |
| **Children** | `template` — slots: `authenticated` (children when unlocked), `fallback` (locked UI) |

- **Props · content:** `promptMessage` (string, default "Unlock"), `fallbackMessage`, `disableDeviceFallback` (bool)
- **Props · behavior:** `autoPrompt` (bool, default true)
- **Flow hooks:** `onAuthSuccess` (payload `{{event.success}}`, `{{event.biometricType}}`), `onAuthFail`
- **RNW:** `static-preview` — web support is limited/absent on canvas; the gate shows the fallback slot with a "Simulate biometric result" interaction-panel button (`shim` affordance).
- **Variants:** iOS — Face ID (needs `NSFaceIDUsageDescription` — codegen plugin adds it) / Touch ID; Android — BiometricPrompt (fingerprint/face); Web — unsupported → fallback.
- **Codegen:** adds `expo-local-authentication@~58.0.2` + permission config.

---

#### `networkgate` · Network Status *(ExpoForge composite)*

| | |
|---|---|
| **Package / Import** | `@react-native-community/netinfo@12.0.1` — `import NetInfo from '@react-native-community/netinfo'` |
| **Category / Flavors** | Device / `custom` composite |
| **Children** | `template` — slots: `online` / `offline` |

- **Props · behavior:** `showBanner` (bool, default true — offline banner), `checkOnMount` (bool, default true)
- **Flow hooks:** `onOnline`, `onOffline` (payload `{{event.type}}`, `{{event.isConnected}}`)
- **RNW:** `native` — netinfo supports web (navigator.onLine + events).
- **Variants:** iOS/Android — cellular/wifi detail; Web — online/offline only.
- **Codegen:** adds `@react-native-community/netinfo@~12.0.1`; emits `useNetInfo` subscription composite.

---

## 4. Behavior blocks — non-visual flow actions

Behavior blocks are the steps flows are made of. All are also usable standalone from the "Actions" panel (attach to screen lifecycle).

| # | id | Name | Package (pinned) | Import | Call signature | Async | Returns (flow vars) | Canvas simulation |
|---|---|---|---|---|---|---|---|---|
| 1 | `api-call` | **API Call** | `''` (fetch) / `axios@1.21.0` (flavor) | flavor fetch: none · flavor axios: `import axios from 'axios'` | `fetch(url, {method, headers, body})` → `res.json()` | ✅ | `{{result.json}}`, `{{result.status}}`, `{{result.ok}}` | real network from browser (CORS caveats shown) |
| 2 | `storage` | **Storage** | flavor **async-storage** (default): `@react-native-async-storage/async-storage@3.1.1` · flavor **mmkv**: `react-native-mmkv@4.3.2` (needs dev build) · flavor **expo-storage** (community `58.0.0`): optional | AsyncStorage: `import AsyncStorage from '@react-native-async-storage/async-storage'` · MMKV: `import { MMKV } from 'react-native-mmkv'` | ops: `get(key)` / `set(key, value)` / `remove(key)` / `getAllKeys()` | AsyncStorage ✅ / MMKV ❌ (sync) | `{{result.value}}`, `{{result.keys}}` | real via RNW (AsyncStorage web impl; MMKV has web support per README — verify — OPEN QUESTION #13) |
| 3 | `secure-store` | **Secure Store** | `expo-secure-store@58.0.2` | `import * as SecureStore from 'expo-secure-store'` | `SecureStore.setItemAsync(key, value)` / `getItemAsync(key)` / `deleteItemAsync(key)` | ✅ | `{{result.value}}` | **`shim`** — expo-secure-store has no web target → canvas uses localStorage + a "not secure on web" badge; real Keychain/Keystore on device |
| 4 | `haptics` | **Haptics** | `expo-haptics@58.0.7` | `import * as Haptics from 'expo-haptics'` | `Haptics.impactAsync(style)` · `notificationAsync(type)` · `selectionAsync()` | ✅ (fire-and-forget) | — | web: no-op / limited (`navigator.vibrate` where available — fidelity **OPEN QUESTION #5**); device: Taptic/LinearMotor |
| 5 | `notifications` | **Local Notification** | `expo-notifications@58.1.7` | `import * as Notifications from 'expo-notifications'` | `Notifications.scheduleNotificationAsync({content, trigger})` | ✅ | `{{result.id}}` | canvas: in-app toast preview (web push out of scope — OPEN QUESTION #10); device: real notification. **Remote push = out of scope v1** (needs EAS credentials) |
| 6 | `share` | **Share** | `''` (RN Share) / `expo-sharing@58.0.21` (files) | text: no import · files: `import * as Sharing from 'expo-sharing'` | `Share.share({message})` · `Sharing.shareAsync(uri)` | ✅ | `{{result.action}}` | web: `navigator.share` where available, else clipboard fallback |
| 7 | `clipboard` | **Clipboard** | `expo-clipboard@58.0.4` | `import * as Clipboard from 'expo-clipboard'` | `Clipboard.setStringAsync(text)` / `getStringAsync()` | ✅ | `{{result.value}}` | real (navigator.clipboard) |
| 8 | `location` | **Location** | `expo-location@58.0.20` | `import * as Location from 'expo-location'` | `getCurrentPositionAsync({accuracy})` · `watchPositionAsync(cb)` · `requestPermissionsAsync()` | ✅ | `{{result.latitude}}`, `{{result.longitude}}`, `{{result.accuracy}}` | real browser geolocation (permission prompt in canvas); watch flows get an unsubscribe node |
| 9 | `auth-biometric` | **Biometric Auth** | `expo-local-authentication@58.0.2` | `import * as LocalAuth from 'expo-local-authentication'` | `hasHardwareAsync()` + `authenticateAsync({promptMessage, disableDeviceFallback})` | ✅ | `{{result.success}}`, `{{result.biometricType}}` | canvas: interaction-panel "simulate success/fail" (`shim`); device: FaceID/fingerprint |
| 10 | `router-nav` | **Navigate** | `expo-router@58.0.29` | `import { router } from 'expo-router'` | `router.navigate(target, params)` · `push` · `replace` · `back()` | ❌ | — | canvas: switches the previewed screen; device: real navigation |
| 11 | `state-set` | **Set State** | `''` (useState) / `zustand@5.0.16` (global) | screen state: none · store: `import { useStore } from '@/store'` | local: setter call · store: `useStore.setState({key: value})` | ❌ | — | real (canvas state = live) |
| 12 | `state-get` | **Get State** | same as #11 | same | read `{{state.x}}` / `{{store.y}}` into `{{flow.vars.z}}` | ❌ | `{{result.value}}` | real |
| 13 | `alert` | **Alert Dialog** | `''` (RN core) | `import { Alert } from 'react-native'` | `Alert.alert(title, message, buttons)` | ❌ (callback-based) | `{{result.buttonIndex}}` | canvas: web `alert()`-styled composite |
| 14 | `image-picker` | **Image Picker** | `expo-image-picker@58.0.10` | `import * as ImagePicker from 'expo-image-picker'` | `launchImageLibraryAsync({allowsMultipleSelection, quality, mediaTypes})` / `launchCameraAsync()` | ✅ | `{{result.assets[].uri}}`, `{{result.canceled}}` | canvas: file input dialog (web supported) |
| 15 | `web-browser` | **Open Browser** | `expo-web-browser@58.0.7` | `import * as WebBrowser from 'expo-web-browser'` | `WebBrowser.openBrowserAsync(url)` | ✅ | `{{result.type}}` | canvas: opens system browser tab |
| 16 | `toast` | **Show Toast** | composite (§3.6) | uses the screen's toast host | `showToast(message, variant)` | ❌ | — | real composite |

**Flow composition rules:**

- Steps chain sequentially; each step's params may reference `{{event.*}}` (trigger payload), `{{flow.vars.*}}` (previous results), `{{state.*}}`, `{{store.*}}`.
- Async steps expose `onSuccess` / `onError` branches (sub-flows).
- A flow attached to `router-nav`-capable hooks can end with navigation; flows on TextInput hooks commonly end with `state-set`.

---

## 5. Deprecated / do-not-expose list

Anything here must never appear in the palette; the builder also flags these if imported from a template.

| Package | Latest (verified) | Status | Reason / Replacement |
|---|---|---|---|
| `expo-av` | 16.0.8 | ⚠️ frozen (dist-tags stop at sdk-51; docs URL redirects to expo-audio) | **Use `expo-audio@58.0.11` + `expo-video@58.0.13`** — the AV split is real |
| `recyclerlistview` | 4.2.3 | ⚠️ dormant (last publish 2025-03) | **Use `@shopify/flash-list@2.3.3`** (FlashList is its spiritual successor, by Shopify's own positioning) |
| `react-native-keychain` | 10.0.0 | ⚠️ stale (last publish 2025-03) | **Use `expo-secure-store@58.0.2`** |
| `@react-native-community/checkbox` | 0.6.0 | ⚠️ superseded for Expo | **Use `expo-checkbox@58.0.2`** (community flavor kept only for legacy projects) |
| `react-native-restart` | 0.0.29 | ❌ niche | **Use `expo-updates@58.0.20` `reloadAsync()`** via flow |
| `react-native-mmk` | — | ❌ does not exist (npm 404 — verified) | phantom package; if "MMK" is requested, user means `react-native-mmkv@4.3.2` |
| `@tanstack/query-react-native` | — | ❌ does not exist (npm 404 — verified) | plain `@tanstack/react-query@5.105.1` works in RN (framework-agnostic) — available as an advanced behavior/data option, not v1 palette |
| `nativewind` / `@tamagui/core` | 4.2.7 / 3.1.10 | ❌ excluded by design | **violates the inline-styles-only constraint** |
| `@react-native-firebase/app` | 27.1.0 | ❌ out of scope v1 | needs dev build + google-services config files (native config) — reconsider for v2 with a wizard |
| RN core `Button` | — | ⚠️ flavor only | limited styling — offered only as a `core` flavor of `button` |
| RN core `SafeAreaView` | — | ⚠️ legacy | **use `react-native-safe-area-context@5.11.0`** |
| RN core `FlatList` | — | ⚠️ legacy flavor | exposed only as `list` flavor; FlashList is the default |
| `expo-file-system/legacy` subpath | 58.0.13 | ⚠️ legacy API surface | new class-based `File`/`Directory`/`Paths` API is the default; codegen only emits the new API |
| `@react-native-community/slider` alternatives | — | — | no `expo-slider` exists (npm 404 — verified); community slider IS the choice |

---

## 6. Custom components (user-defined)

Users compose a component from palette pieces once, then reuse it as a palette entry with its own props contract. Data shape:

```ts
// Definition (authored in the Custom Components editor)
interface CustomComponentDef {
  id: string;                       // 'custom-…'
  name: string;                     // palette label
  description?: string;
  thumbnailUri?: string;            // auto-captured from canvas

  // 1. Props contract — what instances can override
  propsContract: Array<{
    key: string;                    // referenced inside the tree as {{props.key}}
    label: string;
    type: 'string' | 'number' | 'boolean' | 'color' | 'enum'
        | 'asset' | 'date' | 'binding';
    default?: unknown;
    enumValues?: string[];          // for enum
    bindable: boolean;              // can instances bind to state/store?
  }>;

  // 2. Internal state (component-local, useState)
  state?: Array<{ key: string; initialValue: unknown }>;

  // 3. Template tree — normal component instances, but prop/style values
  //    may be expressions: {{props.title}}, {{state.count}},
  //    {{flow.vars.x}} (inside flow handlers)
  tree: ComponentInstance[];

  // 4. Optional slots — where instance children are injected
  slots?: Array<{ name: string; allowedCategories?: Category[] }>;

  // 5. Flows defined inside the custom component (scoped)
  flows?: Flow[];                   // may fire `state-set` on local state,
                                    // emit component events (see events)
  events?: string[];                // declared events instances can hook, e.g. 'onSave'
}

// Instance (a custom component dropped on a screen)
interface ComponentInstance {
  id: string;                       // instance id
  componentRef: string;             // RegistryEntry.id OR CustomComponentDef.id
  props: Record<string, PropValue>;// PropValue = literal | binding expr | flow ref
  style: Record<string, unknown>;  // inline style object (validated per entry's StyleGroup[])
  flows: Record<string, Flow>;     // keyed by flow-hook prop ('onPress'…)
  children?: ComponentInstance[];  // or Record<slotName, ComponentInstance[]> when
                                   // the entry's ChildrenPolicy = 'template'
}

type PropValue =
  | { kind: 'literal'; value: unknown }
  | { kind: 'binding'; expr: string }        // {{state.x}} {{store.y}} {{props.z}}
  | { kind: 'flow-ref'; flowId: string };
```

**Rules:**

- A custom component's template tree may reference **any palette entry except navigation screen-containers** (`stackscreen`, `tabs`, `drawer` are route-level, not embeddable).
- `{{props.x}}` expressions render live on canvas with the contract's defaults (or a per-instance override preview).
- Custom components can nest other custom components (cycle-checked).
- **Codegen:** each definition emits `components/<Name>.tsx` in the generated project — a self-contained React component (inline styles preserved verbatim, local `useState`, emitted flows), imported by any screen that uses it. No new dependencies beyond what its tree already pulls.
- Exported `events` become additional flow hooks on every instance.

---

## 7. Dependency pinning table (codegen)

Codegen resolves via `npx expo install` semantics (SDK-aware) and emits the exact pins below into `package.json` (verified against npm registry 2026-11-01 — Task 2-c; `~` ranges follow Expo's recommended-version style).

### 7.1 Base template (every generated project)

| Package | Pinned | Why |
|---|---|---|
| `expo` | `~58.0.22` | SDK 58 umbrella (latest verified) |
| `expo-router` | `~58.0.29` | file-based routing |
| `react-native` | `0.88.1` | SDK 58 RN pairing (verified) |
| `react` | `19.3.0` | SDK 58 React pairing (verified) |
| `react-dom` | `19.3.0` | web output |
| `expo-status-bar` | `~58.0.4` | status bar |
| `expo-linking` | `~58.0.15` | router peer (verified) |
| `expo-constants` | `~58.0.14` | router peer (verified) |
| `expo-symbols` | `~58.0.4` | router peer (verified) |
| `react-native-screens` | `~4.30.1` | router peer (verified) |
| `react-native-safe-area-context` | `~5.11.0` | router peer (verified `>= 5.4.0`) |
| `react-native-web` | `~0.21.4` | web output + canvas parity |
| `@expo/metro-runtime` | `~58.0.16` | router web runtime (verified peer) |
| `babel-preset-expo` | `~58.0.23` | build (auto-configures Reanimated plugin) |
| `expo-insights` *(optional)* | `~58.0.11` | builder telemetry in generated apps (opt-in) |
| `expo-dev-client` *(dev dep, opt-in)* | `~58.0.18` | auto-added when a non-Expo-Go package is used |

*Transitives auto-managed by expo: `expo-modules-core ~58.0.29`, `expo-font ~58.0.11`, `expo-asset ~58.0.19`, `expo-keep-awake ~58.0.3`, `expo-file-system ~58.0.13`, `@expo/*` build tooling (verified via `npm view expo@latest dependencies`).*

### 7.2 On-demand (added when a palette entry is first used)

| Trigger entry/block | Package(s) added |
|---|---|
| `blurview` | `expo-blur ~58.0.5` |
| `lineargradient` | `expo-linear-gradient ~58.0.3` |
| `image` | `expo-image ~58.0.18` |
| `video` | `expo-video ~58.0.13` |
| `audioplayer` | `expo-audio ~58.0.11` |
| `camera` | `expo-camera ~58.0.14` |
| `lottie` | `lottie-react-native ~7.5.0` (+ `@lottiefiles/dotlottie-react` web-only) |
| `webview` | `react-native-webview ~14.0.1` |
| `list` (default/masonry) | `@shopify/flash-list ~2.3.3` |
| `pager` | `react-native-pager-view ~9.0.11` |
| `svgshape` | `react-native-svg ~15.16.0` |
| `gesturepressable` | `react-native-gesture-handler ~3.4.0` |
| `keyboardavoidingview` (flavor B) / scroll flavor | `react-native-keyboard-controller ~1.22.9` |
| `slider` | `@react-native-community/slider ~5.2.2` |
| `checkbox` | `expo-checkbox ~58.0.2` |
| `datetimepicker` | `@react-native-community/datetimepicker ~9.2.2` |
| `icon` (experimental) | `expo-symbols ~58.0.4` |
| `button` (expoui flavor) | `@expo/ui ~58.0.26` |
| `tabs` (native flavor) | `react-native-bottom-tabs ~1.5.0` |
| `drawer` | `@react-navigation/drawer ~7.14.4` (+ RNGH + Reanimated, below) |
| `skeleton` / `progress` / any animation | `react-native-reanimated ~4.7.1` + `react-native-worklets ~0.13.1` |
| `networkgate` / — | `@react-native-community/netinfo ~12.0.1` |
| `biometricgate` / `auth-biometric` | `expo-local-authentication ~58.0.2` |
| storage block (default) | `@react-native-async-storage/async-storage ~3.1.1` |
| storage block (mmkv flavor) | `react-native-mmkv ~4.3.2` ⚠️ **dev build required, not Expo Go** |
| storage block (community flavor) | `expo-storage ~58.0.0` ⚠️ community package (echowaves), NOT first-party Expo |
| secure-store block | `expo-secure-store ~58.0.2` |
| haptics block | `expo-haptics ~58.0.7` |
| notifications block | `expo-notifications ~58.1.7` |
| share block (files) | `expo-sharing ~58.0.21` |
| clipboard block | `expo-clipboard ~58.0.4` |
| location block | `expo-location ~58.0.20` |
| image-picker block | `expo-image-picker ~58.0.10` |
| web-browser block | `expo-web-browser ~58.0.7` |
| api-call (axios flavor) | `axios ~1.21.0` |
| state-set/get (global) | `zustand ~5.0.16` |
| advanced data (opt-in) | `@tanstack/react-query ~5.105.1` |

### 7.3 Root providers (emitted once, by priority)

1. expo-router root provides `GestureHandlerRootView` + `SafeAreaProvider` (never re-emit).
2. `KeyboardProvider` — only if keyboard-controller flavor used.
3. Toast host — per screen if `toast` present.

---

## 8. Open questions

| # | Question | Impact | Suggested resolution |
|---|---|---|---|
| 1 | `@expo/ui@58.0.26` Button — Android support status (SwiftUI/iOS-first)? | `button` expoui flavor availability per platform | check @expo/ui docs per SDK drop; keep flavor iOS-gated until confirmed |
| 2 | `expo-router/native-tabs` (over `react-native-bottom-tabs@1.5.0`) — experimental? stable? Expo Go compatible? | `tabs` native flavor default-ness | verify against expo-router changelog at implementation time |
| 3 | Is `react-native-webview@14.0.1` bundled in the Expo Go SDK 58 binary? (It IS in the Expo SDK reference — verified.) | webview works in Go vs needs dev build | check Expo Go bundled-modules list at build time; until then treat as dev-build-leaning |
| 4 | `lottie-react-native@7.5.0` is NOT in the SDK 58 reference module list — Expo Go compatible? | lottie needs dev build or not | verify Go list; likely dev-build |
| 5 | `expo-haptics` web fidelity (navigator.vibrate patterns)? | haptics block canvas feedback | accept no-op on web canvas; document |
| 6 | `expo-video` web `nativeControls` visual parity on canvas | video entry `approximated` tier accuracy | visual QA during canvas build |
| 7 | DateTimePicker HTML shim fidelity (locale, minuteInterval, min/max) | `datetimepicker` canvas UX | shim supports subset; flag unsupported props on canvas |
| 8 | Cross-platform icon strategy: `expo-symbols` is iOS-only; verify `@expo/vector-icons` (unverified this cycle) as the universal icon entry | `icon` entry graduation from experimental | research task (mirror of 2-c) before palette v1.1 |
| 9 | RNW `Switch`/`Slider` visual parity tiers | `approximated` vs `native` classification | visual QA during canvas build |
| 10 | expo-notifications web push (PWA) — out of scope v1; revisit? | notifications block device-only note | keep v1 local-only |
| 11 | `expo-image` `transition` default (300 ms?) — verify exact default at implementation | props panel default value | read expo-image source at implementation |
| 12 | `expo-blur` web = CSS `backdrop-filter` — browser support matrix in the canvas (embedded browsers/Electron) | blurview canvas fidelity | test in the canvas webview during build |
| 13 | `react-native-mmkv@4.3.2` README claims web support — verify parity (localStorage-backed?) for canvas | storage mmkv flavor canvas simulation | test MMKV under RNW during build |

---

*End of registry. Any palette/props/codegen change MUST be made here first — this document is the single source of truth. Version: 1.0 · Verified: 2026-11-01 via npm registry + Expo/Shopify official docs.*
