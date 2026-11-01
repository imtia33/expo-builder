# Task 5-A — Component Registry (data/) + Live Preview (preview/)

**Agent:** 5-A · **Scope:** `src/expoforge/registry/data/**` and `src/expoforge/preview/**` (only files touched by this agent) · **Status:** ✅ complete, `bunx tsc --noEmit` clean for these files, `bunx eslint src/expoforge/` 0/0, verified at runtime via registry + 62-check SSR render smoke tests.

## 1. What was built

### Registry data (`src/expoforge/registry/data/`) — one file per component
`DATA_ENTRIES` (exported from `data/index.ts`) now contains exactly these 9 ids, plus the 2 seeds (`view`, `text`) in `entries.ts` → 11 total. All ids in `REGISTRY_TOOL_ORDER` / `REGISTRY_FLYOUT_ORDER` resolve:

| id | file | icon (verified in offline Phosphor) | insert (dp) | category | children | codegen |
|---|---|---|---|---|---|---|
| textinput | textinput.ts | ph:cursor-text | 260×48 | input | none | `import { TextInput } from 'react-native'` · TextInput |
| button | button.ts | ph:cursor-click | 140×48 | input | none | `import { Pressable } from 'react-native'` · Pressable · **emitter: 'button'** |
| scrollview | scrollview.ts | ph:mouse-scroll | 300×220 | layout | any | `import { ScrollView } from 'react-native'` · ScrollView |
| image | image.ts | ph:image | 200×150 | media | none | `import { Image } from 'expo-image'` · Image |
| switch | switch.ts | ph:toggle-right | 51×31 | input | none | `import { Switch } from 'react-native'` · Switch |
| activityindicator | activityindicator.ts | ph:spinner-gap | 40×40 | feedback | none | `import { ActivityIndicator } from 'react-native'` · ActivityIndicator |
| divider | divider.ts | ph:minus | 280×2 | layout | none | `import { View } from 'react-native'` · View · **emitter: 'divider'** |
| lineargradient | lineargradient.ts | ph:gradient | 260×160 | layout | any | `import * as LinearGradient from 'expo-linear-gradient'` · LinearGradient · **emitter: 'lineargradient'** |
| blurview | blurview.ts | ph:drop-half-bottom | 240×140 | layout | any | `import { BlurView } from 'expo-blur'` · BlurView · **emitter: 'blurview'** |

