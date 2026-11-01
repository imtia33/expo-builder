# 06 — Code Generation Specification

**Status:** Authoritative · **Owner:** ExpoForge codegen · **Verified against:** Expo SDK 58 (expo 58.0.22), React Native 0.88.1, React 19.3.x, react-native-reanimated **4.7.1**, react-native-worklets **0.13.1**, react-native-gesture-handler **3.4.0** (SDK 58 pins `~3.3.0`), @shopify/flash-list **2.3.2**. All version numbers and API shapes below were verified live against the npm registry, the published npm tarball type definitions (`lib/typescript/index.d.ts` of each package), and the software-mansion GitHub repos on 2026-10-31. No API in this document is invented; where the builder concept name differs from the real API, the real API wins and the mapping is stated.

**Scope.** This document defines exactly what the ExpoForge generator emits for every builder construct: project template, component tree → JSX, screens/navigation, flows, animations, gestures, code style, platform variants, and the pre-output quality gates.

**Non-negotiable product constraints (enforced by the quality gates in §8):**

1. **Inline styles only.** Every component emits `style={{ ... }}` object literals. `StyleSheet.create` is FORBIDDEN. NativeWind / Tailwind / `className` / styled-components are FORBIDDEN.
2. Modern idiomatic Expo: expo-router file-based routes, function components, TypeScript, hooks.
3. Animations: Reanimated 4 + react-native-worklets. Gestures: RNGH 3 hook API (`usePanGesture`, `useTapGesture`, …). The `Gesture.Tap()` builder API is deprecated in RNGH 3.4 — see §5.9 FORBIDDEN list.
4. Every generated project targets the **New Architecture** (default-on in SDK 58; Reanimated 4 requires it — verified in repo README: "Reanimated 4.x and Worklets support only the New React Native architecture and three latest React Native versions").

---

## Table of contents

