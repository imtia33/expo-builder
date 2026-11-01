/*
 * Node tree → JSX emission (docs/06 §2 + Task 6-B locks).
 *
 * Emission rules:
 *   - props: ONLY explicit values from node.props (missing = registry default
 *     for required visual props — a 'text'-typed field always emits its
 *     content, defaulting from the registry). Flat PropField keys that differ
 *     from the real component API are remapped at emission (PROP_RENAMES,
 *     PROP_FANOUT, COMPOSED_PROPS below — same mappings the live preview
 *     applies, so generated code and canvas cannot drift);
 *   - style: inline object literal in canonical key order (see ./style.ts),
 *     emitted as the last attribute;
 *   - special emitters (entry.codegen.emitter, defaulting to the node type):
 *     button / divider / lineargradient / blurview — see the dedicated
 *     functions below;
 *   - hidden nodes (and their subtrees) are skipped entirely;
 *   - every emitted symbol is registered with the ImportCollector, so import
 *     lines exactly cover what the file uses (no unused imports).
 */

import type { ProjectNode } from '@/lib/project/types'
import type { TreeNode } from '@/lib/project/store'

import { fieldDefault, resolveEntry } from './registry'
import type { NormalizedEntry } from './registry'
import { orderedStyle, splitTypography } from './style'
import { el, elChild, styleAttr, textChild } from './jsx'
import type { JsxAttr, JsxChild, JsxElement } from './jsx'
import type { ImportCollector } from './imports'

