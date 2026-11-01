# Task 6-B — Code Generation (src/lib/codegen)

## Status: COMPLETE (post-audit hardening pass)
291/291 self-verification checks pass (including a cross-check that runs the REAL
expo-router@58.0.29 route-tree builder over the generated file map); `bun run lint`
clean; `bunx tsc --noEmit` clean for src/ (only pre-existing errors in examples/ and
skills/). Deterministic + synchronous: byte-identical on regeneration.

## What this module is
`src/lib/codegen/**` — generates real, runnable Expo (expo-router@58) code from the
ProjectData model. Pure + synchronous. Consumed by the right-panel Code tab
(code-tab.tsx) and future export.

## Public API (`@/lib/codegen`)
```ts
generateProjectFiles(data: ProjectData): Map<string, string>   // app/ tree only
codegenFileList(files: Map<string, string>): FileTreeNode[]    // Code tab tree (dirs first, alpha; file nodes carry content)
iconifyToPhosphorReact(name: string): string                   // 'ph:house' → 'House' (kebab→Pascal + home→House alias)
export type { FileTreeNode }   // { name, path, type: 'dir'|'file', content?, children }
```

## File mapping (LOCKED, verified vs expo-router@58.0.29 — source + executed)
- `app/_layout.tsx` — GestureHandlerRootView → SafeAreaProvider → StatusBar → `<Stack>`
  with `screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}`
  (doc 06 §3.1 shape). Children: one `<Stack.Screen name="X" />` per root-level entry in
  MODEL ORDER (groups by group.order, then standalone screens by screen.order):
  - stack|tabs group → `X = '(dirName)'` (layout route child of root);
  - **'none' group screen → `X = '(dirName)/route'`** (group prefix KEPT — see fix #6);
  - standalone screen → `X = 'route'`;
  - empty groups materialize nothing. Plus `export const unstable_settings = { anchor: '<first entry>' }`
    (anchor is the current API; `initialRouteName` never emitted — layoutAnchor.js reads
    `settings.anchor ?? initialRouteName` with the latter deprecated). No screens → empty map.
- `app/(${dirName})/_layout.tsx` for stack|tabs groups ONLY ('none' groups emit no layout).
  - tabs: `<Tabs>` + one `<Tabs.Screen name options={{ title, tabBarIcon: ({ color }) =>
    <Icon color={color} size={iconSize} /> }} />` per screen IN MODEL ORDER (JSX child order
    controls real tab order — verified in getSortedChildren: declared children match first,
    in order; unlisted append after). screenOptions from TabsNavConfig (active/inactive tint,
    showLabel, position, barStyle w/ conditional top border, labelStyle). Icons via
    iconifyToPhosphorReact → **`phosphor-react-native`** (one merged import line, sorted).
  - stack: `<Stack>` screenOptions { headerShown, headerStyle, headerTintColor,
    headerTitleStyle, animation, presentation } + per-screen `<Stack.Screen options={{ title }} />`.
- Screens: `app/(${dir})/<route>.tsx` / `app/<route>.tsx`:
  `<SafeAreaView edges={[enabled]} style={{ flex: 1 }}>` (react-native-safe-area-context;
  skipped entirely when no edges) wrapping `<View style={{ flex: 1, backgroundColor }}>`;
  component `Pascal(route)Screen`; no react import in v1 (no hooks yet — Flows is later);
  NEVER StyleSheet. Hidden nodes (subtrees) skipped.

## Emission contract highlights
- Props: explicit node.props values only + required visual defaults (text-typed fields —
  `content`/`title` — always emit as JSX children, explicit ?? registry default).
- Flat PropField keys remapped to the real component API at emission (preview parity):
  image `tint`→`tintColor` prop; scrollview `showsScrollIndicator`→`shows{Vertical,Horizontal}ScrollIndicator`;
  switch `trackColorTrue/False`→`trackColor={{ false, true }}`.
- Style: inline literals only; canonical order — position/left/top/right/bottom/width/height
  first (task lock), then docs/06 §2.2 order, unknown keys alphabetical. 80-col
  Prettier-like single/multiline switching; trailing commas in multiline.
- Formatting: 2-space indent, single-quoted JS strings, double-quoted JSX attribute
  strings, semicolons.
- Special emitters: button (Pressable + inner Text with typography split; variant preset
  base mirrored from the preview's exported BUTTON_VARIANT_BASE — values identical;
  mirror chosen so codegen doesn't drag RNW/preview into its import graph; NO onPress
  placeholder), divider (axis/length/thickness/color → View visual style), lineargradient
  (startColor/endColor/angle → `colors` + start/end points; 0°=left→right, 90°=top→bottom,
  center ± ½·direction, 2-decimals; registry defaults #A855F7/#EC4899 won over the task
  text's #4F8EF7/#1D6FE0 — locked registry is the default source), blurview (intensity +
  tint with 'system'→**'default'**).

## Audit pass — fixes made (each verified against the real package source)
1. **blur tint**: `system → 'systemMaterial'` was WRONG. expo-blur@58.0.5
   BlurView.types.d.ts: `BlurTint = 'light' | 'dark' | 'default' | 'extraLight' | …materials`
   and `tint` docstring `@default 'default'`. Fixed: system → 'default' ('systemMaterial'
   is a different iOS visual material).
2. **image tint**: emitted `tint="#…"` — expo-image has NO `tint` prop. expo-image@58
   Image.types.d.ts has `tintColor?: string | null`. Fixed: rename to `tintColor`.
3. **scrollview indicator**: emitted `showsScrollIndicator` — not an RN ScrollView prop
   (showsVertical/HorizontalScrollIndicator). Fixed: fan out to both (same mapping as the
   live preview renderer).
4. **lineargradient import**: registry locks `import * as LinearGradient from 'expo-linear-gradient'`,
   but `import * as X` + `<X />` is NEVER valid React — verified empirically: "Element type
   is invalid: … got: object" (React createElement with a namespace object), and tsc rejects
   it ('does not have any construct or call signatures'). expo-linear-gradient exports
   `LinearGradient` as a NAMED export (no default). docs/04 §3.1 itself specifies
   `import { LinearGradient } from 'expo-linear-gradient'`. codegen now normalizes
   namespace-form registry import lines to the equivalent NAMED import (module + symbol
   verbatim; only the FORM fixed).
   → **Flag for Task 5-A (registry owner):** registry/data/lineargradient.ts codegen.import
   deviates from docs/04 §3.1 — should be `import { LinearGradient } from 'expo-linear-gradient'`.
5. **Phosphor package name**: `@phosphor-icons/react-native` does NOT exist on npm (404;
   verified registry.npmjs.org + unpkg). The real package is **`phosphor-react-native`**
   (latest 3.0.6, actively published; exports PascalCase icons — House/HouseIcon both
   exported, House is the deprecated-but-functional alias the task text names). All 10
   DEFAULT_TAB_ICONS verified present in the published tarball. Peer dep: react-native-svg.
6. **'none' groups at the root navigator**: emitting bare `<Stack.Screen name="route" />`
   was WRONG (dead config + dev warning) and a wrong anchor would THROW at startup.
   Verified by executing the REAL expo-router@58.0.29 getRoutesCore over the generated
   file list: layout-less group dirs are hoisted onto the parent navigator with the group
   segment KEPT in the child route name — `app/(more)/about.tsx` → root child route
   `(more)/about`. Fixed: root entries + anchor use `(dirName)/route` for 'none'-group
   screens (files still land under `app/(dirName)/`, URLs stay `/route`).

## Verification (throwaway script at /tmp/codegen-verify — NOT in the repo)
Model: 1 tabs group 'Main' (3 screens, each with the view+text+nested view+text trio;
palette spread: textinput/button/image/scrollview/switch/divider/lineargradient/blurview),
1 stack group 'Auth' (2 screens — one safeArea.top only, one no edges), 1 'none' group,
1 EMPTY stack group, 1 standalone screen, hidden node, unsafe-text escaping case.
291 checks, ALL PASS:
- babel parse (@babel/parser 7.28.6, jsx+typescript plugins) of every generated file;
- forbidden-API greps (StyleSheet, SafeAreaView-from-RN, className, initialRouteName,
  onPress placeholder, docs/06 §5.9 list, `@phosphor-icons/react-native`,
  `import * as LinearGradient`);
- Tabs.Screen/Stack.Screen order == model order; root/tabs/stack anchor values;
- 'none'-group transparency + (dir)/route naming; empty group + empty project → empty map;
- imports: no unused, every JSX tag imported, one line per module;
- real-expo-router cross-check: getRoutesCore run over the generated file map — every
  emitted navigator name + anchor matches an ACTUAL child route (root: '(main)', '(auth)',
  '(more)/about', 'settings'; (main): home/explore/profile; (auth): sign-in/verify);
- real phosphor-react-native tarball: all 10 DEFAULT_TAB_ICONS exported;
- per-emitter spot checks (button preset + typography split, divider visual, gradient
  colors/start/end, blur tint 'default', switch trackColor, image tintColor, scrollview
  fanout, hidden skip, escaping); 2-space indents; trailing commas; tree order.
Also: `bun run lint` (project-wide) clean; `bunx tsc --noEmit` clean for src/.

## Resolved spec ambiguities (decisions)
1. Root-level "model order" across types: groups (by group.order) first, then standalone
   screens — the model has no cross-type ordering dimension. ('none' groups DO interleave
   as groups, so users can order their screens first via a 'none' group.)
2. 'none' groups: transparent for URLs, but root navigator children are named
   `(dir)/route` (expo-router keeps the group segment — verified). Anchor for a
   'none'-group-first project = `(dir)/route`.
3. Registry locked contract won over task-text examples where they differed (gradient
   defaults, button title/variant, switch trackColorTrue/False) — EXCEPT where the
   registry form was verifiably broken at runtime (namespace import → normalized to named).
4. Button label: title ?? registry default 'Button'; variant presets baked as base style
   (generated code matches the canvas); typography keys on the inner Text.
5. No onPress on Pressable (dead `() => {}` is worse than none — Flows wires behavior).
6. Non-text registry defaults (e.g. textinput placeholder) are NOT emitted when unset —
   explicit-only per the task lock (known preview/codegen divergence; revisit if wanted).
7. Imports: one merged line per module (symbols sorted) rather than per-entry verbatim
   lines — docs/06 §6.2 idiom; module + symbol stay registry-verbatim.
8. Unknown node types degrade to a plain View container (children preserved).

## Module files
`index.ts` (public API) · `types.ts` (FileTreeNode) · `format.ts` (identifiers, literals,
80-col value printer) · `jsx.ts` (JSX IR + renderer) · `style.ts` (canonical style order,
typography split) · `icons.ts` (iconify→Phosphor map) · `imports.ts` (ImportCollector) ·
`registry.ts` (getEntry + import-form normalization + locked-contract fallback mirror) ·
`nodes.ts` (node emitters + prop remapping) · `screens.ts` (screen files) ·
`navigation.ts` (root/tabs/stack layouts) · `files.ts` (generateProjectFiles +
codegenFileList).

## Notes for downstream agents
- Code tab (works today): `codegenFileList(generateProjectFiles(data))`; file nodes carry
  `content`. (Note: an earlier rg-based read of code-tab.tsx line 77 looked like a syntax
  error — it is NOT; the tool output mangled `[m`. Verified via od + project-wide tsc.)
- Dependencies a generated project needs (export/README task): expo-router, expo-status-bar,
  react-native-gesture-handler, react-native-safe-area-context, expo-image, expo-blur,
  expo-linear-gradient, **phosphor-react-native + react-native-svg (peer)**.
- The module imports store helpers (`sortedGroups`, `screensInBucket`, `buildScreenTree`)
  from @/lib/project/store; if a future server-side export route needs codegen, those
  three should move to a pure shared module first (store.ts is 'use client').
- Registry owner (5-A): one-line alignment suggested for lineargradient's codegen.import
  (named form) — codegen already normalizes, so output is correct either way.