### Live preview (`src/expoforge/preview/`)
- **`constants.ts`** — `NODE_DOM_ATTR = 'data-testid'` (canvas hit-test contract).
- **`resolve.ts`** — `resolveNode(entry, node, platform): ResolvedNode { props, style }` (registry defaults → node.props overrides, `undefined` removes a key → style as-is minus removals; `platform` reserved for variant overlays). Plus `textPropField(entry)` / `textPropValue(entry, props)` for the type-`'text'` content prop (`content` on text, `title` on button).
- **`react-native-web.d.ts`** — ambient declarations for `react-native-web@0.21.4` (**no @types package exists**; this file types it project-wide — extend, don't narrow; covers View/Text/TextInput/Pressable/ScrollView/Image/Switch/ActivityIndicator + `StyleRecord`/`StyleProp`).
- **`renderer.tsx`** — `ScreenTreePreview({ screen, nodes, platform })`; every node renders `testID={node.id}` → `data-testid` on the DOM (verified in RNW `createDOMProps`). Hidden nodes skipped; unknown types render as generic View. Per-type mapping: view→View, text→Text (content + numberOfLines>0), textinput→TextInput, button→Pressable+inner Text (typography style keys lifted onto the label; `BUTTON_VARIANT_BASE` presets primary/secondary/ghost), scrollview→ScrollView (plain contentContainerStyle), image→RNW Image (contentFit→resizeMode, tint→tintColor style, 1×1 transparent-GIF + #E5E7EB placeholder when no source), switch→Switch (trackColorTrue/False compose `{true,false}`), activityindicator→ActivityIndicator, divider→View (axis/length/thickness/color prop-base + style override), lineargradient→View + real CSS `linear-gradient()` via RNW `backgroundImage` style, blurview→iOS `backdropFilter: blur()` + translucent tint / Android semi-transparent fallback.
- **`tab-bar.tsx`** — `TabBarPreview({ config, platform, activeScreenId, onSelect })` (DOM, Iconify icons, Android pill behind active icon, border on content-facing edge for bottom/top position, `onSelect` on pointerdown + Enter/Space).
- **`stack-header.tsx`** — `StackHeaderPreview({ config, platform, title, onBack })` (44/56 heights, absolutely-centered 600-weight title, 44px back chevron `ph:caret-left` in headerTintColor).
- **`index.ts`** — public exports (`NODE_DOM_ATTR`, `resolveNode`, `textPropField/Value`, `ScreenTreePreview`, `BUTTON_VARIANT_BASE`, `TabBarPreview`, `StackHeaderPreview` + prop types).

## 2. Contracts other agents should know (DEVIATIONS from doc 04 — all documented in each entry's header comment + previewNote)

1. **button content prop is `title`** (type `'text'`), not doc 04's `label`; plus a `variant` enum (`primary|secondary|ghost`, default primary) + `disabled`. Variant presets are exported as `BUTTON_VARIANT_BASE` from `@/expoforge/preview` (primary #111827 bg/#FFFFFF label, secondary #F3F4F6/#111827, ghost transparent/#111827, radius 8, centered) — codegen emitter 'button' should match them; node style always wins.
2. **switch**: RN `trackColor` is an object — flat fields `trackColorTrue`/`trackColorFalse` (+ `thumbColor`, `ios_backgroundColor` device-only). Codegen must compose `trackColor={{ true: trackColorTrue, false: trackColorFalse }}`.
3. **lineargradient**: flat `startColor`/`endColor`/`angle` (0–360°, CSS-convention) — emitter composes `colors=[start,end]` + start/end points. (Preview renders a real CSS gradient via RNW `backgroundImage` — RN 0.76+ supports the same syntax.)
4. **blurview** is categorized `layout` (doc says "Overlay" — not in the RegistryCategory enum); `experimentalBlurMethod` omitted.
5. **textinput**: `clearButtonMode` (iOS) and `textAlignVertical` (Android — it's a STYLE key in RN, not a prop) omitted from the flat prop list; `inputMode` dropped (keyboardType covers it). `value` is a plain string prop (codegen wraps in useState/store binding per doc).
6. **scrollview**: `contentContainerStyle` has no flat PropField (v1 keeps it out of the inspector); `refreshEnabled`/`refreshing` deferred with flows; `bounces`/`overScrollMode`/`keyboardShouldPersistTaps` are registry props but no-ops in the web preview.
7. **image**: `placeholder` (blurhash) + `transition` are registry props rendered on device only (RNW Image has no equivalent); preview maps contentFit→resizeMode ('fill'→'stretch'), tint→tintColor.

## 3. RNW 0.21.4 API findings (verified in node_modules)

- `testID` → `data-testid` (createDOMProps L409) — hit-test contract holds for ALL mapped components incl. Switch (testID forwards via `other`).
- RNW serializes colors as `rgba(r,g,b,1.00)` and compiles static styles into atomic `r-*` classes — canvas overlays must not assume inline styles for everything.
- `Switch` has NO `ios_backgroundColor` on web; RNW default size 40×20 is overridden by node style (51×31 placed).
- `TextInput` attaches its own DOM onChange → controlled `value` is warning-free; `secureTextEntry` wins over `keyboardType` for the input type (password > email).
- RNW `ViewStyle` includes `backgroundImage` and `backdropFilter` (forwarded to DOM by preprocess) — used for real gradient/blur preview.
- `Image` renders remote URIs via a background-image div only AFTER load (async on client; SSR shows nothing for remote, data-URIs render synchronously).
- @iconify/react `Icon` has NO `size` prop — use `width`/`height` (as in tab-bar/stack-header); SSR renders a placeholder span, icons fill in after mount (consistent with the rest of the app).
- Pre-existing tsc errors exist in `src/app/page.tsx`, `src/components/builder/**`, `examples/`, `skills/` (other agents' WIP) — none reference expoforge files. dev.log shows a transient right-panel module-not-found (their WIP) and an EADDRINUSE duplicate dev-server attempt; not related to this task's files.

## 4. Files written (exhaustive)

```
src/expoforge/registry/data/{textinput,button,scrollview,image,switch,activityindicator,divider,lineargradient,blurview}.ts
src/expoforge/registry/data/index.ts                  (rewritten from stub → DATA_ENTRIES + named exports)
src/expoforge/preview/{constants.ts,resolve.ts,react-native-web.d.ts,renderer.tsx,tab-bar.tsx,stack-header.tsx,index.ts}
```
No other files were touched.
