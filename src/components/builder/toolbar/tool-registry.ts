'use client'
/*
 * ExpoForge toolbar model — the bottom pill's tool catalog.
 *
 * Two tool families (task 10-F spec):
 *  - Fixed tools, owned by the toolbar itself: Select (V), Hand (H), Screen (S).
 *  - Registry-driven component tools, rendered from `getEntry(type)` so the pill
 *    tracks the registry as it fills in: an unknown id is skipped gracefully.
 *    Labels come from `entry.name`; the presentation table below carries the
 *    spec-verified Phosphor icons, the label overrides the spec fixes verbatim
 *    ("Linear gradient", "Blur view", "Activity indicator"), and the shortcuts.
 *
 * The locked lists live in the registry (`REGISTRY_TOOL_ORDER` /
 * `REGISTRY_FLYOUT_ORDER`); the pill shows the spec's five most-used types and
 * `scrollview` stays palette-only (one-line add here if that ever changes).
 */

import { getEntry, REGISTRY_FLYOUT_ORDER } from '@/expoforge/registry'
import type { IconSlot } from '@/components/builder/icons/slots'
import { layerIconSlot } from '@/components/builder/left-panel/kind-icons'
import type { InsertTool } from '@/lib/project/types'

/** What the toolbar (and the canvas placement mode) can be set to. */
export type ToolbarTool = 'select' | 'hand' | InsertTool

/* ────────────────────────────────────────────────────────────────────────────
 * Fixed tools
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FixedToolDef {
  id: 'select' | 'hand' | 'screen'
  /** Editor icon slot (see icons/slots.tsx — one icon system for the whole editor). */
  icon: IconSlot
  label: string
  /** Display shortcut (tooltip + help), e.g. 'V'. */
  shortcut?: string
  /** tinykeys binding, e.g. 'v'. */
  keys?: string
}

/** Fixed v1 order: Select, Hand | Screen. */
export const FIXED_TOOLS: readonly FixedToolDef[] = [
  { id: 'select', icon: 'tool.select', label: 'Select', shortcut: 'V', keys: 'v' },
  { id: 'hand', icon: 'tool.hand', label: 'Hand', shortcut: 'H', keys: 'h' },
  { id: 'screen', icon: 'tool.screen', label: 'Screen', shortcut: 'S', keys: 's' }
]

/** Maps a fixed tool id onto its ToolbarTool value. */
export function fixedToolValue(id: FixedToolDef['id']): ToolbarTool {
  if (id === 'screen') return { kind: 'screen' }
  return id
}

/* ────────────────────────────────────────────────────────────────────────────
 * Registry-driven component tools
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ComponentTool {
  /** Registry entry id (`node.type`), e.g. 'textinput'. */
  type: string
  /** Editor icon slot — the SAME slot the tree layer rows use for this type. */
  icon: IconSlot
  /** entry.name, or the spec's verbatim label where fixed. */
  label: string
  shortcut?: string
  keys?: string
  /**
   * Phase 2 insertion options: when present, the pill renders the open-pencil
   * dual-button form [main][caret] and the caret opens a variant menu. The
   * main click inserts the DEFAULT variant (unchanged behavior); menu items
   * carry the variant's impl/props/type.
   */
  variants?: readonly ToolVariant[]
}

/** One insertion option of a component tool (Phase 2). */
export interface ToolVariant {
  /** Stable id (memory radio value), e.g. 'safe-area', 'grid'. */
  id: string
  label: string
  /** Editor icon slot for the menu item. */
  icon: IconSlot
  /** Component type to insert (defaults to the tool's type — cross-type
   *  variants: View→ScrollView, List→SectionList). */
  type?: string
  /** Implementation variant id (registry implementations[]). */
  impl?: string
  /** Insert-time prop overrides (e.g. horizontal FlatList form). */
  props?: Record<string, unknown>
  /** One-line menu hint under the label. */
  hint?: string
}

/** Pill order from the task spec: Text, View, Button, Input, Image — plus the
 * Phase 2 List tool (insertion options for lists; Figma-style tool placement). */
const PILL_ORDER = ['text', 'view', 'button', 'textinput', 'image', 'flatlist'] as const

/** Flyout order is the registry's locked list. */
const FLYOUT_ORDER: readonly string[] = REGISTRY_FLYOUT_ORDER

/** Curated presentation per registry type: label overrides the spec fixes
 * verbatim and the letter keys (V/H/S are fixed; T/B/I/L live here). Icons come
 * from the shared layerIconSlot table (one glyph per component everywhere:
 * toolbar pill, flyout, tree rows), falling back to the generic layer slot.
 * Phase 2: view/button/flatlist gain insertion-option menus (variants). */
