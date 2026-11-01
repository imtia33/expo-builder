/*
 * Registry access for codegen.
 *
 * Primary source: @/expoforge/registry (getEntry) — the live, locked catalog.
 * Fallback: a mirror of the locked registry contract (docs/04 §3 +
 * registry/data/*) for palette entries whose data files have not landed yet.
 * getEntry always wins the moment the real entry exists; the mirror is NOT a
 * fork — it keeps codegen runnable end-to-end while the palette data lands in
 * parallel.
 *
 * Import-form normalization (the one deliberate deviation from
 * `entry.codegen.import` verbatim): `import * as X from 'mod'` + `<X />` is
 * NEVER valid React — the namespace object is not a component type (verified
 * empirically: "Element type is invalid: ... got: object"; it also fails tsc
 * with 'does not have any construct or call signatures'). Registry entries
 * whose locked import line uses the namespace form (expo-linear-gradient — a
 * deviation from docs/04 §3.1, which specifies the named form) are therefore
 * normalized to the equivalent NAMED import of the component symbol, which is
 * the package's real export shape (verified from the published .d.ts).
 */

import { getEntry } from '@/expoforge/registry'
import type { RegistryEntry } from '@/expoforge/registry'

export type CodegenFieldType = 'text' | 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'object'

export interface CodegenField {
  key: string
  type: CodegenFieldType
  default?: unknown
}

/** Codegen view over one registry entry (or fallback mirror entry). */
export interface NormalizedEntry {
  component: string
  /** Special emitter id ('button' | 'divider' | 'lineargradient' | 'blurview'); defaults to the node type. */
  emitter?: string
  importModule: string
  importNamed: string[]
  importDefault?: string
  fields: CodegenField[]
}

/* ────────────────────────────────────────────────────────────────────────────
 * Import line parsing (entry.codegen.import is an exact import line string)
 * ──────────────────────────────────────────────────────────────────────────── */

interface ParsedImport {
  module: string
  named: string[]
  default?: string
  namespace?: string
}

function parseImportLine(line: string): ParsedImport | null {
  const trimmed = line.trim().replace(/;$/, '')
  let m = /^import\s+\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['"]([^'"]+)['"]$/.exec(trimmed)
  if (m) return { module: m[2], named: [], namespace: m[1] }
  m = /^import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*\{(.*)\}\s+from\s+['"]([^'"]+)['"]$/.exec(trimmed)
  if (m) return { module: m[3], named: splitNames(m[2]), default: m[1] }
  m = /^import\s+\{(.*)\}\s+from\s+['"]([^'"]+)['"]$/.exec(trimmed)
  if (m) return { module: m[2], named: splitNames(m[1]) }
  m = /^import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['"]([^'"]+)['"]$/.exec(trimmed)
  if (m) return { module: m[2], named: [], default: m[1] }
  return null
}

function splitNames(body: string): string[] {
  return body
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function normalize(reg: RegistryEntry): NormalizedEntry | null {
  const parsed = parseImportLine(reg.codegen.import)
  if (!parsed) return null // unparseable import line — nothing safe to register
  return {
    component: reg.codegen.component,
    emitter: reg.codegen.emitter,
    importModule: parsed.module,
    // Namespace import lines are normalized to the named form — a module
    // namespace object cannot be a JSX element type (see file header).
    importNamed: parsed.namespace ? [reg.codegen.component] : parsed.named,
    importDefault: parsed.default,
    fields: reg.props.map((p) => ({ key: p.key, type: p.type as CodegenFieldType, default: p.default }))
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fallback mirror — locked registry contract (docs/04 §3 + registry/data/*).
 * Used only while getEntry misses; the live registry always wins.
 * ──────────────────────────────────────────────────────────────────────────── */

function f(key: string, type: CodegenFieldType, def?: unknown): CodegenField {
  return { key, type, ...(def !== undefined ? { default: def } : {}) }
}

function fb(
  component: string,
  module: string,
  fields: CodegenField[],
  emitter?: string,
  form?: 'named' | 'default'
): NormalizedEntry {
  return {
    component,
    importModule: module,
    importNamed: form === 'default' ? [] : [component],
    importDefault: form === 'default' ? component : undefined,
    fields,
    ...(emitter ? { emitter } : {})
  }
}

const FALLBACK: Record<string, NormalizedEntry> = {
  /** Unknown types degrade to a plain View container (children preserved). */
  __unknown: fb('View', 'react-native', []),

  textinput: fb('TextInput', 'react-native', [
    f('value', 'string'),
    f('placeholder', 'string', 'Enter text'),
    f('placeholderTextColor', 'color', '#9CA3AF'),
    f('multiline', 'boolean', false),
    f('maxLength', 'number'),
    f('keyboardType', 'enum', 'default'),
    f('autoCapitalize', 'enum', 'sentences'),
    f('autoCorrect', 'boolean', true),
    f('secureTextEntry', 'boolean', false),
    f('returnKeyType', 'enum'),
    f('editable', 'boolean', true),
  ]),

  button: fb('Pressable', 'react-native', [
    f('title', 'text', 'Button'),
    f('variant', 'enum', 'primary'),
    f('disabled', 'boolean', false),
  ], 'button'),

  image: fb('Image', 'expo-image', [
    f('source', 'string'),
    f('placeholder', 'string'),
    f('contentFit', 'enum', 'cover'),
    f('transition', 'number', 300),
    f('tint', 'color'),
  ]),

  scrollview: fb('ScrollView', 'react-native', [
    f('horizontal', 'boolean', false),
    f('showsScrollIndicator', 'boolean', true),
    f('scrollEnabled', 'boolean', true),
    f('bounces', 'boolean', true),
    f('overScrollMode', 'enum'),
    f('keyboardShouldPersistTaps', 'enum'),
  ]),

  switch: fb('Switch', 'react-native', [
    f('value', 'boolean', false),
    f('disabled', 'boolean', false),
    f('trackColorTrue', 'color'),
    f('trackColorFalse', 'color'),
    f('thumbColor', 'color'),
    f('ios_backgroundColor', 'color'),
  ]),

  activityindicator: fb('ActivityIndicator', 'react-native', [
    f('animating', 'boolean', true),
    f('size', 'enum', 'small'),
    f('color', 'color', '#8E8E93'),
    f('hidesWhenStopped', 'boolean', true),
  ]),

  divider: fb('View', 'react-native', [
    f('axis', 'enum', 'horizontal'),
    f('length', 'string', '100%'),
    f('thickness', 'number', 1),
    f('color', 'color', '#E5E7EB'),
  ], 'divider'),

  lineargradient: fb(
    'LinearGradient',
    'expo-linear-gradient',
    [f('startColor', 'color', '#A855F7'), f('endColor', 'color', '#EC4899'), f('angle', 'number', 45)],
    'lineargradient'
  ),

  blurview: fb('BlurView', 'expo-blur', [f('intensity', 'number', 50), f('tint', 'enum', 'system')], 'blurview'),
}

/**
 * Resolve the codegen view for a component type. Never returns undefined —
 * unknown types degrade to a View container so the tree stays renderable.
 */
export function resolveEntry(type: string): NormalizedEntry {
  const reg = getEntry(type)
  if (reg) {
    const n = normalize(reg)
    if (n) return n
  }
  return FALLBACK[type] ?? FALLBACK.__unknown
}

/** Field default lookup helper (node value ?? registry default). */
export function fieldDefault(entry: NormalizedEntry, key: string): unknown {
  const field = entry.fields.find((x) => x.key === key)
  return field?.default
}
