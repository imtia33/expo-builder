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

import type { ProjectNode, ProjectData } from '@/lib/project/types'
import type { TreeNode } from '@/lib/project/store'

import { getEntry } from '@/expoforge/registry'
import { isGradientPaint } from '@/lib/paint'
import { stateEntry, stateExpression } from '@/lib/state/screen-state'
import {
  bindingExpression,
  isItemBinding,
  itemLiteral,
  listItems,
  listSections,
  roleOfNode
} from '@/lib/lists/bindings'
import { API_PROP_KEYS, parseErrorBinding } from '@/lib/lists/api-source'

import { RawCode } from './format'
import type { ApiListEmission } from './api-list'
import { interactionHookAttr, type EmitUsage } from './interactions'
import { fieldDefault, resolveEntry } from './registry'
import type { NormalizedEntry } from './registry'
import { gradientAttrs, newPaintUsage, paintsForCodegen, type PaintUsage } from './paint'
import { orderedStyle, splitTypography } from './style'
import { el, elChild, exprChild, FRAGMENT, styleAttr, textChild } from './jsx'
import type { JsxAttr, JsxChild, JsxElement } from './jsx'
import type { ImportCollector } from './imports'

export interface EmitContext {
  imports: ImportCollector
  /** Tracks theme-token usage so the screen file adds useTheme exactly when needed. */
  paint: PaintUsage
  /** The whole project — interaction emitters resolve screen ids → hrefs. */
  data: ProjectData
  /** Emission-usage flags (router + state names) — see codegen/interactions. */
  usage: EmitUsage
}

/** Fresh context for one file (renderScreenFile). */
export function newEmitContext(imports: ImportCollector, data: ProjectData): EmitContext {
  return { imports, paint: newPaintUsage(), data, usage: { router: false, state: new Set(), api: new Map() } }
}

/** Per-subtree emission options (Phase 2 lists + Phase 4 P0-3). */
export interface EmitOpts {
  /** True while emitting a repeated item template / section header: text
   * fields and image sources turn {item.…}/{section.…} bindings into real
   * expressions. The flag flows down the whole subtree. */
  itemBinding?: boolean
  /** The error-state identifier while emitting an API list's ERROR-role
   * design (Phase 4 P0-3): {error} / {error.message} text bindings become
   * the real variable. Flows down the whole design subtree. */
  errorVar?: string
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
 * live preview applies the identical mapping). RN ScrollView/FlatList/
 * SectionList have no `showsScrollIndicator` — they have
 * showsVerticalScrollIndicator and showsHorizontalScrollIndicator.
 */
const PROP_FANOUT: Record<string, Record<string, string[]>> = {
  scrollview: {
    showsScrollIndicator: ['showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator'],
  },
  flatlist: {
    showsScrollIndicator: ['showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator'],
  },
  sectionlist: {
    showsScrollIndicator: ['showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator'],
  },
}

/**
 * Registry prop values that TRANSFORM at emission (Phase 2). Keyed by
 * `${type}:${impl}` so a mapping only applies to that implementation.
 * view:safe-area — the builder's edges enum becomes the package's array form;
 * 'all' omits the prop entirely (the package default).
 */
const PROP_TRANSFORMS: Record<string, Record<string, (v: unknown) => JsxAttr | null>> = {
  'view:safe-area': {
    edges: (v) => {
      if (v === 'top-bottom') return { name: 'edges', value: { kind: 'raw', value: ['top', 'bottom'] } }
      if (v === 'top') return { name: 'edges', value: { kind: 'raw', value: ['top'] } }
      if (v === 'bottom') return { name: 'edges', value: { kind: 'raw', value: ['bottom'] } }
      return null // 'all' → the package default; nothing is emitted
    }
  }
}

/**
 * Registry prop keys that are BUILDER CONFIG, never component attributes:
 * the API data-source fields (Phase 4 P0-3). Stripped for every list node
 * (top-level API lists remap them to the fetch lifecycle; nested/static
 * lists never carry them into generated code).
 */
