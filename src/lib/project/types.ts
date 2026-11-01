/*
 * ExpoForge project data model — THE single source of truth (docs/07 successor).
 *
 * One typed document drives: the left-panel hierarchy tree, the canvas artboards,
 * the live RNW preview, the property inspector, the code generator, and undo/redo.
 *
 * Design notes (informed by the Revyme study + docs/07 + docs/10 v3 rework):
 *  - Flat node map keyed by id (`nodes`), parent/child via `parentId` + `order`
 *    (cheap reparent/reorder, O(1) lookup, trivial tree derivation).
 *  - Screens are artboards with independent canvas positions; they belong to at
 *    most one group. Groups carry a navigation config that maps 1:1 to an
 *    Expo Router `_layout.tsx`, and act as Figma-Section-like canvas containers
 *    (derived bounding frame, move-together, selection).
 *  - Route/dir slugs are kebab-case and globally unique (route groups `(name)`
 *    hide the segment from URLs, so screen routes must never collide project-wide).
 *  - v3: the target platform is ONE editor-global value (ui.platform) — screens
 *    no longer carry a per-screen platform. Devices stay per-screen (dimensions);
 *    switching the global platform remaps devices to the closest preset.
 *  - v3: nodes carry optional reanimated animation specs (entering/exiting) and
 *    an optional implementation id (registry variants, e.g. expo-image vs RN Image).
 *  - v3: `rawCodeProps` preserves hand-edited attribute source the visual editor
 *    cannot represent; `codeOverride` pins a whole screen file to hand-written
 *    source (emitted verbatim, visual editing for that screen is disabled).
 */

import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { ThemePalette } from '@/lib/paint'

/* ────────────────────────────────────────────────────────────────────────
 * Theme (Phase 1: plain-TS project palette — the reference-app pattern,
 * no NativeWind/uniwind). Tokens are light/dark pairs; color fields can bind
 * to them ({ token: 'primary' } paint values) and codegen emits
 * constants/theme.ts + hooks/useTheme.ts (see src/lib/paint).
 * ──────────────────────────────────────────────────────────────────── */

export interface ProjectTheme {
  colors: ThemePalette
}

/* ────────────────────────────────────────────────────────────────────────────
 * Navigation
 * ──────────────────────────────────────────────────────────────────────────── */

export type NavKind = 'stack' | 'tabs' | 'none'

/** One tab in a tabs group. Binds to a screen in the same group. */
export interface TabItemConfig {
  screenId: string
  label: string
  /** Iconify name from the Phosphor set, e.g. 'ph:house'. */
  icon: string
}

/**
 * Tab bar implementation choice (§4.3 of the v3 spec):
 *  - 'native': Expo Router `<Tabs screenOptions={…}>` — the platform renders the bar.
 *  - 'custom': a generated `<CustomTabBar />` component (full visual control,
 *    spring-animated active state) wired through `<Tabs tabBar={…}>`.
 */
export type TabBarImplementation = 'native' | 'custom'

export interface TabsNavConfig {
  impl: TabBarImplementation
  position: 'bottom' | 'top'
  showLabels: boolean
  activeColor: string
  inactiveColor: string
  barBackground: string
  /** Visible bar height in dp, excluding the bottom safe-area inset. */
  barHeight: number
  labelSize: number
  labelWeight: '400' | '500' | '600' | '700'
  iconSize: number
  showTopBorder: boolean
  borderTopColor: string
  borderTopWidth: number
  items: TabItemConfig[]
  /** Settings for the generated custom tab bar (used when impl === 'custom'). */
  custom: CustomTabBarConfig
}

/**
 * Visual configuration of the generated `components/<X>TabBar.tsx`.
 * Keys intentionally mirror TabsNavConfig where behavior is compatible, so
 * switching implementations preserves compatible settings.
 */
export interface CustomTabBarConfig {
  activeColor: string
  inactiveColor: string
  barBackground: string
  barHeight: number
  showLabels: boolean
  labelSize: number
  labelWeight: '400' | '500' | '600' | '700'
  iconSize: number
  showTopBorder: boolean
  borderTopColor: string
  borderTopWidth: number
  /** Active tab transition. */
  animation: 'none' | 'spring' | 'fade'
  springDamping: number
  springStiffness: number
}

export interface StackNavConfig {
  headerShown: boolean
  headerBg: string
  headerTitleColor: string
  headerTitleSize: number
  /** Back button / chevron tint. */
  headerTintColor: string
  animation: 'default' | 'fade' | 'slide-from-right' | 'slide-from-left' | 'flip' | 'none'
  presentation: 'card' | 'modal' | 'formSheet' | 'pageSheet' | 'fullScreenModal'
}

export type NavConfig =
  | { kind: 'tabs'; tabs: TabsNavConfig }
  | { kind: 'stack'; stack: StackNavConfig }
  | { kind: 'none' }

/* ────────────────────────────────────────────────────────────────────────────
 * Animations (react-native-reanimated layout animations)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Easing curve ids → real reanimated `Easing` expressions (see expoforge/animations). */
export type EasingKind =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'out-quad'
  | 'out-cubic'
  | 'out-quart'
  | 'out-expo'
  | 'out-back'
  | 'out-bounce'
  | 'in-cubic'
  | 'in-out-cubic'

export interface SpringParams {
  damping: number
  stiffness: number
  mass?: number
  overshootClamping?: boolean
}

/** One configured animation. `preset` indexes the catalog in @/expoforge/animations. */
export interface AnimationSpec {
  preset: string
  /** Timing mode (ignored when `spring` is set). */
  durationMs?: number
  delayMs?: number
  easing?: EasingKind
  /** Spring mode — overrides duration/easing when present. */
  spring?: SpringParams
}