export interface EmitContext {
  imports: ImportCollector
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** Register the entry's component symbol (named or default import form). */
function registerComponent(entry: NormalizedEntry, imports: ImportCollector): void {
  if (entry.importDefault) imports.addDefault(entry.importModule, entry.importDefault)
  else imports.addNamed(entry.importModule, entry.component)
}

/** Explicit prop value, or the registry default, or a doc fallback. */
function pick(node: ProjectNode, entry: NormalizedEntry, key: string, fallback?: unknown): unknown {
  const v = node.props[key]
  if (v !== undefined && v !== null) return v
  const def = fieldDefault(entry, key)
  if (def !== undefined) return def
  return fallback
}

/** JSX attribute for an arbitrary explicit value (string → attribute form). */
function attrFromValue(key: string, v: unknown): JsxAttr {
  if (typeof v === 'string') return { name: key, value: { kind: 'string', value: v } }
  return { name: key, value: { kind: 'raw', value: v } } // number / boolean / object / RawCode
}

/**
 * Registry prop keys that RENAME at emission time. The flat PropField schema
 * names differ from the real prop on the emitted component:
 *   image.tint → expo-image's `tintColor` (verified against expo-image@58
 *   Image.types.d.ts — there is no `tint` prop; the live preview maps the
 *   same way, via the tintColor style on RNW's core Image).
 */
const PROP_RENAMES: Record<string, Record<string, string>> = {
  image: { tint: 'tintColor' },
}

/**
 * Registry props that FAN OUT into multiple real props at emission time (the
 * live preview applies the identical mapping). RN ScrollView has no
 * `showsScrollIndicator` — it has `showsVerticalScrollIndicator` and
 * `showsHorizontalScrollIndicator` (both default true).
 */
const PROP_FANOUT: Record<string, Record<string, string[]>> = {
  scrollview: {
    showsScrollIndicator: ['showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator'],
  },
}

/**
 * Generic explicit-only props: known fields in registry order, then unknown
 * model props (forward compatibility) alphabetically. Nulls are treated as
 * unset (builder removal semantics). Renames/fanouts apply to both streams.
 */
function propAttrs(node: ProjectNode, entry: NormalizedEntry): JsxAttr[] {
  const attrs: JsxAttr[] = []
  const known = new Set(entry.fields.map((x) => x.key))
  const renames = PROP_RENAMES[node.type] ?? {}
  const fanout = PROP_FANOUT[node.type] ?? {}

  const push = (key: string, v: unknown): void => {
    const rename = renames[key]
    if (rename) {
      attrs.push(attrFromValue(rename, v))
      return
    }
    const targets = fanout[key]
    if (targets) {
      for (const t of targets) attrs.push(attrFromValue(t, v))
      return
    }
    attrs.push(attrFromValue(key, v))
  }

  for (const field of entry.fields) {
    if (field.type === 'text') continue // text fields are JSX children, not attributes
    const v = node.props[field.key]
    if (v === undefined || v === null) continue
    push(field.key, v)
  }
  const unknown = Object.keys(node.props)
    .filter((k) => !known.has(k) && k !== 'style' && node.props[k] !== undefined && node.props[k] !== null)
    .sort()
  for (const k of unknown) push(k, node.props[k])
  return attrs
}

/* ────────────────────────────────────────────────────────────────────────────
 * Entry point
 * ──────────────────────────────────────────────────────────────────────────── */

/** Emit one layers-tree node; null when the node is skipped (hidden). */
export function emitTreeNode(tn: TreeNode, ctx: EmitContext): JsxElement | null {
  if (tn.node.hidden) return null
  const entry = resolveEntry(tn.node.type)
  const emitter = entry.emitter ?? tn.node.type

  const childEls: JsxElement[] = []
  for (const c of tn.children) {
    const e = emitTreeNode(c, ctx)
    if (e) childEls.push(e)
  }

  switch (emitter) {
    case 'button':
      return emitButton(tn.node, entry, childEls, ctx)
    case 'divider':
      return emitDivider(tn.node, entry, childEls, ctx)
    case 'lineargradient':
      return emitLinearGradient(tn.node, entry, childEls, ctx)
    case 'blurview':
      return emitBlurView(tn.node, entry, childEls, ctx)
    default:
      return emitDefault(tn.node, entry, childEls, ctx)
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Default path — `<Component prop={value} style={{ … }}>`
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Registry props that compose into a different RN prop at emission time.
 * switch: trackColorTrue/trackColorFalse (flat PropFields) → RN's
 * trackColor={{ true, false }} object — same mapping the live preview applies.
 */
const COMPOSED_PROPS: Record<string, { target: string; keys: string[] }> = {
  switch: { target: 'trackColor', keys: ['trackColorFalse', 'trackColorTrue'] },
}

function emitDefault(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext): JsxElement {
  registerComponent(entry, ctx.imports)
  let attrs: JsxAttr[] = propAttrs(node, entry)

  const composed = COMPOSED_PROPS[node.type]
  if (composed) {
    const obj: Record<string, unknown> = {}
    for (const k of composed.keys) {
      const v = node.props[k]
      if (v === undefined || v === null) continue
      // trackColorTrue → object key 'true' (target prefix stripped, lowercased)
      const suffix = k.slice(composed.target.length)
      obj[suffix.charAt(0).toLowerCase() + suffix.slice(1)] = v
    }
    if (Object.keys(obj).length > 0) {
      attrs = attrs.filter((a) => !composed.keys.includes(a.name))
      attrs.push({ name: composed.target, value: { kind: 'raw', value: obj } })
    }
  }

  const style = orderedStyle(node.style)
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))

  const children: JsxChild[] = []
  const textField = entry.fields.find((x) => x.type === 'text')
  if (textField) {
    // Required visual prop: explicit content ?? registry default (e.g. 'Text').
    const explicit = node.props[textField.key]
    const value = explicit === undefined || explicit === null ? (textField.default ?? '') : explicit
    children.push(textChild(String(value)))
  }
  for (const c of childEls) children.push(elChild(c))
  return el(entry.component, attrs, children)
}

/* ────────────────────────────────────────────────────────────────────────────
 * button — <Pressable style={…}><Text style={typography}>{title}</Text></Pressable>
 * No onPress placeholder (behavior is wired by Flows later — dead `() => {}`
 * handlers are worse than none). The variant preset (BUTTON_VARIANT_BASE,
 * shared with the live preview) is the base style; node style wins per key —
 * generated code matches what the canvas shows. Typography keys move onto the
 * inner <Text>; the rest stays on the <Pressable>.
 * ──────────────────────────────────────────────────────────────────────────── */

interface ButtonVariantPreset {
  box: Record<string, unknown>
  label: Record<string, unknown>
}

/** Mirror of the preview's BUTTON_VARIANT_BASE (src/expoforge/preview/renderer.tsx). */
const BUTTON_VARIANT_BASE: Record<string, ButtonVariantPreset> = {
  primary: {
    box: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', borderRadius: 8 },
    label: { color: '#FFFFFF' },
  },
  secondary: {
    box: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: 8 },
    label: { color: '#111827' },
  },
  ghost: {
    box: { alignItems: 'center', justifyContent: 'center' },
    label: { color: '#111827' },
  },
}

function emitButton(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext): JsxElement {
  registerComponent(entry, ctx.imports) // Pressable
  ctx.imports.addNamed('react-native', 'Text') // inner label

  const labelField = entry.fields.find((x) => x.type === 'text')
  const labelKey = labelField?.key ?? 'title'
  const rawLabel = node.props[labelKey]
  const label = String(rawLabel ?? labelField?.default ?? 'Button')

  const variant = String(pick(node, entry, 'variant', 'primary'))
  const preset = BUTTON_VARIANT_BASE[variant] ?? BUTTON_VARIANT_BASE.ghost ?? { box: {}, label: {} }

  const { container, typography } = splitTypography(node.style)
  const boxStyle = orderedStyle({ ...preset.box, ...container })
  const labelStyle = orderedStyle({ ...preset.label, ...typography })

  const attrs: JsxAttr[] = []
  const disabled = node.props.disabled
  if (disabled !== undefined && disabled !== null) attrs.push(attrFromValue('disabled', disabled))
  const hitSlop = node.props.hitSlop
  if (hitSlop !== undefined && hitSlop !== null) attrs.push(attrFromValue('hitSlop', hitSlop))
  const ripple = node.props.android_ripple
  if (typeof ripple === 'string' && ripple.length > 0) {
    attrs.push({ name: 'android_ripple', value: { kind: 'raw', value: { color: ripple } } })
  }
  if (Object.keys(boxStyle).length > 0) attrs.push(styleAttr(boxStyle))

  const labelEl = el(
    'Text',
    Object.keys(labelStyle).length > 0 ? [styleAttr(labelStyle)] : [],
    [textChild(label)]
  )
  return el(entry.component, attrs, [elChild(labelEl), ...childEls.map((c) => elChild(c))])
}