const STRIP_PROP_KEYS: Record<string, readonly string[]> = {
  flatlist: API_PROP_KEYS,
  sectionlist: API_PROP_KEYS,
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
  const stripped = new Set(STRIP_PROP_KEYS[node.type] ?? [])

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
    if (stripped.has(field.key)) continue // builder config — never a component attribute
    push(field.key, v)
  }
  const unknown = Object.keys(node.props)
    .filter((k) => !known.has(k) && k !== 'style' && !stripped.has(k) && node.props[k] !== undefined && node.props[k] !== null)
    .sort()
  for (const k of unknown) push(k, node.props[k])
  return attrs
}

/* ────────────────────────────────────────────────────────────────────────────
 * Entry point
 * ──────────────────────────────────────────────────────────────────────────── */

/** Emit one layers-tree node; null when the node is skipped (hidden). */
export function emitTreeNode(tn: TreeNode, ctx: EmitContext, opts: EmitOpts = {}): JsxElement | null {
  if (tn.node.hidden) return null
  // Impl-aware: when the entry declares variants, the active one's import/
  // component mapping and prop surface win (Phase 2 — matches the preview,
  // which has branched on node.impl since v3).
  const entry = resolveEntry(tn.node.type, tn.node.impl)
  const emitter = entry.emitter ?? tn.node.type

  /* Lists own their child emission (Phase 2): roles decide which children
   * become the repeated template vs the once-per-list chrome. Guarded by
   * itemBinding so a list nested inside another list's item template still
   * emits its own renderItem (a nested list is row content, not a template
   * part of the outer list). */
  if ((emitter === 'flatlist' || emitter === 'sectionlist') && !opts.itemBinding) {
    return emitter === 'flatlist' ? emitFlatList(tn, entry, ctx) : emitSectionList(tn, entry, ctx)
  }

  const childEls: JsxElement[] = []
  for (const c of tn.children) {
    const e = emitTreeNode(c, ctx, opts)
    if (e) childEls.push(e)
  }

  switch (emitter) {
    case 'button':
      return emitButton(tn.node, entry, childEls, ctx, opts)
    case 'divider':
      return emitDivider(tn.node, entry, childEls, ctx)
    case 'lineargradient':
      return emitLinearGradient(tn.node, entry, childEls, ctx)
    case 'blurview':
      return emitBlurView(tn.node, entry, childEls, ctx)
    default:
      return emitDefault(tn.node, entry, childEls, ctx, opts)
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

function emitDefault(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext, opts: EmitOpts = {}): JsxElement {
  registerComponent(entry, ctx.imports)
  let attrs: JsxAttr[] = propAttrs(node, entry)

  /* Phase 2 value transforms (view:safe-area edges → the package's array
   * form; 'all' drops the prop). Applied to the already-built attr list so
   * renames/fanouts compose. */
  const transforms = PROP_TRANSFORMS[`${node.type}:${node.impl ?? ''}`]
  if (transforms) {
    for (const [key, fn] of Object.entries(transforms)) {
      const idx = attrs.findIndex((a) => a.name === key)
      if (idx === -1) continue
      const source = attrs[idx]
      const raw = source.value.kind === 'string' ? source.value.value : source.value.kind === 'raw' ? source.value.value : undefined
      attrs.splice(idx, 1)
      const mapped = fn(raw)
      if (mapped) attrs.splice(idx, 0, mapped)
    }
  }

  /* Bound image source inside a repeated template (Phase 2): {item.image}
   * becomes `source={{ uri: item.image }}` — RawCode splices the validated
   * member chain; user strings can never become arbitrary code. */
  if (opts.itemBinding && node.type === 'image' && isItemBinding(node.props.source)) {
    const expr = bindingExpression(node.props.source)
    const idx = attrs.findIndex((a) => a.name === 'source')
    if (expr && idx !== -1) {
      attrs[idx] = { name: 'source', value: { kind: 'raw', value: { uri: new RawCode(expr) } } }
    }
  }

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

  /* Gradient fill on a CONTAINER → the element becomes an expo-linear-gradient
   * <LinearGradient> wrapper (same emission as the lineargradient entry):
   * colors/locations/start/end from the paint, remaining style inline,
   * children inside. Non-containers degrade to the first stop color via
   * paintsForCodegen — mirroring the preview's gradient-capability rule. */
  const fill = node.style.backgroundColor
  const containerPolicy = getEntry(node.type)?.children === 'any'
  if (isGradientPaint(fill) && containerPolicy) {
    ctx.imports.addNamed('expo-linear-gradient', 'LinearGradient')
    const g = gradientAttrs(fill)
    const rest = { ...node.style, backgroundColor: undefined }
    const gradAttrs: JsxAttr[] = [
      { name: 'colors', value: { kind: 'raw', value: g.colors } },
      ...(g.locations ? [{ name: 'locations', value: { kind: 'raw' as const, value: g.locations } }] : []),
      { name: 'start', value: { kind: 'raw', value: g.start } },
      { name: 'end', value: { kind: 'raw', value: g.end } }
    ]
    const style = orderedStyle(paintsForCodegen(rest, ctx.paint))
    if (Object.keys(style).length > 0) gradAttrs.push(styleAttr(style))
    const children: JsxChild[] = []
    pushTextFieldChild(children, node, entry, opts, ctx)
    for (const c of childEls) children.push(elChild(c))
    return el('LinearGradient', gradAttrs, children)
  }

  const style = orderedStyle(paintsForCodegen(node.style, ctx.paint))
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))

  const children: JsxChild[] = []
  pushTextFieldChild(children, node, entry, opts, ctx)
  for (const c of childEls) children.push(elChild(c))
  return el(entry.component, attrs, children)
}