export interface NodeAnimations {
  entering?: AnimationSpec
  exiting?: AnimationSpec
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hierarchy
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ScreenGroup {
  id: string
  /** Display name, e.g. 'Main'. */
  name: string
  /** Route-group directory slug, e.g. 'main' → app/(main)/. Unique, kebab-case. */
  dirName: string
  /** Position among sibling groups (root level in v1; `parentId` reserved for nesting). */
  order: number
  parentId: string | null
  nav: NavConfig
}

export interface Screen {
  id: string
  name: string
  /** Route slug, globally unique, kebab-case → app/…/<slug>.tsx, URL /<slug>. */
  route: string
  /** Owning group id, or null for standalone (root-level) screens. */
  groupId: string | null
  /** Position among the group's (or root's) screens. */
  order: number
  deviceId: string
  /** Artboard position in canvas space (independent per screen, persisted). */
  x: number
  y: number
  /** Device-frame safe-area insets applied to the screen content. */
  safeArea: { top: boolean; bottom: boolean }
  /** Screen background — a paint value: solid hex, theme token
   *  ({ token: 'primary' }), or a gradient. Emitted on the root View
   *  (gradients wrap it in LinearGradient; see codegen/screens.ts). */
  background: string | { token: string } | { type: 'linear-gradient'; angle: number; stops: { color: string; position: number }[] } | { type: 'radial-gradient'; stops: { color: string; position: number }[] }
  /**
   * Whole-file code override: when set, codegen emits this source VERBATIM for
   * the screen's file and visual editing of its nodes is disabled (the tree
   * shows it as code-controlled). Null/undefined = normal generated screen.
   */
  codeOverride?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * Nodes (the component tree)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ProjectNode {
  id: string
  screenId: string
  /** null = root of the screen's tree. */
  parentId: string | null
  /** Registry entry id, e.g. 'view' | 'text' | 'button'. */
  type: string
  /**
   * Selected implementation id when the registry entry declares variants
   * (e.g. image: 'expo-image' | 'react-native'). Undefined = first variant.
   */
  impl?: string
  /** Position among siblings (dense, maintained by the store). */
  order: number
  /** Optional layers-tree label override. */
  name?: string
  /** Component props (registry PropField values; MISSING = registry default). */
  props: Record<string, unknown>
  /**
   * Inline style object — always emitted as an inline literal in generated code.
   * Placed nodes are absolute-positioned: { position:'absolute', left, top, … }.
   * A value of `undefined` in a patch REMOVES the key.
   */
  style: Record<string, unknown>
  /** Reanimated entering/exiting animation specs. */
  animations?: NodeAnimations
  /**
   * Attribute source preserved verbatim from hand code edits for props the
   * visual editor cannot represent (expressions, functions, …). Emitted as-is;
   * the inspector shows these as code-controlled.
   */
  rawCodeProps?: Record<string, string>
  hidden?: boolean
  locked?: boolean
}

/* ────────────────────────────────────────────────────────────────────────────
 * Document, selection, simulation
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ProjectData {
  name: string
  groups: ScreenGroup[]
  screens: Screen[]
  nodes: Record<string, ProjectNode>
  /** Project color tokens (light/dark). Optional for backward compatibility;
   *  the store migration seeds the default palette when missing. */
  theme?: ProjectTheme
}

export type Selection =
  | { kind: 'group'; groupId: string }
  | { kind: 'screen'; screenId: string }
  | { kind: 'node'; nodeId: string; screenId: string }
  /** Navigator chrome selected on the canvas (tab bar / stack header of a group). */
  | { kind: 'nav'; groupId: string; part: 'tabbar' | 'header' }
  | null

/** Editor-only state persisted alongside the project (never exported). */
export interface EditorUiState {
  /** Collapsed/expanded rows in the hierarchy tree (keyed by group/screen id). */
  expanded: Record<string, boolean>
  lastDeviceId: string
  /** THE editor-wide target platform — exactly one, no per-screen platform. */
  platform: PlatformId
  /** Preview theme mode — how tokens resolve on the canvas (light default). */
  themeMode: 'light' | 'dark'
}

export interface SimState {
  on: boolean
  /**
   * Per-artboard navigation history for simulation. history[artboardScreenId]
   * is a stack of screen ids; the last entry is the screen the artboard shows.
   */
  history: Record<string, string[]>
}

/* ────────────────────────────────────────────────────────────────────────────
 * Insert tools (bottom toolbar ⇄ canvas placement contract)
 * ──────────────────────────────────────────────────────────────────────────── */

export type InsertTool =
  | { kind: 'screen' }
  | { kind: 'component'; type: string }

/* ────────────────────────────────────────────────────────────────────────────
 * Code ⇄ visual round-trip payloads (lib/codegen/parse-back → store)
 * ──────────────────────────────────────────────────────────────────────────── */

/** One node's props/style as parsed back from edited code. */
export interface CodeNodePatch {
  nodeId: string
  /** Registry-known props parsed from the JSX attributes (undefined removes). */
  props: Record<string, unknown>
  /** Full style object literal parsed from `style={{…}}`. */
  style: Record<string, unknown>
  /** Attributes that must stay verbatim (expressions, callbacks, …). */
  rawCodeProps: Record<string, string>
}

export interface CodeApplyResult {
  /** false when the edit was structural and NOT applied (override offered instead). */
  applied: boolean
  reason?: string
  /** Node ids patched (for reporting). */
  patched: string[]
  /** Node ids whose attrs contained unrepresentable expressions (kept verbatim). */
  codeControlled: string[]
}