/* ────────────────────────────────────────────────────────────────────────────
 * divider — <View style={{ …axis visual… , …node style }} />
 * Horizontal: { height: thickness, width: length, backgroundColor: color }
 * Vertical:   { width: thickness,  height: length, backgroundColor: color }
 * Node style merges on top (canvas truth wins on conflicts).
 * ──────────────────────────────────────────────────────────────────────────── */

function emitDivider(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext): JsxElement {
  registerComponent(entry, ctx.imports)
  const axis = pick(node, entry, 'axis', 'horizontal')
  const length = pick(node, entry, 'length', '100%')
  const thickness = pick(node, entry, 'thickness', 1)
  const color = pick(node, entry, 'color', '#E5E7EB')
  const visual: Record<string, unknown> =
    axis === 'vertical'
      ? { width: thickness, height: length, backgroundColor: color }
      : { height: thickness, width: length, backgroundColor: color }
  const style = orderedStyle({ ...visual, ...node.style })
  const attrs: JsxAttr[] = Object.keys(style).length > 0 ? [styleAttr(style)] : []
  return el(entry.component, attrs, childEls.map((c) => elChild(c)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * lineargradient — <LinearGradient colors={[startColor, endColor]}
 * start/end points derived from `angle` style …>. Children render inside.
 * Angle convention (locked with the preview): 0° = left→right, 90° = top→bottom;
 * points = center ± ½·direction on the unit square (2-decimal rounding).
 * ──────────────────────────────────────────────────────────────────────────── */

function emitLinearGradient(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext): JsxElement {
  registerComponent(entry, ctx.imports)

  const startColor = String(pick(node, entry, 'startColor', '#A855F7'))
  const endColor = String(pick(node, entry, 'endColor', '#EC4899'))
  const rawAngle = Number(pick(node, entry, 'angle', 45))
  const angle = Number.isFinite(rawAngle) ? Math.min(360, Math.max(0, rawAngle)) : 45
  const rad = (angle * Math.PI) / 180
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const start = { x: round2(0.5 - 0.5 * Math.cos(rad)), y: round2(0.5 - 0.5 * Math.sin(rad)) }
  const end = { x: round2(0.5 + 0.5 * Math.cos(rad)), y: round2(0.5 + 0.5 * Math.sin(rad)) }

  const attrs: JsxAttr[] = [
    { name: 'colors', value: { kind: 'raw', value: [startColor, endColor] } },
    { name: 'start', value: { kind: 'raw', value: start } },
    { name: 'end', value: { kind: 'raw', value: end } },
  ]
  const style = orderedStyle(node.style)
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))
  return el(entry.component, attrs, childEls.map((c) => elChild(c)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * blurview — <BlurView intensity={…} tint={…} style={…}> children inside.
 * Builder tint enum (system|light|dark) maps onto expo-blur's BlurTint
 * values (verified against expo-blur@58 BlurView.types.d.ts):
 *   'light' | 'dark' | 'default' | 'extraLight' | 'regular' | 'prominent' |
 *   'systemUltraThinMaterial' | … (iOS materials).
 * The builder's 'system' means 'the system default' -> the package default
 * 'default' (NOT 'systemMaterial', which is a distinct iOS visual material).
 * ──────────────────────────────────────────────────────────────────────────── */

const BLUR_TINT_MAP: Record<string, string> = {
  system: 'default',
  light: 'light',
  dark: 'dark',
}

function emitBlurView(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext): JsxElement {
  registerComponent(entry, ctx.imports)
  const intensity = pick(node, entry, 'intensity', 50)
  const tintRaw = String(pick(node, entry, 'tint', 'system'))
  const tint = BLUR_TINT_MAP[tintRaw] ?? tintRaw

  const attrs: JsxAttr[] = [
    attrFromValue('intensity', typeof intensity === 'number' ? intensity : Number(intensity) || 50),
    { name: 'tint', value: { kind: 'string', value: tint } },
  ]
  const style = orderedStyle(node.style)
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))
  return el(entry.component, attrs, childEls.map((c) => elChild(c)))
}