/**
 * The entry's text-content field as a child, binding-aware (Phase 2 lists +
 * Phase 4 state/P0-3): inside a repeated item template a safe {item.…}
 * value becomes a raw expression child (`<Text>{item.title}</Text>`); a
 * {state.x} value becomes the bare useState variable (`<Text>{busy}</Text>`)
 * when declared on the node's screen — undeclared names stay literal text,
 * the honest signal. Inside an API list's error design, {error} /
 * {error.message} become the error-state variable. Otherwise the literal text.
 */
function pushTextFieldChild(children: JsxChild[], node: ProjectNode, entry: NormalizedEntry, opts: EmitOpts, ctx: EmitContext): void {
  const textField = entry.fields.find((x) => x.type === 'text')
  if (!textField) return
  const explicit = node.props[textField.key]
  const value = explicit === undefined || explicit === null ? (textField.default ?? '') : explicit
  if (opts.itemBinding && typeof value === 'string') {
    const expr = bindingExpression(value)
    if (expr) {
      children.push(exprChild(expr))
      return
    }
  }
  if (typeof value === 'string') {
    const stateName = stateExpression(value)
    if (stateName) {
      const screen = ctx.data.screens.find((s) => s.id === node.screenId)
      if (stateEntry(screen, stateName)) {
        ctx.usage.state.add(stateName)
        children.push(exprChild(stateName))
        return
      }
      // Undeclared name → literal text (the raw {state.x} shows — honest).
    }
  }
  if (opts.errorVar && typeof value === 'string' && parseErrorBinding(value)) {
    children.push(exprChild(opts.errorVar))
    return
  }
  children.push(textChild(String(value)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * button — implementation-aware (Phase 2). One composite look (variant preset
 * + typography split, shared with the live preview) renders through the
 * active implementation's real component:
 *
 *   pressable / touchableopacity / touchablehighlight
 *     <X style={box}><Text style={typography}>{title}</Text></X>
 *     + the implementation's own props (hitSlop, activeOpacity, underlayColor,
 *     android_ripple — emitted only when set explicitly, so React Native's
 *     documented defaults apply on device).
 *
 *   rnbutton
 *     <Button onPress={…} title={…} color={…} disabled={…} /> — RN's types
 *     REQUIRE onPress, so unlike the optional-props variants the generated
 *     code carries an explicit, clearly-marked placeholder handler to wire.
 *     (For the other variants onPress stays omitted — a dead `() => {}` is
 *     worse than none; the flow system owns wiring later.)
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

function emitButton(node: ProjectNode, entry: NormalizedEntry, childEls: JsxElement[], ctx: EmitContext, opts: EmitOpts = {}): JsxElement {
  registerComponent(entry, ctx.imports) // the active implementation's component
  const implId = entry.impl ?? 'pressable'

  const labelField = entry.fields.find((x) => x.type === 'text')
  const labelKey = labelField?.key ?? 'title'
  const rawLabel = node.props[labelKey]
  const label = String(rawLabel ?? labelField?.default ?? 'Button')
  // Bound label inside a repeated template (Phase 2): {item.title} as a real
  // expression — for the composite variants as the label child, for the RN
  // Button as the `title` attribute.
  const labelExpr = opts.itemBinding && typeof rawLabel === 'string' ? bindingExpression(rawLabel) : null
  // State-bound label (Phase 4 slice 2): {state.x} → the useState variable,
  // when declared on the node's screen. Applies to BOTH the composite label
  // child and the RN-Button title attr (the same two surfaces as labelExpr).
  let stateLabelExpr: string | null = null
  if (typeof rawLabel === 'string') {
    const stateName = stateExpression(rawLabel)
    if (stateName && stateEntry(ctx.data.screens.find((s) => s.id === node.screenId), stateName)) {
      stateLabelExpr = stateName
      ctx.usage.state.add(stateName)
    }
  }
  // Error-bound label (Phase 4 P0-3): {error} inside an API list's error
  // design → the error-state variable, on both label surfaces.
  const errorLabelExpr =
    opts.errorVar && typeof rawLabel === 'string' && parseErrorBinding(rawLabel) ? opts.errorVar : null
  const titleExpr = labelExpr ?? stateLabelExpr ?? errorLabelExpr

  /* ── RN Button: the platform look — no box/typography styles, required
   * onPress, `color` only when set. ── */
  /* Wired hook (Phase 4 P0-1): the RN-Button placeholder handler is
   * REPLACED by the wired action; unwired buttons keep the placeholder. */
  const wiredPress = interactionHookAttr('onPress', node, ctx.data, ctx.usage)
  if (implId === 'rnbutton') {
    const pressAttr: JsxAttr =
      wiredPress ?? {
        name: 'onPress',
        value: {
          kind: 'raw',
          value: new RawCode('() => { /* TODO: wire an action */ }')
        }
      }
    const attrs: JsxAttr[] = [
      pressAttr,
      titleExpr
        ? { name: 'title', value: { kind: 'raw', value: new RawCode(titleExpr) } }
        : { name: 'title', value: { kind: 'string', value: label } }
    ]
    const disabled = node.props.disabled
    if (disabled !== undefined && disabled !== null) attrs.push(attrFromValue('disabled', disabled))
    const color = node.props.color
    if (typeof color === 'string' && color.length > 0) attrs.push(attrFromValue('color', color))
    // The extra child elements (rare on a leaf) still render inside.
    const children: JsxChild[] = childEls.map((c) => elChild(c))
    return el(entry.component, attrs, children)
  }

  /* ── Composite variants: same box/label contract as the preview. ── */
  ctx.imports.addNamed('react-native', 'Text') // inner label

  const variant = String(pick(node, entry, 'variant', 'primary'))
  const preset = BUTTON_VARIANT_BASE[variant] ?? BUTTON_VARIANT_BASE.ghost ?? { box: {}, label: {} }

  const { container, typography } = splitTypography(paintsForCodegen(node.style, ctx.paint))
  const boxStyle = orderedStyle({ ...preset.box, ...container })
  const labelStyle = orderedStyle({ ...preset.label, ...typography })

  const attrs: JsxAttr[] = []
  // Wired hook (Phase 4 P0-1) leads the attribute list; unwired buttons
  // stay exactly as before (no dead handlers).
  if (wiredPress) attrs.push(wiredPress)
  const disabled = node.props.disabled
  if (disabled !== undefined && disabled !== null) attrs.push(attrFromValue('disabled', disabled))

  // Implementation-specific props — explicit values only.
  if (implId === 'pressable') {
    const hitSlop = node.props.hitSlop
    if (hitSlop !== undefined && hitSlop !== null) attrs.push(attrFromValue('hitSlop', hitSlop))
    const ripple = node.props.android_ripple
    if (typeof ripple === 'string' && ripple.length > 0) {
      attrs.push({ name: 'android_ripple', value: { kind: 'raw', value: { color: ripple } } })
    }
  } else {
    // touchableopacity / touchablehighlight
    const activeOpacity = node.props.activeOpacity
    if (typeof activeOpacity === 'number' && Number.isFinite(activeOpacity)) {
      attrs.push(attrFromValue('activeOpacity', activeOpacity))
    }
    const hitSlop = node.props.hitSlop
    if (hitSlop !== undefined && hitSlop !== null) attrs.push(attrFromValue('hitSlop', hitSlop))
    if (implId === 'touchablehighlight') {
      const underlayColor = node.props.underlayColor
      if (typeof underlayColor === 'string' && underlayColor.length > 0) {
        attrs.push(attrFromValue('underlayColor', underlayColor))
      }
    }
  }
  if (Object.keys(boxStyle).length > 0) attrs.push(styleAttr(boxStyle))

  const labelChildren: JsxChild[] = [titleExpr ? exprChild(titleExpr) : textChild(label)]
  const labelEl = el(
    'Text',
    Object.keys(labelStyle).length > 0 ? [styleAttr(labelStyle)] : [],
    labelChildren
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
  const style = orderedStyle(paintsForCodegen({ ...visual, ...node.style }, ctx.paint))
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
  const style = orderedStyle(paintsForCodegen(node.style, ctx.paint))
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
  const style = orderedStyle(paintsForCodegen(node.style, ctx.paint))
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))
  return el(entry.component, attrs, childEls.map((c) => elChild(c)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lists (Phase 2) — "design ONE item, repeat with dynamic data".
 *
 * The list's direct children are partitioned by role (node.listRole):
 *   item (default)  → the repeated template, emitted ONCE as renderItem; safe
 *                      {item.…} bindings inside become real expressions.
 *   header           → flatlist: ListHeaderComponent. sectionlist: the
 *                      SECTION header (renderSectionHeader) — {section.…}
 *                      bindings become expressions against the section.
 *   footer / separator / empty → ListFooterComponent / ItemSeparatorComponent /
 *                      ListEmptyComponent.
 *
 * The static data source is emitted inline (data={[…]} / sections={[…]}):
 * explicit rows, else the registry default — the same TravelMate-style local
 * array the reference apps ship. keyExtractor is omitted on purpose: RN's
 * default (row index) is correct for static arrays and stable.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Remove an attribute by name (returns the removed value, if present). */
function takeAttr(attrs: JsxAttr[], name: string): unknown {
  const idx = attrs.findIndex((a) => a.name === name)
  if (idx === -1) return undefined
  const a = attrs.splice(idx, 1)[0]
  return a.value.kind === 'string' ? a.value.value : a.value.kind === 'raw' ? a.value.value : undefined
}

/** Emit the once-per-list chrome (header/footer/separator/empty/loading/error)
 *  as an element. `opts` threads the error-state identifier into the ERROR
 *  design ({error} bindings) — the one chrome kind with bindings. */
function emitChrome(
  tn: TreeNode,
  ctx: EmitContext,
  role: 'header' | 'footer' | 'separator' | 'empty' | 'loading' | 'error',
  opts: EmitOpts = {}
): JsxElement | null {
  const els: JsxElement[] = []
  for (const c of tn.children) {
    if (c.node.hidden || roleOfNode(c.node) !== role) continue
    const e = emitTreeNode(c, ctx, opts)
    if (e) els.push(e)
  }
  if (els.length === 0) return null
  return el(FRAGMENT, [], els.map((x) => elChild(x)))
}

/** The item template element: one child → itself; several → a fragment. */
function emitItemTemplate(tn: TreeNode, ctx: EmitContext): JsxElement {
  const els: JsxElement[] = []
  for (const c of tn.children) {
    if (c.node.hidden || roleOfNode(c.node) !== 'item') continue
    const e = emitTreeNode(c, ctx, { itemBinding: true })
    if (e) els.push(e)
  }
  if (els.length === 1) return els[0]
  return el(FRAGMENT, [], els.map((x) => elChild(x)))
}

/** Shared spacing attr: itemSpacing>0 → contentContainerStyle={{ gap }}. */
function spacingAttr(node: ProjectNode, entry: NormalizedEntry): JsxAttr | null {
  const raw = node.props.itemSpacing
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : Number(fieldDefault(entry, 'itemSpacing')) || 0
  if (n <= 0) return null
  return { name: 'contentContainerStyle', value: { kind: 'raw', value: { gap: n } } }
}

function emitFlatList(tn: TreeNode, entry: NormalizedEntry, ctx: EmitContext): JsxElement {
  const node = tn.node
  registerComponent(entry, ctx.imports) // FlatList
  const attrs: JsxAttr[] = propAttrs(node, entry)

  const horizontal = node.props.horizontal === true

  // numColumns: only meaningful >1, never with horizontal (RN ignores it there).
  const rawColumns = takeAttr(attrs, 'numColumns')
  const numColumns = typeof rawColumns === 'number' && Number.isFinite(rawColumns) ? Math.round(rawColumns) : 1
  if (numColumns > 1 && !horizontal) attrs.push(attrFromValue('numColumns', numColumns))

  // itemSpacing → contentContainerStyle gap.
  takeAttr(attrs, 'itemSpacing')
  const gap = spacingAttr(node, entry)
  if (gap) attrs.push(gap)

  /* Data source (Phase 4 P0-3). API: the rows live in screen-scope state —
   * `data={x}` — fed by the real-fetch useEffect/useCallback block the screen
   * file emits (usage.api was seeded before tree emission). Static: explicit
   * rows, else the registry default — emitted as a clean literal. */
  const api = ctx.usage.api.get(node.id)
  takeAttr(attrs, 'data')
  if (api) {
    attrs.push({ name: 'data', value: { kind: 'raw', value: new RawCode(api.ids.data) } })
    if (api.ids.refreshing) {
      attrs.push({ name: 'refreshing', value: { kind: 'raw', value: new RawCode(api.ids.refreshing) } })
      attrs.push({
        name: 'onRefresh',
        value: {
          kind: 'raw',
          value: new RawCode(`() => { set${capitalize(api.ids.refreshing)}(true); ${api.ids.loader}(); }`)
        }
      })
    }
  } else {
    const dataValue = node.props.data ?? fieldDefault(entry, 'data')
    const rows = listItems({ data: dataValue }).map((row) => itemLiteral(row))
    attrs.push({ name: 'data', value: { kind: 'raw', value: rows } })
  }

  // The repeated item template — bindings on.
  attrs.push({ name: 'renderItem', value: { kind: 'arrow', params: '{ item }', value: emitItemTemplate(tn, ctx) } })

  /* Once-per-list chrome. API lists compose the state-dependent designs
   * (loading → error → empty) into ListEmptyComponent's conditional — the
   * exact composition the live preview renders. */
  const header = emitChrome(tn, ctx, 'header')
  if (header) attrs.push({ name: 'ListHeaderComponent', value: { kind: 'jsx', value: header } })
  const footer = emitChrome(tn, ctx, 'footer')
  if (footer) attrs.push({ name: 'ListFooterComponent', value: { kind: 'jsx', value: footer } })
  const separator = emitChrome(tn, ctx, 'separator')
  if (separator) attrs.push({ name: 'ItemSeparatorComponent', value: { kind: 'jsx', value: separator } })
  const emptyAttr = listEmptyAttr(tn, ctx, api)
  if (emptyAttr) attrs.push(emptyAttr)

  const style = orderedStyle(paintsForCodegen(node.style, ctx.paint))
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))
  return el(entry.component, attrs)
}

function emitSectionList(tn: TreeNode, entry: NormalizedEntry, ctx: EmitContext): JsxElement {
  const node = tn.node
  registerComponent(entry, ctx.imports) // SectionList
  const attrs: JsxAttr[] = propAttrs(node, entry)

  /* sections (Phase 4 P0-3): API mode binds the screen-scope state variable
   * fed by the real-fetch declarations; static mode emits the RN shape
   * ({ header, data }) from the editor rows. takeAttr first — propAttrs
   * already pushed the editor-shaped value (this also fixes a pre-Phase-4
   * bug: an explicitly EDITED sections array emitted the attribute twice). */
  takeAttr(attrs, 'sections')
  const api = ctx.usage.api.get(node.id)
  if (api) {
    attrs.push({ name: 'sections', value: { kind: 'raw', value: new RawCode(api.ids.data) } })
    if (api.ids.refreshing) {
      attrs.push({ name: 'refreshing', value: { kind: 'raw', value: new RawCode(api.ids.refreshing) } })
      attrs.push({
        name: 'onRefresh',
        value: {
          kind: 'raw',
          value: new RawCode(`() => { set${capitalize(api.ids.refreshing)}(true); ${api.ids.loader}(); }`)
        }
      })
    }
  } else {
    const sectionsValue = node.props.sections ?? fieldDefault(entry, 'sections')
    const sections = listSections({ sections: sectionsValue }).map((s) => ({
      ...(s.header !== undefined ? { header: s.header } : {}),
      data: s.items.map((row) => itemLiteral(row))
    }))
    attrs.push({ name: 'sections', value: { kind: 'raw', value: sections } })
  }

  // Rows: one item template, repeated per row (bindings on).
  attrs.push({ name: 'renderItem', value: { kind: 'arrow', params: '{ item }', value: emitItemTemplate(tn, ctx) } })

  // The section header design renders per section — {section.…} bindings on.
  const headerEls: JsxElement[] = []
  for (const c of tn.children) {
    if (c.node.hidden || roleOfNode(c.node) !== 'header') continue
    const e = emitTreeNode(c, ctx, { itemBinding: true })
    if (e) headerEls.push(e)
  }
  if (headerEls.length > 0) {
    const headerTemplate = headerEls.length === 1 ? headerEls[0] : el(FRAGMENT, [], headerEls.map((x) => elChild(x)))
    attrs.push({ name: 'renderSectionHeader', value: { kind: 'arrow', params: '{ section }', value: headerTemplate } })
  }

  // itemSpacing → contentContainerStyle gap.
  takeAttr(attrs, 'itemSpacing')
  const gap = spacingAttr(node, entry)
  if (gap) attrs.push(gap)

  // Once-per-list chrome (footer / separator; no page header for sectionlist
  // — role 'header' is the SECTION header above). API lists compose the
  // loading → error → empty designs into ListEmptyComponent's conditional.
  const footer = emitChrome(tn, ctx, 'footer')
  if (footer) attrs.push({ name: 'ListFooterComponent', value: { kind: 'jsx', value: footer } })
  const separator = emitChrome(tn, ctx, 'separator')
  if (separator) attrs.push({ name: 'ItemSeparatorComponent', value: { kind: 'jsx', value: separator } })
  const emptyAttr = listEmptyAttr(tn, ctx, api)
  if (emptyAttr) attrs.push(emptyAttr)

  const style = orderedStyle(paintsForCodegen(node.style, ctx.paint))
  if (Object.keys(style).length > 0) attrs.push(styleAttr(style))
  return el(entry.component, attrs)
}

/* ── API composition helpers (Phase 4 P0-3) ─────────────────────────────── */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * ListEmptyComponent for flatlist/sectionlist. Static lists: the plain empty
 * design, exactly as Phase 2 emitted it. API lists: the state-dependent
 * designs compose into a conditional — `loading ? (…) : error ? (…) : (…)`
 * — mirroring the live preview's composition; {error} bindings inside the
 * error design resolve against the error-state variable. Null when nothing
 * is designed (no designed state → nothing rendered; the builder never
 * injects UI the user didn't draw).
 */
function listEmptyAttr(
  tn: TreeNode,
  ctx: EmitContext,
  api: ApiListEmission | undefined
): JsxAttr | null {
  const empty = emitChrome(tn, ctx, 'empty')
  if (!api) return empty ? { name: 'ListEmptyComponent', value: { kind: 'jsx', value: empty } } : null
  const loading = emitChrome(tn, ctx, 'loading')
  const error = emitChrome(tn, ctx, 'error', { errorVar: api.ids.error })
  if (!loading && !error) return empty ? { name: 'ListEmptyComponent', value: { kind: 'jsx', value: empty } } : null
  const branches: { when: string | null; el: JsxElement }[] = []
  if (loading) branches.push({ when: api.ids.loading, el: loading })
  if (error) branches.push({ when: api.ids.error, el: error })
  if (empty) branches.push({ when: null, el: empty })
  return { name: 'ListEmptyComponent', value: { kind: 'cond', branches } }
}