const PRESENTATION: Record<string, { label?: string; shortcut?: string; keys?: string; variants?: ToolVariant[] }> = {
  text: { shortcut: 'T', keys: 't' },
  view: {
    shortcut: 'B',
    keys: 'b',
    variants: [
      { id: 'view', label: 'View', icon: 'tool.view', hint: 'The core layout container' },
      { id: 'safe-area', label: 'Safe Area View', icon: 'tool.safearea', impl: 'safe-area', hint: 'react-native-safe-area-context SafeAreaView' },
      { id: 'scrollview', label: 'Scroll View', icon: 'tool.scrollview', type: 'scrollview', hint: 'Scrolling container' }
    ]
  },
  button: {
    variants: [
      { id: 'pressable', label: 'Pressable', icon: 'tool.button', hint: 'Default — fully styleable composite' },
      { id: 'touchableopacity', label: 'TouchableOpacity', icon: 'tool.button-opacity', impl: 'touchableopacity', hint: 'Dims while pressed (activeOpacity)' },
      { id: 'touchablehighlight', label: 'TouchableHighlight', icon: 'tool.button-highlight', impl: 'touchablehighlight', hint: 'Underlay color while pressed' },
      { id: 'rnbutton', label: 'RN Button', icon: 'tool.button-rn', impl: 'rnbutton', hint: 'Core platform-styled button' }
    ]
  },
  textinput: { shortcut: 'I', keys: 'i' },
  flatlist: {
    label: 'List',
    shortcut: 'L',
    keys: 'l',
    variants: [
      { id: 'flatlist', label: 'Flat List', icon: 'tool.list', hint: 'Vertical repeating list' },
      { id: 'horizontal', label: 'Horizontal Flat List', icon: 'tool.list-horizontal', props: { horizontal: true }, hint: 'Carousel / chips row' },
      { id: 'grid', label: 'Grid Flat List', icon: 'tool.list-grid', props: { numColumns: 2 }, hint: 'numColumns=2 grid' },
      { id: 'sectionlist', label: 'Section List', icon: 'tool.sectionlist', type: 'sectionlist', hint: 'Grouped rows with section headers' },
      { id: 'manual', label: 'Manual list (ScrollView)', icon: 'tool.scrollview', type: 'scrollview', hint: 'Rows you place yourself — no data source' }
    ]
  },
  lineargradient: { label: 'Linear gradient' },
  blurview: { label: 'Blur view' },
  activityindicator: { label: 'Activity indicator' }
}

/** Resolves one registry type into a pill/flyout spec, or null when unknown. */
function toComponentTool(type: string): ComponentTool | null {
  const entry = getEntry(type)
  if (!entry) return null // registry still filling in — skip gracefully
  const p = PRESENTATION[type]
  return {
    type,
    icon: layerIconSlot(type),
    label: p?.label ?? entry.name,
    shortcut: p?.shortcut,
    keys: p?.keys,
    variants: p?.variants
  }
}

/* The registry is a static module-level Map, so the resolved lists are stable
 * per build; memoizing keeps hook deps and renders cheap. */
let pillToolsCache: ComponentTool[] | null = null
let flyoutToolsCache: ComponentTool[] | null = null

/** Pill component tools, existence-gated (Text, View, Button, Input, Image). */
export function getPillComponentTools(): ComponentTool[] {
  if (!pillToolsCache) {
    pillToolsCache = PILL_ORDER.map(toComponentTool).filter((t): t is ComponentTool => t !== null)
  }
  return pillToolsCache
}

/** More-flyout members, existence-gated, in REGISTRY_FLYOUT_ORDER. */
export function getFlyoutTools(): ComponentTool[] {
  if (!flyoutToolsCache) {
    flyoutToolsCache = FLYOUT_ORDER.map(toComponentTool).filter((t): t is ComponentTool => t !== null)
  }
  return flyoutToolsCache
}

/** True when `tool` is the component tool `type` (active-state test). */
export function isComponentToolActive(tool: ToolbarTool, type: string): boolean {
  return typeof tool === 'object' && tool.kind === 'component' && tool.type === type
}

/** True when `tool` is any of `types` (used for the flyout trigger). */
export function isAnyComponentToolActive(tool: ToolbarTool, types: readonly ComponentTool[]): boolean {
  return types.some((c) => isComponentToolActive(tool, c.type))
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** "Hand (H)" or just "Button" — tooltip formatting. */
export function toolTip(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label
}

/** Every letter binding (tinykeys strings → tool), only for existing tools. */
export function toolKeyBindings(): ReadonlyArray<{ keys: string; tool: ToolbarTool }> {
  const out: Array<{ keys: string; tool: ToolbarTool }> = []
  for (const fixed of FIXED_TOOLS) {
    if (fixed.keys) out.push({ keys: fixed.keys, tool: fixedToolValue(fixed.id) })
  }
  for (const c of [...getPillComponentTools(), ...getFlyoutTools()]) {
    if (c.keys) out.push({ keys: c.keys, tool: { kind: 'component', type: c.type } as ToolbarTool })
  }
  return out
}
