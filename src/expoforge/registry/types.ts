/*
 * Component registry schema — the typed catalog that drives the insert toolbar,
 * the canvas preview, the layers tree, the property inspector, and codegen.
 *
 * The registry is PURE DATA: entries carry prop definitions, style-section ids,
 * placement defaults, implementation variants, animation capabilities, and the
 * exact import/component mapping for generated code. Rendering lives in
 * @/expoforge/preview, emission lives in @/lib/codegen.
 *
 * v3 (visual-editor rework): PropField grows into a full introspection schema —
 * nested objects, arrays, callbacks, platform gating, enum options with labels —
 * and entries can declare multiple IMPLEMENTATIONS (native vs custom variants,
 * e.g. expo-image vs react-native Image, native tab bar vs custom tab bar).
 * The inspector is generated from this metadata; nothing is hardcoded per
 * component (docs/10).
 */

import type { PlatformId } from '@/components/builder/screens/device-presets'

/* ────────────────────────────────────────────────────────────────────────────
 * Property schema (component introspection)
 * ──────────────────────────────────────────────────────────────────────────── */

export type PropFieldType =
  | 'text' // the component's text content → JSX children (preview + codegen)
  | 'string' // free-form string prop → text input
  | 'number' // → number input (scrub) or slider via `control: 'slider'`
  | 'boolean' // → toggle
  | 'enum' // → select / segmented (2–3 options)
  | 'color' // → color picker
  | 'icon' // Iconify name → icon picker
  | 'object' // nested prop → collapsible nested editor (`fields`)
  | 'array' // structured list editor (`item` fields / `itemOptions`)
  | 'callback' // event/behavior prop — not visually editable; shown as code-controlled

export type PropOption = { value: string; label?: string; description?: string }

export interface PropField {
  /** Exact prop name in generated code ('text' type renders as JSX children). */
  key: string
  label: string
  type: PropFieldType
  /** For enum fields (string shorthand is normalized to {value}). */
  options?: ReadonlyArray<string | PropOption>
  default?: unknown
  placeholder?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Grouping in the props tab, e.g. 'Content', 'Behavior'. */
  section?: string
  /** Object type: the nested fields. */
  fields?: PropField[]
  /** Array type: schema of ONE item (object item → its fields). */
  item?: PropField[]
  /** Array type: enum item shorthand. */
  itemOptions?: PropOption[]
  minItems?: number
  maxItems?: number
  /** Only meaningful on these target platforms (hide otherwise). */
  platform?: PlatformId[]
  /** Hidden behind an "Advanced" disclosure by default. */
  advanced?: boolean
  /** One-line hint shown under the control. */
  description?: string
  /** Control override: number → slider, string → textarea, enum → segmented. */
  control?: 'slider' | 'textarea' | 'segmented'
  /**
   * Phase 2: conditional visibility — the field only shows (inspector) when
   * another prop of the SAME entry equals `equals` (e.g. numColumns only when
   * horizontal=false). Codegen emitters apply the same guard so the two never
   * drift. Absent = always visible.
   */
  visibleWhen?: { key: string; equals: unknown }
}

/** Normalize `options` to labeled option objects. */
export function propOptions(field: PropField): PropOption[] {
  if (!field.options) return []
  return field.options.map((o) => (typeof o === 'string' ? { value: o } : o))
}

export type StyleSectionId = 'layout' | 'spacing' | 'appearance' | 'typography' | 'effects'

export type RegistryCategory = 'layout' | 'content' | 'input' | 'feedback' | 'media'

/* ────────────────────────────────────────────────────────────────────────────
 * Implementation variants
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ComponentImplementation {
  /** Stable id (referenced by ProjectNode.impl). */
  id: string
  label: string
  /** 'native' = platform/package component; 'custom' = generated project component. */
  kind: 'native' | 'custom'
  description: string
  /** Props unique to this implementation (merged OVER entry.props, keyed by prop name). */
  props: PropField[]
  /** The exact import/component mapping used when this implementation is active. */
  codegen: {
    import: string
    component: string
    emitter?: string
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Animation capability
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which reanimated layout animations a component supports. Absent = the
 * component animates like a normal RN component (entering + exiting).
 * Set to `{ entering: false, exiting: false }` for chrome that cannot be
 * wrapped in an Animated component (none today).
 */
export interface AnimationCapability {
  entering: boolean
  exiting: boolean
}

/* ────────────────────────────────────────────────────────────────────────────
 * Registry entry
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RegistryEntry {
  /** kebab-case stable id, referenced by node.type. */
  id: string
  /** Builder-facing name ('Text'). */
  name: string
  /** Iconify name from the Phosphor set, used in toolbar/tree/inspector. */
  icon: string
  category: RegistryCategory
  description: string
  /** Container policy: 'none' leaf, 'any' accepts children, 'text' text-content host. */
  children: 'none' | 'any' | 'text'
  /** Placement defaults in dp. Omitted height = auto (content-sized). */
  insert: { width: number; height?: number }
  /** Base props (shared by all implementations). */
  props: PropField[]
  /** Which style sections the inspector shows for this component. */
  styleSections: StyleSectionId[]
  /**
   * Implementation variants. Single-element = fixed implementation (no switcher).
   * Absent = one implicit native implementation using `codegen` below.
   */
  implementations?: ComponentImplementation[]
  /** Animation support; defaults to entering+exiting when absent. */
  animations?: AnimationCapability
  /**
   * Phase 4 (P0-1): event hooks this component can carry, shown as rows in
   * the inspector's Interaction section and wired to NodeInteractions.
   * Absent = the component has no wireable events (code-controlled only).
   */
  hooks?: ReadonlyArray<{ hook: string; label: string }>
  codegen: {
    /** Exact import line emitted into generated code. */
    import: string
    /** Exported symbol, e.g. 'View'. */
    component: string
    /** Non-null for composite components (see src/lib/codegen). */
    emitter?: string
  }
  /** Canvas-fidelity note shown in the inspector header tooltip. */
  previewNote?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * Resolution helpers (single source for every consumer)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The implementation a node uses (explicit node.impl, else the first variant). */
export function resolveImplementation(entry: RegistryEntry, implId: string | undefined): ComponentImplementation | null {
  if (!entry.implementations || entry.implementations.length === 0) return null
  return entry.implementations.find((i) => i.id === implId) ?? entry.implementations[0]
}

/**
 * The effective prop schema for a node: base entry props overlaid with the
 * active implementation's overrides (matching keys replace; new keys append in
 * impl order). Implementation ordering wins for display.
 */
export function effectiveProps(entry: RegistryEntry, implId: string | undefined): PropField[] {
  const impl = resolveImplementation(entry, implId)
  if (!impl) return entry.props
  const out: PropField[] = []
  for (const p of impl.props) out.push(p)
  for (const p of entry.props) if (!impl.props.some((x) => x.key === p.key)) out.push(p)
  return out
}

/** Animation capability with the default filled in. */
export function animationCapability(entry: RegistryEntry): AnimationCapability {
  return entry.animations ?? { entering: true, exiting: true }
}