1. [Project template](#1-project-template)
2. [Emission rules — components](#2-emission-rules--components)
3. [Emission rules — screens & navigation](#3-emission-rules--screens--navigation)
4. [Emission rules — flows](#4-emission-rules--flows)
5. [Emission rules — animations](#5-emission-rules--animations)
6. [Code style rules](#6-code-style-rules)
7. [Platform variants](#7-platform-variants)
8. [Quality gates](#8-quality-gates)

---

## 1. Project template

### 1.1 File tree of a generated project

```
my-app/
├── app/                          # expo-router file-based routes (§3)
│   ├── _layout.tsx               # Root layout: GestureHandlerRootView + Stack/Tabs
│   ├── index.tsx                 # Initial route (always emitted; redirects if the
│   │                             #   builder's first screen is elsewhere)
│   ├── (tabs)/                   # Only when navigator = Tabs
│   │   ├── _layout.tsx           # Tabs emission
│   │   ├── home.tsx
│   │   ├── profile.tsx
│   │   └── ...
│   ├── sign-in.tsx               # One kebab-case file per screen (§3.3)
│   ├── sign-up.tsx
│   └── ...
├── components/                   # Extracted custom components (§6.4 extraction threshold)
│   ├── OrderCard.tsx
│   └── ...
├── src/
│   ├── api/                      # Mock/real API layer (§4.5)
│   │   ├── client.ts             # fetch wrapper, base URL, error normalization
│   │   └── orders.ts             # typed endpoints used by flows
│   ├── types/
│   │   └── api.ts                # Shared DTO/interface types
│   └── hooks/                    # Extracted hooks (e.g. useOrderList when ≥2 screens need it)
├── assets/
│   ├── icon.png
│   ├── adaptive-icon.png
│   ├── splash-icon.png
│   └── images/                   # User-imported images, referenced as require()
├── app.json
├── babel.config.js
├── tsconfig.json
├── package.json
├── .gitignore
└── README.md                     # Run instructions (npx expo start, prebuild note)
```

Rules:

- `app/` maps 1:1 from builder **screens** (§3). Nothing else ever lives in `app/`.
- `components/` holds custom components extracted from the builder tree (§6.4 defines when a subtree becomes a file).
- `src/` holds non-UI modules only (`api/`, `types/`, `hooks/`). No screens, no JSX-presentational components here.
- `assets/images/*` uses `require('../../assets/images/foo.png')` (relative require, no `expo-asset` needed for static images).
- The `index.tsx` route always exists. If the builder's designated initial screen is `/home`, `app/index.tsx` emits `<Redirect href="/home" />` (from `expo-router`) so deep links to `/` stay valid.

### 1.2 `app.json`

Emitted from the builder project settings; minimal verified-safe base (matches Expo SDK 58's `expo-template-blank/app.json`, which — verified — carries **no** `newArchEnabled` key because New Architecture is the default in SDK 58):

```json
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "scheme": "myapp",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "edgeToEdgeEnabled": true
    },
    "web": {
      "favicon": "./assets/icon.png"
    },
    "plugins": ["expo-router"]
  }
}
```

Notes:

- `scheme` is emitted whenever any flow uses deep links or the builder enables them; it is the deep-link scheme (`myapp://`).
- `plugins: ["expo-router"]` is required for the router config plugin.
- **Do not emit `newArchEnabled`** — SDK 58 is New Arch by default and the official blank template omits the key.
- `edgeToEdgeEnabled: true` is default-on for RN 0.88 / SDK 58 (Android 16 enforcement; reanimated 4.7.1 itself depends on `react-native-is-edge-to-edge`, verified in its package.json dependencies).

### 1.3 `babel.config.js` — plain preset, NO manual plugin (VERIFIED)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

**Why no `react-native-worklets/plugin`:** verified by reading the published `babel-preset-expo@58.0.23` source (`build/configs/expo.js`), which contains:

```js
// Automatically add worklets or reanimated plugin when package is installed.
if (options.worklets !== false && options.reanimated !== false) {
    const workletsPluginPath = (0, _resolveModule.resolveModule)(api, 'react-native-worklets/plugin');
    if (workletsPluginPath) {
        plugins.push([require(workletsPluginPath)]);
    }
}
```

i.e. **`babel-preset-expo` auto-injects `react-native-worklets/plugin` the moment `react-native-worklets` is installed.** Adding it manually is not only redundant, it risks double-registration. (The manual `"plugins": ["react-native-worklets/plugin"]` — listed **last** — is only the documented requirement for bare React-Native-CLI projects; verified in Reanimated 4.x `fundamentals/getting-started.mdx`.) The generator NEVER emits the plugin manually. This is a quality-gate check (§8, gate G6).

### 1.4 `tsconfig.json`

Matches the SDK 58 template (TypeScript ~6.0.3):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- `strict: true` always — generated code must compile clean under strict.
- Path alias `@/*` → repo root (so `@/components/OrderCard`, `@/src/api/orders`). Metro resolves this via `expo`'s default `tsconfigPaths` support in SDK 58; no extra config needed.
- When the user enables **typed routes** (`experiments.typedRoutes: true` in app.json), the `.expo/types` include above makes `router.push('/sign-in')` fully typed. Typed routes are ON by default in generated projects (§3.4).

### 1.5 `package.json` — verified pinned versions

Versions below are the **exact SDK 58 pins** (verified in `packages/expo/bundledNativeModules.json` at expo/expo main on 2026-10-31, plus the published `expo-template-default`/`expo-template-tabs` templates for SDK 58):

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint"
  },
  "dependencies": {
    "expo": "~58.0.22",
    "expo-constants": "~58.0.14",
    "expo-linking": "~58.0.14",
    "expo-router": "~58.0.26",
    "expo-splash-screen": "~58.0.11",
    "expo-status-bar": "~58.0.4",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-native": "0.88.1",
    "react-native-reanimated": "4.7.1",
    "react-native-worklets": "0.13.0",
    "react-native-gesture-handler": "~3.3.0",
    "react-native-safe-area-context": "~5.10.1",
    "react-native-screens": "~4.30.1",
    "react-native-svg": "15.16.0"
  },
  "devDependencies": {
    "@types/react": "~19.3.0",
    "typescript": "~6.0.3"
  }
}
```

Conditional entries (added **only** when the builder tree actually uses them — registry-driven, never speculative):

| Builder feature | Dependency added | Verified pin (SDK 58) |
|---|---|---|
| List component (long/virtualized lists) | `@shopify/flash-list` | `2.3.2` |
| Keyboard-driven animation | `react-native-keyboard-controller` | `1.22.7` (reanimated's `useAnimatedKeyboard` is deprecated in favor of it — verified JSDoc) |
| Lottie animation component | `lottie-react-native` | `~7.5.0` |
| Maps | `react-native-maps` | `1.29.11` |
| Web target enabled | `react-native-web` | `~0.21.4` |
| Image component (advanced) | `expo-image` | `~58.0.17` |
| Blur/glass effect | `expo-blur` / `expo-glass-effect` | `~58.0.5` |
| Haptics in flows | `expo-haptics` | `~58.0.7` |

Compatibility invariants the generator MUST preserve (verified in the published `compatibility.json` files):

- `react-native-reanimated@4.7.x` ⇄ `react-native@0.86–0.88` ⇄ `react-native-worklets@0.13.x`. Never emit a reanimated version without the matching worklets minor.
- `expo` version drives everything else; all pins above are the SDK 58 registry values, so the tuple is internally consistent by construction.

### 1.6 `npx expo install` guidance (emitted into README.md)

The generated README always contains:

> All dependency versions in this project are pinned to Expo SDK 58. If you add more packages, install them with `npx expo install <package>` (not `npm install`) so Expo picks the SDK-compatible version. After adding packages with native code, run `npx expo prebuild` and reinstall pods on iOS (`cd ios && pod install`). Restart Metro with `--reset-cache` after changing Babel configuration.

This mirrors the verified installation steps from Reanimated 4.x `getting-started.mdx` (prebuild + reset-cache are the documented post-install steps; `pod install` for iOS).

### 1.7 Post-generation run steps (README)

```
npm install
npx expo start            # Expo Go / development build
# or, for a development build:
npx expo prebuild && npx expo run:ios   # / run:android
```

Note: Expo Go for SDK 58 already bundles reanimated 4.7.1 / worklets 0.13.0 / RNGH ~3.3.0, so a generated project is Expo-Go-previewable as long as it uses no custom native modules.

---

## 2. Emission rules — components

### 2.1 Node → JSX mapping (canonical)

Every builder tree node has: `type`, `props`, `style`, `children`, `animations`, `flows`, `platformVariants`. Emission is a single pass:

```
emitNode(node) →
  <Type
    {…emitProps(node.props)}
    {…emitFlows(node.flows)}           // §4
    {…emitAnimationProps(node.anim)}   // §5 (entering/exiting/layout)
    style={emitStyle(node)}            // ALWAYS an inline object literal — see 2.2
  >
    {node.children.map(emitNode)}
  </Type>
```

- **Always `Animated.*` when animated or gestured.** If a node has any animation (entering/exiting/layout/CSS transition/gesture/scroll-driven/inline shared value) OR is the target of a `GestureDetector`, the emitted component is `Animated.View` / `Animated.Text` / `Animated.Image` / `Animated.ScrollView` (or `Animated.createAnimatedComponent(X)` for SVG, §5.11). Otherwise plain `View`/`Text`/`Image`. Rationale: `Animated.*` components are the Reanimated 4 animated components (verified exports of the `Animated` default-namespace: `View`, `Text`, `Image`, `ScrollView`, `FlatList`, plus `createAnimatedComponent`).
- Reanimated must be imported as default for the namespace: `import Animated, { … } from 'react-native-reanimated';` (verified: the package has a default export).
- SVG children (`Circle`, `Rect`, `Path`, …) emit `Animated.createAnimatedComponent(Circle)` hoisted to a module-level `const AnimatedCircle = Animated.createAnimatedComponent(Circle);` — verified pattern from Reanimated 4.x `guides/animating-svg.mdx`.

### 2.2 Inline style emission

**Style object literal rules:**

1. **Object literal, single `style` prop.** `style={{ ... }}` — never an array except when combining with an animated style: `style={[styles-like-inline, animatedStyle]}` where the first element is still an inline literal. (Arrays are only for mixing static inline + `useAnimatedStyle` results — that is Reanimated's documented pattern.)
2. **Key order — fixed, deterministic:** layout → position → spacing → border → background → typography → transform → animation-CSS props last. Exact order:
   `flex, flexGrow, flexShrink, flexBasis, flexDirection, gap, rowGap, columnGap, alignSelf, justifyContent, alignItems, alignContent, position, top, right, bottom, left, zIndex, width, height, minWidth, maxWidth, minHeight, maxHeight, aspectRatio, margin, marginTop, marginRight, marginBottom, marginLeft, marginHorizontal, marginVertical, padding…, borderWidth, borderColor, borderRadius, borderTopLeftRadius, …, backgroundColor, opacity, overflow, elevation, shadowColor, shadowOffset, shadowOpacity, shadowRadius, color, fontFamily, fontSize, fontWeight, fontStyle, letterSpacing, lineHeight, textAlign, textDecorationLine, textTransform, transform, transformOrigin, …, transitionProperty, transitionDuration, transitionDelay, transitionTimingFunction, animationName, animationDuration, …`
   Deterministic order keeps diffs stable and makes the quality-gate "inline styles only" AST check trivial.
3. **Numbers vs strings:**
   - Unitless dimensions/positions (`width: 120`), opacity (`opacity: 0.5`), flex (`flex: 1`), font size (`fontSize: 14`), line height as multiple → **numbers**.
   - Percentages (`width: '50%'`), angles (`rotate: '45deg'`), transform strings, colors, shadows → **strings**.
   - `transform` always an array: `transform: [{ translateX: 12 }, { scale: 1.1 }, { rotate: '45deg' }]`.
4. **Colors** emitted as hex (`#RRGGBB` / `#RRGGBBAA`) exactly as authored in the builder; no `processColor` calls in user code.
5. **No CSS shorthand** beyond what RN itself supports (`marginHorizontal` etc.). `transitionProperty: 'all'` or an array of exact style keys (`transitionProperty: ['width', 'backgroundColor']` — verified array form from `css-transitions/overview.mdx`).
6. **Never emit `StyleSheet.create`, `StyleSheet.absoluteFill`** — the latter expands to `position: 'absolute', left: 0, right: 0, top: 0, bottom: 0`. **Never emit `className`.**

### 2.3 `Platform.select` for per-platform styles — when

A style value that differs per platform is emitted **inline via `Platform.select`** only when the difference is purely a *value* (numbers/strings/colors) and the node is otherwise identical:

```tsx
<Text
  style={{
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
    paddingTop: Platform.select({ ios: 12, android: 8, default: 12 }),
  }}
>
```

Rules:

- `Platform.select` is used **only** inside style object literals (and for icon/component selection, §7). It is NOT used for structural differences (different children / different components) — those become `Platform.OS` guards (§7.2) or separate variants (§7.3).
- Always include a `default` key so web builds don't fall back to `undefined`.
- If **3 or more** style keys differ per platform on the same node, prefer §7.3 (variant) instead of nesting three `Platform.select` calls — readability threshold.
- If exactly one or two keys differ → `Platform.select` inline (cheaper than a variant split).

### 2.4 Children policy

- **Text nodes:** text content is emitted as JSX children of `<Text>`: `<Text style={{...}}>Hello {name}</Text>`. Reanimated note: as of reanimated 4.7.1, `Animated.Text` children must be plain strings/JSX; **shared-values-as-children is a 4.8 feature documented on main but NOT in the published 4.7.1 tarball** (verified: `component/Text.d.ts` in 4.7.1 has no SharedValue children type) — the generator must NOT emit it. OPEN QUESTION: revisit when reanimated 4.8 ships.
- **Conditionals:** builder "if" nodes emit `{cond && <View …/>}` or ternaries. Condition sources are either React state (§4.4) or derived shared values (§5.7) — the two are never mixed for the same conditional.
- **Lists** always render through the list template (§2.5), never via `.map()` of a plain View (the builder's repeat construct maps to FlashList).
- **Slots/fragments:** a builder node with multiple children and no style emits as `<></>` fragments only inside list item templates; everywhere else a concrete View wrapper is emitted.

### 2.5 List templates (FlashList v2)

The builder's "repeat/list" construct emits FlashList v2 (SDK 58 pin `2.3.2`, verified in bundledNativeModules.json; verified from the published README: *"FlashList v2 … doesn't require any estimates"* / *"No size estimates required in v2: Unlike v1, FlashList v2 automatically handles item sizing."*). **`estimatedItemSize` is NEVER emitted** (it doesn't exist in v2 and was v1's requirement).

```tsx
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={orders}
  renderItem={({ item }) => <OrderCard order={item} />}
  keyExtractor={(item) => item.id}
  contentContainerStyle={{ padding: 16, gap: 12 }}
  ItemSeparatorComponent={…}   // only if the builder defines a separator node
/>
```

Rules:

- The item template subtree (§6.4) always extracts to a component file (`components/OrderCard.tsx`) receiving `item` as a typed prop — never an inline `renderItem` closure longer than one element.
- `keyExtractor` always emitted from the builder's chosen item key field.
- `contentContainerStyle` is an inline literal (same rules as §2.2).
- Nested scrollables: only the outermost list is a FlashList; inner repeats of ≤ 8 items may emit as a plain `.map()` over inline Views (threshold, §6.4 logic) — but any inner repeat that itself has entering animations must be a FlashList or `Animated.FlatList` because layout animations need animated components.
- Horizontal lists emit `horizontal` + inline `estimatedItemSize`-free config only.
- v2 is **New Architecture only** (verified README warning) — consistent with our target, no guard needed.

---

## 3. Emission rules — screens & navigation

### 3.1 Root layout — `app/_layout.tsx`

Always emitted. Responsibilities: gesture root, splash/session gating, navigator.

**Stack navigator (default):**

```tsx
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,           // builder decides; default off for canvas-built screens
            contentStyle: { backgroundColor: '#ffffff' },
          }}
        >
          {/* Per-screen options emitted only for screens that override the default */}
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

**Tabs navigator** (when the builder's navigator = Tabs): `app/(tabs)/_layout.tsx` emits `<Tabs>` with one `<Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: … }} />` per tab. Tab bar styling via `screenOptions.tabBarStyle` inline literal.

Verified constraints baked into the template:

- **`GestureHandlerRootView` is mandatory and as close to the root as possible** (verified RNGH getting-started: "Keep `GestureHandlerRootView` as close to the actual root of the app as possible… gestures won't be recognized outside of the root view").
- `SafeAreaProvider` from `react-native-safe-area-context` (SDK 58 pin `~5.10.1`) wraps the navigator; individual screens use `useSafeAreaInsets()` when the builder marks a screen edge-to-edge.
- If the builder uses any `Modal` (RN core) containing gestures, that Modal's content gets its **own** `GestureHandlerRootView` (verified Android requirement from RNGH docs).

### 3.2 One file per screen

Builder screen `SignIn` → `app/sign-in.tsx`:

```tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { signIn } from '@/src/api/auth';

export default function SignInScreen() {
  const router = useRouter();
  // … state, flows, JSX per §2/§4/§5
}
```

- Default export, function component, named `PascalCase + Screen` suffix internally is NOT needed — file is the route; the component is `export default function SignInScreen()`.
- No classes, no `createStackNavigator` — expo-router owns navigation.
- `expo-status-bar`'s `<StatusBar>` appears once in the root layout, not per screen.

### 3.3 Route naming (deep-link-safe)

- **kebab-case file names** always: `sign-in.tsx`, `order-details.tsx`, `settings/notifications.tsx` for nested flows. Kebab-case is the expo-router/deep-link convention (URL segment = file name).
- Route params for dynamic screens: `app/orders/[id].tsx`. Param access: `const { id } = useLocalSearchParams<{ id: string }>();` Navigation: `router.push('/sign-in')`, `router.push({ pathname: '/orders/[id]', params: { id: order.id } })`, `router.back()`.
- Route names are derived: builder screen `Order Details` → file `order-details.tsx` → route `/order-details`. Group routes (non-URL segments) use `(group)` directories, e.g. `app/(auth)/sign-in.tsx` keeps `/sign-in` URL while organizing files.
- No two screens may slugify to the same kebab-case name — the generator suffixes `-2`, `-3` and emits a builder warning.

### 3.4 Typed routes

Generated projects set `"experiments": { "typedRoutes": true }` in app.json (§1.2 addition when enabled). Then `router.push('/sign-in')` is compile-time checked against the emitted route map, and `Link` hrefs are typed. The generator itself validates every emitted route string against the file list at generation time (§8, gate G5) — typed routes are defense-in-depth for user edits afterwards.

### 3.5 Linking config

Deep links work out of the box via the `scheme` in app.json (§1.2) + expo-router. No manual `linking` config is ever emitted. Flow steps "navigate to screen X" always emit `router.push('/x')` (typed route literal — no dynamic string interpolation unless the builder itself has a dynamic target, in which case quality gate G5 demands the target be a validated route name).

---

## 4. Emission rules — flows

### 4.1 What a flow is

A flow is the builder's chain on a component event: `trigger → steps…`. Triggers: `onPress`, `onPressIn/Out` (via gesture or Pressable-style), `onChange` (inputs), `onRefresh`, `onEndReached`, animation completion. Steps: API call, state update, navigate, delay, haptics, animation fire, condition/branch.

### 4.2 Handler emission shape

Every flow emits a **named async handler function inside the component**, referenced from the JSX:

```tsx
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSignInPress = async () => {
  if (isSubmitting) return;
  setIsSubmitting(true);
  try {
    const result = await signIn(email, password);
    router.push('/home');
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : 'Something went wrong');
  } finally {
    setIsSubmitting(false);
  }
};
```

Rules:

- Name: `handle` + trigger + short purpose (`handleSignInPress`). camelCase (§6.3).
- **Every flow handler has `try/catch/finally`** — even pure-navigation flows get a `catch` that at minimum routes to an error display or logs (§8, gate G8 — "every flow handler has error path" — hard gate).
- `finally` restores loading state. Loading state is React state by default (§4.4).
- Long flows (≥ 4 steps) or flows shared by ≥ 2 components extract to `src/hooks/use<Name>Flow.ts`.
- No inline arrow handlers in JSX for flows — always the named function (so the error path is visible and the gate can check it).

### 4.3 Navigation in flows

- `router.push('/sign-in')` for forward, `router.back()` for back, `router.replace('/home')` after auth success (no back into sign-in). `Redirect` component only for the static `app/index.tsx` case (§1.1).

### 4.4 State policy — useState vs SharedValue (binding rule)

The binding decision is mechanical, not stylistic:

| Flow drives… | Emitted state | Why (verified) |
|---|---|---|
| Loading spinners, error text, form values, conditional render (`{isLoading && …}`), anything React re-render must see | `useState` / `useReducer` | Reanimated docs (css-transitions overview, verified): "a transition only reacts to values that change **between renders** … updating a shared value doesn't re-render the component." CSS transitions in our generated code are therefore fed by React state. |
| Continuous/animated values (position, progress 0–1, scale) consumed only inside styles/props on Animated components | `useSharedValue` | Shared values are the Reanimated mechanism for UI-thread updates without re-renders. |
| A value that is BOTH (e.g. drag offset that a flow also branches on) | `useSharedValue` as source of truth + explicit sync point via `scheduleOnRN` (§5.8) | Avoids dual sources of truth. The generator never copies a shared value into state on every frame. |

`useState` initializers are values; `useSharedValue` accepts value or initializer function (verified 4.7.1 type: `useSharedValue<Value>(initialValue: Value | (() => Value))`).

### 4.5 Mock API layer

When no backend is connected, the generator emits a **typed mock service** so flows compile and run identically to production. Shape:

```ts
// src/types/api.ts
export interface Order {
  id: string;
  title: string;
  amount: number;
  status: 'pending' | 'paid' | 'refunded';
}

// src/api/client.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Mock mode toggle — single const, flipped when a real base URL is provided.
export const API_BASE_URL: string | null = null;

// src/api/orders.ts
import { ApiError, API_BASE_URL } from './client';
import type { Order } from '../types/api';

const MOCK_LATENCY_MS = 450;

export async function listOrders(): Promise<Order[]> {
  if (API_BASE_URL === null) {
    return mockResponse(MOCK_ORDERS);
  }
  const response = await fetch(`${API_BASE_URL}/orders`);
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }
  return (await response.json()) as Order[];
}

async function mockResponse<T>(data: T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  return structuredClone(data);
}

const MOCK_ORDERS: Order[] = [ /* … */ ];
```

Rules:

- One module per resource (`orders.ts`, `auth.ts`, …). Each exported function returns the same DTO type in mock and real mode; the branch is a single `API_BASE_URL === null` check.
- Every function throws `ApiError` on failure — flow catch blocks can rely on `error instanceof ApiError`.
- When the user connects a real backend in the builder, the generator replaces only `client.ts`/endpoint bodies; screen code and flow code are untouched (this is why flows always call `src/api/*` functions, never `fetch` inline).

---

## 5. Emission rules — animations

This is the critical section. Every builder animation concept maps to exactly one verified Reanimated 4.7.1 / Worklets 0.13.1 / RNGH 3 emission. All API shapes below were verified against the published `react-native-reanimated@4.7.1` tarball type definitions and the 4.x docs in the repo.

### 5.0 Cross-cutting rules

1. **Inline callbacks need NO `'worklet'` directive.** Verified from the Worklets plugin docs ("Autoworkletization … the Worklets plugin autoworkletizes all callbacks for all its API" and RNGH `reanimated-interactions.mdx`: callbacks passed inline in gesture configs "are automatically workletized"). The generator therefore NEVER emits `'worklet';` **unless** a callback is hoisted to a variable or wrapped in `useCallback` — then and only then it emits the directive as the first statement.
2. **Import shape:** `import Animated, { … } from 'react-native-reanimated';` — default namespace for components, named for hooks/builders. Threading functions import from `'react-native-worklets'`.
3. **CSS transitions/animations are the default choice for state-driven motion** (verified docs: "the recommended starting point for most animations"); shared values are for gesture/scroll/orchestrated motion.
4. **Correction to earlier builder docs — pseudo-selector for press is `:active`, NOT `:press`.** Verified in the published 4.7.1 types (`css/types/pseudo.d.ts`): `NativePseudoSelectorKey = ':hover' | ':active' | ':active-deepest' | ':focus' | ':focus-within'`. There is no `:press` key. The builder UI may label it "Press"; codegen emits `:active`.

### 5.1 State-driven (press/hover feedback, color + layout changes) → CSS transitions

Builder "hover/press style change" and any "animate between two style states" concept emits **CSS transition props inside the inline style**, with pseudo-selector objects for interaction states:

```tsx
import { useState } from 'react';
import { Platform } from 'react-native';
import Animated from 'react-native-reanimated';

export default function Card() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Animated.View
      style={{
        backgroundColor: {
          default: '#f5f5f5',
          ':hover': '#e8e8ff',
          ':active': '#d4d0ff',
        },
        transform: [{ scale: { default: 1, ':active': 0.97 } }],
        height: expanded ? 200 : 120,
        transitionProperty: ['backgroundColor', 'transform', 'height'],
        transitionDuration: 200,
      }}
    />
  );
}
```

Verified API shape:

- `transitionProperty`: array of style keys or `'all'`; `transitionDuration` (ms); optional `transitionDelay`, `transitionTimingFunction` (e.g. `'ease-in-out'`), `transitionBehavior` for discrete properties.
- Pseudo-selector objects: each affected style key can be `{ default: v, ':hover': v2, ':active': v3, ':focus': v4 }` — verified `CSSPseudoValue` type (RequireAtLeastOne of `'default' | ':hover' | ':active' | ':active-deepest' | ':focus' | ':focus-within' | web-only keys`).
- **Trigger rule:** a transition fires on **re-render-driven changes** (state/prop). Pseudo-selector variants need no state at all. If the builder's value source is a continuous gesture, this whole section does not apply — use §5.5.

Emission policy:

| Builder concept | Emission |
|---|---|
| "Press effect (scale/color)" | `:active` pseudo values + `transitionProperty`/`transitionDuration` (no state, no gesture) |
| "Hover effect" | `:hover` pseudo values + transition props |
| "Expand/collapse on toggle" | React `useState` + conditional values + `transitionProperty: ['height', …]` |
| Multi-step self-running loop (loader, pulse) | CSS animation (§5.1.1), not transition |

**5.1.1 CSS keyframe animations** (self-running loops / multi-step timelines):

```tsx
const pulse = {
  from: { transform: [{ scale: 0.8 }, { rotateZ: '-15deg' }] },
  '50%': { transform: [{ scale: 1.2 }] },
  to: { transform: [{ scale: 1 }, { rotateZ: '15deg' }] },
};

<Animated.View
  style={{
    animationName: pulse,
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationDirection: 'alternate',
    animationTimingFunction: 'ease-in-out',
  }}
/>
```

Verified: keyframes object passed directly to `animationName` (docs: "instead of a name you pass the keyframes object directly to `animationName`"); offsets `from`/`to`/percent strings; `animationDuration: '1s'` string with unit; iteration `'infinite'`.

### 5.2 Entering / exiting → builder classes

Builder "appear/disappear" presets map to the entering/exiting builders (all verified exports of 4.7.1). Presets:

```tsx
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutUp, ZoomIn, BounceInDown } from 'react-native-reanimated';

<Animated.View entering={FadeIn} exiting={FadeOut} />
<Animated.View entering={SlideInDown.duration(300).delay(100)} exiting={SlideOutUp.duration(250)} />
<Animated.View entering={ZoomIn.springify().dampingRatio(0.7)} />
```

- Chainable modifiers (verified on `ComplexAnimationBuilder`/`BaseAnimationBuilder`): `.duration(ms)`, `.delay(ms)`, `.easing(fn)`, `.springify(duration?)`, `.damping()`, `.dampingRatio()`, `.mass()`, `.stiffness()`, `.overshootClamping()`, `.energyThreshold()`, `.rotate(deg)`, `.withInitialValues({...})`, `.withCallback((finished) => …)`, `.reduceMotion(ReduceMotion.System|Never|Always)`.
- `.randomDelay()` is **deprecated** (verified JSDoc: "Use `.delay()` with `Math.random()` instead") — never emitted.
- Full preset inventory the builder may expose (verified exports): Fade/Slide/Bounce/Zoom/Flip/Pinwheel/Roll/LightSpeed/Stretch/Rotate families, `In`/`Out` and directional variants (`FadeInUp`, `SlideInDown`, `ZoomInEasyUp`, `FlipInXDown`, `BounceInLeft`, …).
- Combined entry+exit: `EntryExitTransition.entering(enteringAnim).exiting(exitingAnim)` (verified; replaces removed `combineTransition`).
- Mount/unmount must be driven by React state — the entering/exiting props animate when React adds/removes the node. `{isVisible && <Animated.View entering={FadeIn} exiting={FadeOut} />}`.

**Custom entering/exiting → `new Keyframe`:**

```tsx
import { Easing, Keyframe, ReduceMotion } from 'react-native-reanimated';

const enterKeyframe = new Keyframe({
  0: { transform: [{ rotate: '0deg' }], opacity: 0 },
  45: { transform: [{ rotate: '100deg' }], opacity: 1, easing: Easing.exp },
  100: { transform: [{ rotate: '45deg' }], opacity: 1 },
})
  .duration(600)
  .delay(100)
  .reduceMotion(ReduceMotion.System)
  .withCallback((finished) => {
    // safe place for JS-visible effects is via scheduleOnRN — see 5.8
  });

<Animated.View entering={enterKeyframe} />
```

Verified: keys `0`/`from`, `0–100` percents, `100`/`to`; per-key optional `easing` (default `Easing.linear`); builder methods `.duration()` (default 500), `.delay()` (default 0), `.reduceMotion()`, `.withCallback()`.

### 5.3 Layout changes → layout transitions

When the builder marks a container's reflow (children added/removed/moved) as animated:

```tsx
import Animated, { LinearTransition, SequencedTransition, CurvedTransition, FadingTransition, JumpingTransition, Layout } from 'react-native-reanimated';

<Animated.View layout={LinearTransition} />
<Animated.View layout={LinearTransition.springify().dampingRatio(0.85)} />
<Animated.View layout={SequencedTransition.duration(300)} />
<Animated.View layout={CurvedTransition.easing(Easing.inOut(Easing.quad))} />
```

- Same modifier chains as §5.2.
- For lists where layout animations misfire, emit `LayoutAnimationConfig` (verified export) around the list to scope/disable: `<LayoutAnimationConfig skipEntering>{…}</LayoutAnimationConfig>`.

### 5.4 Gesture-driven (drag and friends) → RNGH 3 hooks + shared values

Builder "draggable" / "pinch" / "tap to animate" emits the **RNGH 3 hook API** (the `Gesture.Tap()` builder is deprecated in 3.4.0 — verified JSDoc in `gestureObjects.d.ts`: "`Gesture.Tap()` is deprecated and will be removed in the future. Please use `useTapGesture` instead."):

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring, type WithSpringConfig } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

const SPRING_CONFIG: WithSpringConfig = {
  damping: 26,
  mass: 1,
  stiffness: 300,
};

export default function DraggableCard() {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const panGesture = usePanGesture({
    onUpdate: (event) => {
      offsetX.value = event.translationX;
      offsetY.value = event.translationY;
    },
    onDeactivate: () => {
      offsetX.value = withSpring(0, SPRING_CONFIG);
      offsetY.value = withSpring(0, SPRING_CONFIG);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[{ width: 120, height: 120, borderRadius: 16, backgroundColor: '#7c5cff' }, animatedStyle]} />
    </GestureDetector>
  );
}
```

Verified rules:

- Hook inventory: `useTapGesture`, `usePanGesture`, `usePinchGesture`, `useRotationGesture`, `useFlingGesture`, `useLongPressGesture`, `useNativeGesture`, `useManualGesture`, `useHoverGesture` (all verified exports of RNGH 3.4.0 `v3` module).
- **Config object** (not a builder chain): gesture properties (`minDistance`, `activeOffsetX/Y`, `failOffsetX/Y`, `minPointers`, `maxPointers`, `minVelocity`, `maxDist`, `activateAfterLongPress`, …), common options (`enabled`, `runOnJS`, `hitSlop`, `manualActivation`, `userSelect`, `testID`, …) and callbacks all live in one object. **SharedValues are accepted directly in the config** (verified: `WithSharedValue<…>` config types + docs "RNGH3 allows passing SharedValue to gestures' configurations").
- **Callback names: `onBegin`, `onActivate`, `onUpdate`, `onDeactivate`, `onFinalize`** (+ `onTouchesDown/Move/Up/Cancel`). The legacy `onStart`/`onEnd`/`onChange` names belong to the deprecated builder API and are never emitted.
- Callbacks written **inline** are auto-workletized (no `'worklet'`).
- Event data for pan: `event.translationX/Y`, `event.velocityX/Y`, `event.changeX/Y`, `event.absoluteX/Y`, `event.x/y` (verified `PanExtendedHandlerData`).
- `runOnJS` is a **config option** in the hook API (`runOnJS: true` in the config object), not a chainable — verified in `CommonGestureConfig`.
- Style composition: `style={[inlineStaticLiteral, animatedStyle]}` — static inline first, animated second.
- **`GestureDetector` is a host component in RNGH 3.** If the builder places a detector inside a layout that breaks with an extra view (e.g. inside certain list headers), emit `VirtualGestureDetector` wrapped in an `InterceptingGestureDetector` ancestor (verified docs). Default remains plain `GestureDetector`.
- Composed gestures: `useSimultaneousGestures(g1, g2)`, `useExclusiveGestures(g1, g2)`, `useCompetingGestures(g1, g2)` (verified exports; the `Gesture.Simultaneous()` etc. builders are deprecated).
- One gesture object per detector — never reuse a gesture instance across two detectors (verified docs warning: undefined behavior).

### 5.5 Scroll-driven → `useScrollOffset` (NOT `useScrollViewOffset`)

Builder "parallax header / fade on scroll / sticky header shrink" concepts:

```tsx
import { useRef } from 'react';
import { ScrollView, type ScrollViewRef } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';

export default function ProfileScreen() {
  const scrollRef = useAnimatedRef<ScrollViewRef>();
  const scrollOffset = useScrollOffset(scrollRef);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollOffset.value,
      [0, 120],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [{ translateY: scrollOffset.value * 0.5 }],
  }));

  return (
    <Animated.ScrollView ref={scrollRef}>
      <Animated.View style={[{ height: 200 }, headerStyle]} />
      {/* content */}
    </Animated.ScrollView>
  );
}
```

Verified rules:

- **`useScrollOffset`** (renamed from `useScrollViewOffset` in 4.x; old name is a deprecated alias — verified in `index.d.ts`: `useScrollOffset as useScrollViewOffset` marked `@deprecated`). Signature: `useScrollOffset(animatedRef, providedOffset?)` returns `SharedValue<number>`.
- `useAnimatedRef<ScrollViewRef>()` attaches to a plain RN **or** Animated scrollable (verified docs: ref "has to be passed either to an Animated component or a React Native built-in component"). Works with `ScrollView`, `FlatList`, `FlashList`.
- `interpolate(value, inputRange, outputRange, type?)` with `Extrapolation.CLAMP` — `Extrapolation` (not the deprecated `Extrapolate`).
- `Animated.ScrollView` also accepts a `scrollViewOffset?: SharedValue<number>` prop (verified) — the generator may emit either; the hook form is preferred because it works with any scrollable.
- If per-event logic beyond the offset is needed (momentum tracking, direction detection), emit `useAnimatedScrollHandler` — **current, NOT deprecated in 4.x** (verified in 4.7.1 exports + docs) — and it requires the scrollable to be `Animated.ScrollView`/`Animated.FlatList`:

```tsx
const scrollHandler = useAnimatedScrollHandler({
  onScroll: (event) => { lastY.value = event.contentOffset.y; },
  onBeginDrag: (event) => { /* … */ },
  onEndDrag: (event) => { /* … */ },
  onMomentumBegin: (event) => { /* … */ },
  onMomentumEnd: (event) => { /* … */ },
});
<Animated.ScrollView onScroll={scrollHandler} … />
```

- Simple scroll position tracking default = `useScrollOffset`; complex event logic = `useAnimatedScrollHandler`. Both are current APIs; the generator picks by need, never emits both for one scrollable.

### 5.6 Springs → `withSpring` with EXPLICIT config (defaults changed in 4.x)

`withSpring` semantics changed in Reanimated 4 (verified migration guide + `springConfigs.d.ts`), so the generator **always emits an explicit config object** — never relies on defaults:

```tsx
import { withSpring, type WithSpringConfig } from 'react-native-reanimated';

// Physics-based (preferred default for gesture releases):
const SPRING_CONFIG: WithSpringConfig = {
  damping: 26,
  mass: 1,
  stiffness: 300,
  overshootClamping: false,
};
offset.value = withSpring(0, SPRING_CONFIG);

// Duration-based (when the builder sets a duration):
const SPRING_DURATION_CONFIG: WithSpringConfig = {
  duration: 300,          // ⚠ PERCEPTUAL duration — actual time is 1.5× this value
  dampingRatio: 1,        // 1 = critically damped
};
offset.value = withSpring(0, SPRING_DURATION_CONFIG);
```

Verified gotchas the generator must respect:

1. **`duration` is perceptual**: actual duration = 1.5 × value. When the builder asks for a spring of *N ms visible duration*, emit `duration: N / 1.5`.
2. **4.x defaults are `GentleSpringConfig`** (`damping: 120, mass: 4, stiffness: 900`) — completely different from 3.x (`damping: 10, mass: 1, stiffness: 100`). Old 3.x behavior is importable (`Reanimated3DefaultSpringConfig`) but the generator never relies on defaults: explicit config always.
3. **`restDisplacementThreshold` / `restSpeedThreshold` are REMOVED** in 4.x — replaced by `energyThreshold` (default `6e-9`). Only `energyThreshold` may be emitted.
4. `stiffness`/`damping` (physics) and `duration`/`dampingRatio` (+ `clamp?: {min, max}`) are **mutually exclusive** — the type is a `MutuallyExclusiveUnion`; never emit both groups in one config.
5. Optional: duration-based config may include `clamp: { min, max }` to reduce bounciness at limits (verified SpringConfig type).
6. Preset configs the generator may emit for builder "feel" presets (verified exports): `GentleSpringConfig`, `SnappySpringConfig` (+ `WithDuration` variants), `WigglySpringConfig` (+WithDuration).
7. Momentum/decay release ("flick") → `withDecay` (verified `DecayConfig`): `{ velocity: event.velocityX, deceleration: 0.998, clamp: [0, 300], rubberBandEffect: true }` — `clamp` is `[min, max]`; `rubberBandEffect: true` requires `clamp`.
8. Sequencing: `withSequence(withTiming(…), withSpring(…), withDelay(200, withTiming(…)))`; repetition: `withRepeat(anim, repetitions, reverse)`; `withClamp(min, max, anim)` exists for clamping a nested animation (verified export).

### 5.7 Derived / reactive values

Builder "computed value" concepts (progress from two shared values, formatted text from a number, etc.):

```tsx
const progress = useSharedValue(0);
const percentText = useDerivedValue(() => `${Math.round(progress.value * 100)}%`);
```

- `useDerivedValue(updater, deps?)` returns a readonly derived value (verified; `.get()`/`.set()` on derived values are deprecated — the JSDoc says derived values are readonly).
- Reacting to shared-value changes with side effects: `useAnimatedReaction(prepare, react)` — verified signature `useAnimatedReaction<PreparedResult>(prepare: () => PreparedResult, react: (prepared, previous) => void, deps?)`.
- **Inline shared values in styles/props for the simple cases** (verified 4.x feature): `<Animated.View style={{ width }} />` where `width` is a SharedValue — no `useAnimatedStyle` needed. Policy: emit inline when a shared value is passed through unmodified; emit `useAnimatedStyle` the moment any computation (multiply, interpolate, condition) is involved. Note the plugin warns on `style={{ width: width.value }}` (value access in inline styles loses reactivity) — the generator always passes the shared value itself, never `.value`, in inline positions.
- `Animated.Text` with shared-value children is a **4.8 feature** — FORBIDDEN in output today (§2.4); numeric-to-text display uses `useDerivedValue` + §5.8 bridge today.

### 5.8 Threading — animation → JS-side effect

When a flow needs a JS-side effect from inside an animation/gesture callback (set React state, call router, fire an API), the generator emits `scheduleOnRN` from `react-native-worklets` with the **new direct-args signature** (verified in `threads.d.ts`: `scheduleOnRN<Args, R>(fun: (...args: Args) => R, ...args: Args): void`):

```tsx
import { scheduleOnRN } from 'react-native-worklets';

const panGesture = usePanGesture({
  onFinalize: (event) => {
    if (event.translationY < -120) {
      scheduleOnRN(handleDismiss);               // no args
    } else {
      scheduleOnRN(handleSnap, event.translationY); // with args — direct, NOT curried
    }
  },
});
```

Rules:

- Import from **`react-native-worklets`**, not reanimated (reanimated's `runOnJS` is a deprecated re-export).
- Direct call: `scheduleOnRN(fn, arg1, arg2)`. The curried form `runOnJS(fn)(args)` is deprecated and never emitted.
- `scheduleOnUI(fn, ...args)` is the reverse direction (JS → UI), also direct-args.
- Prefer restructuring over threading: if the only JS-side effect is a boolean flag consumed by React render, prefer `useAnimatedReaction` + `scheduleOnRN` of a setter, or lift the interaction to a plain RNGH callback with `runOnJS: true` in the gesture config (verified config option) when no animation values are involved.

### 5.9 FORBIDDEN list (never emitted — verified deprecated/removed) with replacements

| FORBIDDEN (status) | Verified status | Emit instead |
|---|---|---|
| `AnimateStyle<…>` type | Type no longer exists in 4.x (verified: no occurrence in 4.7.1 types) | `AnimatedStyle<T>` / `AnimatedProps<Props>` / `AnimatedStyleHandle<Style>` |
| `useAnimatedGestureHandler` | Removed in 4.x (verified migration guide) | RNGH hooks: `usePanGesture({ onUpdate, onDeactivate })` etc. |
| `Gesture.Tap()` / `Gesture.Pan()` / `Gesture.Simultaneous()` / `Gesture.Race()` / `Gesture.Exclusive()` builder API | Deprecated in RNGH 3.4.0 (verified JSDoc: "deprecated and will be removed…") | `useTapGesture()` / `usePanGesture()` / `useSimultaneousGestures()` / `useCompetingGestures()` / `useExclusiveGestures()` |
| `runOnJS(fn)(args)` (curried) | Deprecated re-export; replaced with direct-args API (verified worklets docs + migration guide) | `scheduleOnRN(fn, args)` from `react-native-worklets` |
| `runOnUI(fn)(args)` / `executeOnUIRuntimeSync(fn)(args)` | Deprecated (same) | `scheduleOnUI(fn, args)` / `runOnUISync(fn, args)` |
| `makeShareableCloneRecursive` | Deprecated (verified workletFunctions.d.ts) | `createSerializable` |
| `useScrollViewOffset` | Deprecated alias (verified index.d.ts `@deprecated` comment) | `useScrollOffset` |
| `Extrapolate` | Deprecated alias (verified index.d.ts) | `Extrapolation` (e.g. `Extrapolation.CLAMP`) |
| `restDisplacementThreshold` / `restSpeedThreshold` (withSpring config) | Removed in 4.x (verified migration guide + SpringConfig type) | `energyThreshold` (default `6e-9`) |
| `combineTransition` | Removed in 4.x (verified migration guide) | `EntryExitTransition.entering(a).exiting(b)` |
| `entryEffect` | Does NOT exist (verified: zero occurrences in repo/docs) | CSS transition with pseudo-selectors (§5.1) |
| `addWhitelistedNativeProps` / `addWhitelistedUIProps` | No-ops, deprecated (verified deprecated.ts) | Nothing (remove) |
| `useWorkletCallback` | Removed in 4.x | `useCallback(() => { 'worklet'; … }, [deps])` |
| `useAnimatedKeyboard` | Deprecated (verified JSDoc) | `react-native-keyboard-controller` |
| `StyleSheet.create` | Product constraint (inline styles only) | Inline style object literals |
| `className` / NativeWind / styled-components | Product constraint | Inline style object literals |
| `.randomDelay()` on layout builders | Deprecated (verified JSDoc: "Use `.delay()` with `Math.random()` instead") | `.delay(Math.random() * N)` |
| `Animated.Text` with SharedValue children | 4.8 feature, not in 4.7.1 (verified) | `useDerivedValue` + §5.8 bridge |
| `:press` pseudo-selector | Does not exist (verified pseudo.d.ts) | `:active` |

### 5.10 Shared element / screen transitions

Builder "shared element between screens" (e.g. avatar list → detail):

```tsx
// app/orders/index.tsx
<Animated.Image
  source={{ uri: order.imageUrl }}
  sharedTransitionTag={`order-${order.id}`}
  style={{ width: 80, height: 80, borderRadius: 40 }}
/>

// app/orders/[id].tsx
<Animated.Image
  source={{ uri: order.imageUrl }}
  sharedTransitionTag={`order-${order.id}`}
  style={{ width: 200, height: 200, borderRadius: 16 }}
/>
```

Verified rules:

- Same `sharedTransitionTag` string on both screens; tags must be **unique per matching pair** — dynamic tags interpolate the id (as above).
- Optional transition customization: `SharedTransition` is a builder class (verified export of 4.7.1) passed to the `sharedTransitionStyle` prop, e.g. `sharedTransitionStyle={SharedTransition.duration(300)}`. The two verified props are exactly `sharedTransitionTag?: string` and `sharedTransitionStyle?: SharedTransition` (verified in `helperTypes.d.ts` → `SharedTransitionProps`). No other shared-element props are emitted.
- Wrap screens that contain shared elements with `<SharedTransitionBoundary>` only when the builder explicitly needs boundary control (verified export; default behavior usually suffices).
- Native back-gesture driven screen transitions (iOS swipe back): `startScreenTransition` / `finishScreenTransition` + `GoBackGesture` exist (verified exports) but require react-native-screens integration — OPEN QUESTION: product hasn't specced custom go-back animations; do not emit until specced.

### 5.11 SVG animation

```tsx
import Animated from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const r = useSharedValue(20);
<AnimatedCircle r={r} fill="#7c5cff" />; // inline shared value prop — verified pattern
```

- SVG geometry (`cx`, `r`, `d`, `points`) and paint (`fill`, `stroke`) animate via **props** (inline shared value or `useAnimatedProps`), not style. Verified from `guides/animating-svg.mdx`.
- CSS transitions on SVG props are experimental (on by default since 4.4, flag `EXPERIMENTAL_CSS_ANIMATIONS_FOR_SVG_COMPONENTS`); the generator sticks to inline props + `useAnimatedProps` for SVG — no experimental flag dependencies.

---

## 6. Code style rules

### 6.1 Formatting

- **Semicolons: yes.** Double quotes. Trailing commas in multiline. 2-space indent. 100-col wrap. Prettier defaults with `{"semi": true, "singleQuote": false, "trailingComma": "es5"}` — emitted as a `prettier` note in README (Prettier is NOT added to devDependencies unless the user opts in; the generator itself formats deterministically).
- JSX: double quotes for attribute strings; single/double quotes in TS follow Prettier (double).
- Template literals only for interpolation, never for plain strings.

### 6.2 Import ordering (groups, blank line between; enforced by gate G1)

```tsx
// 1. react
import { useState } from 'react';

// 2. react-native + expo
import { View, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// 3. third-party (reanimated, worklets, gesture-handler, flash-list, …)
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, usePanGesture, GestureHandlerRootView } from 'react-native-gesture-handler';

// 4. local (@/ components, src)
import OrderCard from '@/components/OrderCard';
import { listOrders } from '@/src/api/orders';
import type { Order } from '@/src/types/api';

// 5. relative (only inside app/ route files that import siblings — rare)
```

- `import type` for type-only imports (verbatim flow).
- Named-import members sorted alphabetically, with `Animated` default first.
- No unused imports — gate G1 runs ESLint-equivalent unused check on the AST before output.

### 6.3 Naming

- **Components / screens / classes:** PascalCase (`OrderCard`, `RootLayout`).
- **Files:** components PascalCase (`OrderCard.tsx`); route files kebab-case (§3.3); api/hooks modules camelCase (`orders.ts`, `useOrderList.ts`).
- **Props, handlers, hooks, variables:** camelCase. Handlers: `handle<Subject><Trigger>` (`handleSignInPress`, `handleCardDrag`). Boolean state: `is/has/should` prefix (`isLoading`, `hasError`).
- **SharedValues:** nouns describing the animated quantity (`offsetX`, `progress`, `cardScale`), never `animated`-prefixed.
- **Constants:** SCREAMING_SNAKE for module-level config (`SPRING_CONFIG`, `MOCK_LATENCY_MS`).
- Route params type name: `<Screen>Params` (`OrderDetailsParams = { id: string }`).

### 6.4 Custom component extraction threshold

A builder subtree extracts to `components/<Name>.tsx` when ANY of:

1. It is a list item template (always extracted — §2.5).
2. It appears identically in ≥ 2 screens (dedupe).
3. The JSX for the subtree would exceed **~80 lines** emitted (readability threshold — the largest single screen file target is ~300 lines).
4. It carries its own non-trivial animation logic (≥ 2 hooks of animation state) — extraction keeps screens declarative.

Otherwise inline JSX. Extraction policy is deterministic so regenerating produces identical trees. Extracted components receive props via a generated interface `<Name>Props` typed from the builder's bindings; data flows down only (no context unless the builder explicitly creates a provider — not currently a builder concept).

### 6.5 Component file shape

```tsx
import …; // §6.2 order

interface OrderCardProps {
  order: Order;
}

export default function OrderCard({ order }: OrderCardProps) {
  // hooks: state → shared values → derived → gestures → styles → handlers
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => { … };

  return (
    <Animated.View style={[{ … }, animatedStyle]}>
      …
    </Animated.View>
  );
}
```

Hook order inside a component is fixed: `useState` → `useSharedValue` → `useDerivedValue` → gesture hooks → `useAnimatedStyle`/`useAnimatedProps` → flow handlers. Deterministic hook ordering keeps emitted code stable across regenerations.

---

## 7. Platform variants

The builder's per-variant editing model: a screen/component may have an iOS variant and an Android variant, each independently editable, plus shared base. Codegen collapses them with this decision tree (evaluated per node, then per screen):

### 7.1 Value-only differences → `Platform.select` (inline)

Per §2.3: one or two differing style values on an otherwise identical node. Also for single-element component swaps (e.g. platform-specific pay buttons). `Platform.select` returns the *value*, and values can be JSX elements — a documented RN pattern — so it is emitted inside the parent's children as an expression:

```tsx
{Platform.select({
  ios: <ApplePayButton onPress={handleApplePress} />,
  default: <GooglePayButton onPress={handleGooglePress} />,
})}
```

Used sparingly — only for single-element swaps; multi-element or nested differences use §7.2 or §7.3.

### 7.2 Structural differences within one variant → `Platform.OS` guards

Different children or different components on the same screen, when the difference is small (≤ ~30% of the screen's JSX):

```tsx
{Platform.OS === 'ios' ? (
  <AppleSignInButton onPress={handleApplePress} />
) : (
  <GoogleSignInButton onPress={handleGooglePress} />
)}
```

Rules: ternary for two-way, `switch` never needed. Handler bodies may be shared — only the JSX differs.

### 7.3 Two separate variants → separate screens/components

When iOS and Android variants diverge structurally beyond a guard (≥ ~30% different nodes, different flows, or different navigation structure), the generator emits **one screen file per platform variant** and selects at the router level using expo-router's platform extensions (verified expo-router behavior: `order-details.ios.tsx` / `order-details.android.tsx` are picked per-platform; a base `order-details.tsx` is emitted only when a web/default variant exists):

```
app/
├── sign-in.ios.tsx
└── sign-in.android.tsx
```

Rules:

- Both files export the same default component name; route `/sign-in` resolves per platform automatically — no runtime branching at all.
- Shared pieces between the variants extract to `components/` (extraction threshold §6.4 applies across variants — shared subtree dedupes into one file used by both).
- If a web target exists and differs, `sign-in.tsx` (or `sign-in.web.tsx`) carries it; if web is identical to the base, the base file is the web fallback.
- The builder's "same node, different style value" edits never create variant files — §7.1 handles them. Variant files are only for structural divergence. This mirrors the builder's editing model: editing per-variant structure marks the node "divergent", which is exactly the signal codegen uses to choose §7.3.

### 7.4 Emission decision order (deterministic)

1. Style-value-only diff (≤2 keys) → `Platform.select` inline.
2. Small structural diff → `Platform.OS` guard.
3. Large structural diff → platform-extension files (`*.ios.tsx` / `*.android.tsx`).
4. Never emit `Platform.OS === 'web'` guards in shared files — web is a separate variant file (`*.web.tsx`) or the base.

---

## 8. Quality gates

The generator runs this checklist on the assembled output **before writing files**. A failed gate blocks output (hard gates, H) or warns (soft gates, W). Each gate is mechanically checkable on the emitted AST.

| # | Gate | Level | Check |
|---|---|---|---|
| G1 | **No unused imports.** Every named import is referenced. | H |
| G2 | **All imports resolve.** Every package in imports exists in package.json (§1.5 pins) or is a local path; every local path exists in the file tree. | H |
| G3 | **No deprecated/removed APIs.** AST scan for the §5.9 FORBIDDEN list (identifiers + member expressions): `AnimateStyle`, `useAnimatedGestureHandler`, `Gesture.` member builder calls, `runOnJS(`, `runOnUI(`, `executeOnUIRuntimeSync`, `useScrollViewOffset`, `Extrapolate.`, `restDisplacementThreshold`, `restSpeedThreshold`, `combineTransition`, `entryEffect`, `addWhitelistedNativeProps`, `addWhitelistedUIProps`, `useWorkletCallback`, `useAnimatedKeyboard`, `.randomDelay()`, `:press`. | H |
| G4 | **Inline styles only.** No `StyleSheet.create`, no `StyleSheet.` member, no `className`, no `styled.` factory. All `style`/`contentContainerStyle` values are object literals or `[literal, animatedStyle]` arrays. | H |
| G5 | **Routes valid.** Every `router.push` / `router.replace` / `<Link href>` / `<Redirect href>` target string matches a generated route (file list after platform-extension resolution). Dynamic routes use `{pathname, params}` form with all params present. Typed-routes experiment enabled. | H |
| G6 | **Babel config clean.** `babel.config.js` contains ONLY `babel-preset-expo` preset; no manual `react-native-worklets/plugin` (auto-injected by the preset — §1.3). | H |
| G7 | **Dependency closure.** Every imported third-party package is in `dependencies` with the SDK 58 registry pin (§1.5); reanimated/worklets version tuple is compatible (`4.7.x` ⇄ `0.13.x`); no packages present that nothing imports (except base template set). | H |
| G8 | **Every flow handler has an error path.** Every async handler contains `try` with a `catch` that either sets error state, navigates to an error display, or rethrows to a documented caller. `finally` restores loading state when a loading flag exists. | H |
| G9 | **Worklet correctness.** `'worklet'` directives appear ONLY in hoisted/`useCallback`-wrapped animation callbacks (§5.0 rule 1); no `.value` access on shared values inside inline style literals (reactivity loss — plugin warns, we block); gesture callbacks are inline or carry the directive. | H |
| G10 | **Animation component rule.** Every node with `entering`/`exiting`/`layout`/`animatedProps`/CSS transition props/inline shared values is an `Animated.*` component or wrapped by `createAnimatedComponent`. | H |
| G11 | **Gesture structure.** `GestureDetector` present for every gesture; exactly one gesture object per detector; no gesture outside a `GestureHandlerRootView` subtree; RN core `Modal` containing gestures has its own `GestureHandlerRootView`. | H |
| G12 | **withSpring explicit config.** Every `withSpring(` call has a config object argument; no forbidden spring keys (rest* thresholds); physics and duration groups not mixed; duration-derived values account for the 1.5× perceptual factor. | H |
| G13 | **Naming & files.** Route files kebab-case; components PascalCase; no route-name collisions after slugification. | H |
| G14 | **TypeScript strict-clean.** Output type-checks with `tsc --noEmit` under the emitted tsconfig (`strict: true`). Run in generator sandbox. | H |
| G15 | **Formatting.** Emitted files are Prettier-stable (§6.1 settings) — regeneration is diff-idempotent. | W |
| G16 | **No `newArchEnabled` in app.json** (default-on in SDK 58; the official template omits it). | W |
| G17 | **Expo Go previewability.** Warn when the project uses packages outside Expo Go's bundled set (e.g. maps, keyboard-controller) — output still valid for dev builds. | W |
| G18 | **Mock API completeness.** Every flow-referenced endpoint function exists in `src/api/*` with both mock and real branches; `ApiError` is the only thrown error type. | H |

Gate implementation notes: G3, G4, G9, G10 run on the emitted TSX AST (ts-morph or babel traverse — generator-internal choice, not part of output). G14 compiles the full project in the generator's sandbox with the same dependency set. G5 uses the route table derived from the emitted `app/` tree including platform extensions.

---

## Appendix A — Verified version/API provenance (for audits)

- Versions: `npm view <pkg> version` / `dist-tags` on 2026-10-31 — expo 58.0.22 (`sdk-58` line), react-native 0.88.1, react/react-dom 19.3.1 (SDK 58 pins 19.3.0), expo-router 58.0.29 (pin `~58.0.26`), react-native-reanimated 4.7.1, react-native-worklets 0.13.1 (pin 0.13.0), react-native-gesture-handler 3.4.0 (pin `~3.3.0`), @shopify/flash-list 2.3.2 (latest 2.3.3; SDK pin 2.3.2).
- SDK 58 registry: `packages/expo/bundledNativeModules.json` @ expo/expo main (fetched 2026-10-31).
- Babel auto-injection: `babel-preset-expo@58.0.23` published tarball, `build/configs/expo.js`.
- All Reanimated API shapes: `react-native-reanimated@4.7.1` npm tarball `lib/typescript/**` (index, Easing, hook/*, animation/*, layoutReanimation/*, css/types/pseudo.d.ts, helperTypes.d.ts, workletFunctions.d.ts, compatibility.json).
- Migration/breaking changes: `docs/docs-reanimated/versioned_docs/version-4.x/guides/migration-from-3.x.md` + `compatibility.mdx` in the software-mansion/react-native-reanimated repo @ b792eb337 (2026-10-31).
- RNGH 3 hook API + deprecations: `react-native-gesture-handler@3.4.0` npm tarball `lib/typescript/**` (`v3/hooks/**`, `handlers/gestures/gestureObjects.d.ts` JSDoc, `v3/types/ConfigTypes.d.ts`) + repo docs `fundamentals/reanimated-interactions.mdx`, `core-components/gesture-detector.mdx`.
- Worklets threading: `react-native-worklets@0.13.1` tarball `lib/typescript/threads.d.ts`.
- FlashList v2 "no estimates": `@shopify/flash-list` README @ main (verified 2026-10-31).
- Pseudo-selector keys: reanimated 4.7.1 tarball `css/types/pseudo.d.ts` — `'default' | ':hover' | ':active' | ':active-deepest' | ':focus' | ':focus-within' | web keys`. **`:press` does not exist.**

## Appendix B — OPEN QUESTIONs (tracked)

- **OPEN QUESTION (§2.4/§5.9):** `Animated.Text` accepting SharedValues as children is documented on reanimated main but not in published 4.7.1. When 4.8 ships, add the "live counter text" builder concept → `<Animated.Text>{count}</Animated.Text>` emission. Blocked until registry shows 4.8.x stable.
- **OPEN QUESTION (§5.10):** Custom iOS back-gesture screen transitions (`startScreenTransition`/`GoBackGesture`) need a react-native-screens integration spec from product before emitting.
- **OPEN QUESTION (§1.5):** Should generated projects pin `@shopify/flash-list` to the SDK 58 registry value `2.3.2` (current choice) or float `~2.3.x`? Registry-driven pin chosen for reproducibility; revisit if 2.3.3 shows meaningful fixes for generated list patterns.
- **OPEN QUESTION (§4.5):** Mock service latency/jitter realism (fixed 450ms vs randomized 200–800ms) — product to decide default.
- **OPEN QUESTION (§6.4):** Extraction threshold of 80 lines is a heuristic; needs validation against real builder trees once the component library ships.
- **OPEN QUESTION (§7.3):** expo-router platform extensions (`*.ios.tsx`) are the assumed mechanism for variant screens — verify against the installed expo-router 58 behavior for Tabs navigators (tab screens with platform extensions) before first beta; fallback is §7.2 guards everywhere.
