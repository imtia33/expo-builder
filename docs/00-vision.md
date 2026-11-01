# 00 — Vision: ExpoForge

> A visual builder for real Expo apps. Figma's canvas feel, Framer's live-component
> philosophy — but the output is not a prototype. It is a production-grade Expo project.

## 1. One-liner

**"Framer for Expo."** Users visually compose screens out of real Expo components,
simulate them per platform variant, wire flows (sync/async), and export a complete,
idiomatic Expo SDK 58 project — inline styles only.

## 2. The problem with existing tools

| Tool type | What it gives | Why it's not enough |
|---|---|---|
| Figma / design tools | Beautiful static screens | Zero behavior, zero code |
| Framer | Live web prototypes | Web output; HTML → RN conversion is a translation layer, always lossy |
| Low-code app builders | Real apps | Proprietary runtimes, lock-in, not "production-level" output |
| AI codegen | Code from prompts | No visual spatial control, no live behavior feedback loop |

**ExpoForge's stance:** the user never draws "pictures of UI". They drop **actual Expo
components** (`<View>`, `<FlashList>`, `<BlurView>`…) into a tree. What renders on the
canvas *is* the component, live, via react-native-web — so the preview and the exported
code are the same thing viewed two ways. No HTML→Expo conversion. No shapes→code mapping.
No proprietary runtime.

## 3. Non-negotiable principles

1. **Real components, not mockups.** Every palette entry is a real package
   (Expo first-party + vetted community), pinned per SDK 58. Deprecated packages are
   banned from the palette (see `04-component-registry.md` §5).
2. **Inline styles only.** `<View style={{ ... }}>` object literals. Never
   `StyleSheet.create`, never NativeWind/Uniwind/Tailwind-for-RN, never className.
   This is a hard product constraint echoed in the codegen quality gates.
3. **No native code by users.** Users compose existing packages. The builder never
   asks them to write Kotlin/Swift/Obj-C. Flavor variants (native tabs vs JS tabs)
   let them *choose* implementations, not *write* them.
4. **Platform truth.** iOS and Android variants are first-class, not skins: the same
   tree can behave differently per platform (e.g. `expo-blur` glass on iOS vs the
   `BlurTargetView` pattern on Android), and both are editable and exportable.
5. **High-fidelity animation.** Animation is a builder-level concept (entering/exiting/
   layout, CSS transitions, gesture-driven) that emits **current** Reanimated 4 +
   RNGH 3 hook APIs. Deprecated APIs are mechanically banned by codegen gates.
6. **Not slop.** Exported code must read like a competent human wrote it: idiomatic
   hooks, error paths on every flow, deterministic style key order, strict TS passing.
   The quality-gate checklist (`06-codegen.md` §8) is enforced, not aspirational.
7. **Copy, don't reinvent.** Where a solved problem exists we use it verbatim:
   open-pencil's Figma-calibrated pan/zoom math, its theme tokens, its UX patterns;
   Expo's packages; Reanimated's APIs. (Research: `01-research-findings.md`.)

## 4. Who it's for

- **V1:** developers/founders who want to *build* the app visually but ship real code —
  they understand props/flows, they just don't want to hand-type trees.
- **Later:** non-technical builders as the flow editor and custom-component ecosystem
  mature.

## 5. The core loop (the product in 6 steps)

1. **Add a screen** — pick device class + platform variant (e.g. iPhone 17 Pro / iOS,
   Pixel 10 / Android). The artboard appears on the infinite canvas at true device
   dimensions.
2. **Drop components** — from the bottom toolbar / left palette: `View`, `Text`,
   `FlashList` (initializes with sample items), `BlurView`, custom components…
   Drop targets respect the tree (inside the FlatList item template, etc.).
3. **Edit props & styles** — right panel: RN props in Props tab; inline style objects
   in Style tab (flexbox, spacing, typography, color). Multi-select uses the MIXED
   sentinel (open-pencil pattern).
4. **Wire flows** — select the Sign In button → Flow tab → chain: `onPress` →
   async `api-call` (send email/password) → on success `router.navigate` to "home",
   on error `alert`. Sync or async steps, ordered, with error paths.
5. **Simulate** — press ▶: the screen runs live on canvas (flows execute against a
   mock API layer; navigation actually routes between screens). Switch platform
   toggle to see the Android variant behave differently where components differ.
6. **Export** — generate the full Expo project (file tree, package.json pinned to SDK
   58, expo-router routes, inline styles, Reanimated 4 animations, RNGH 3 gestures,
   typed mock API). `bun install && npx expo start` and it runs.

## 6. What ExpoForge is NOT

- Not a Figma clone (no vector editing, no design tokens/variables for v1).
- Not a prototype tool (no "click-through" mode that isn't the real tree).
- Not a no-code lock-in platform (export is a real project, always).
- Not a web app builder (Expo projects only; RNW is our *rendering* technology, not a target).

## 7. Naming

Codename **ExpoForge**. UI copy is allowed to change; docs use this name consistently.

## 8. Doc map

| Doc | Covers |
|---|---|
| `01-research-findings.md` | verified research digest (Expo 58 / Reanimated 4 / open-pencil) |
| `02-architecture.md` | system architecture & the canvas decision |
| `03-design.md` | complete UI/UX spec (layout, canvas math, panels, toolbar, a11y) |
| `04-component-registry.md` | the palette: every component, flavor, variant, flow hook |
| `05-flow-system.md` | flow model, simulation runtime, mock API |
| `06-codegen.md` | export rules: template, emission, animation mapping, gates |
| `07-data-model.md` | project tree schema, store, undo/redo |
| `08-roadmap.md` | build phases & verification plan |
