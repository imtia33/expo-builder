/*
 * List composition + data binding — the shared contract for Phase 2 lists.
 *
 * ONE resolver, TWO consumers (the docs/07 §2 rule): the live preview
 * (src/expoforge/preview) and the code generator (src/lib/codegen) both read
 * bindings through this module, so the canvas and generated code can never
 * drift. Pure functions only — no React, no store; trivially unit-testable.
 *
 * Binding syntax (Figma-style braces, spec §dynamic text):
 *   Text content / Image source inside a list item template may be
 *   `{item.title}`, `{item.address.city}`, or — in a SectionList's section
 *   header template — `{section.header}`. The whole value must be the
 *   binding; anything else is a literal.
 *
 * Safety: a binding is ONLY accepted when it parses as
 *   {root:'item'|'section'} + 1..4 plain identifier segments.
 * It is then emitted as a plain member-chain expression — user strings can
 * never become arbitrary generated code.
 */
import type { ProjectNode } from '@/lib/project/types'

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

export type ListRole = NonNullable<ProjectNode['listRole']>

/** One row of a list's static data source (the array-editor item shape). */
export interface ListItem {
  title?: string
  subtitle?: string
  image?: string
  [key: string]: unknown
}

/** One section of a SectionList's data source. */
export interface ListSection {
  header?: string
  items: ListItem[]
  [key: string]: unknown
}

export const LIST_ENTRY_TYPES: readonly string[] = ['flatlist', 'sectionlist']

export function isListEntryType(type: string): boolean {
  return LIST_ENTRY_TYPES.includes(type)
}

/** The role a list child plays (undefined = 'item', the repeated template). */
export function roleOfNode(node: ProjectNode): ListRole {
  return node.listRole ?? 'item'
}

/** Editor-facing labels for roles (tree secondary text + inspector select). */
export const LIST_ROLE_LABEL: Record<ListRole, string> = {
  item: 'Item template',
  header: 'Header',
  footer: 'Footer',
  separator: 'Separator',
  empty: 'Empty state'
}

/* ────────────────────────────────────────────────────────────────────────────
 * Binding parsing + resolution
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ParsedBinding {
  root: 'item' | 'section'
  path: string[]
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const BINDING_RE = /^\{(item|section)((?:\.[A-Za-z_$][A-Za-z0-9_$]*)+)\}$/

/** Parse a whole-string `{item.x.y}` / `{section.x}` binding; null otherwise. */
export function parseItemBinding(text: unknown): ParsedBinding | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  const m = BINDING_RE.exec(trimmed)
  if (!m) return null
  const path = m[2].slice(1).split('.').filter((s) => s.length > 0)
  if (path.length === 0 || path.length > 4) return null
  if (!path.every((seg) => IDENT.test(seg))) return null
  return { root: m[1] as 'item' | 'section', path }
}

/** Walk an object chain; undefined as soon as a link is missing/not an object. */
export function lookupPath(data: unknown, path: string[]): unknown {
  let cur: unknown = data
  for (const seg of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/**
 * PREVIEW substitution for a possibly-bound value against one data row.
 *  - safe binding + resolvable primitive field (string/number/boolean) → the
 *    field's value (stringified)
 *  - safe binding + missing or non-primitive field (object/array) → the raw
 *    text (`{item.title}`) — an honest, visible signal the data has no such
 *    usable field
 *  - anything else → the literal string as-is
 */
export function bindingPreviewValue(value: unknown, data: unknown): string {
  if (typeof value !== 'string') return value === undefined || value === null ? '' : String(value)
  const parsed = parseItemBinding(value)
  if (parsed) {
    const found = lookupPath(data, parsed.path)
    if (found !== undefined && (typeof found === 'string' || typeof found === 'number' || typeof found === 'boolean')) {
      return String(found)
    }
    return value
  }
  return value
}

/**
 * CODEGEN view of the same value: the JS member-chain expression when the
 * value is a safe binding (`item.title` → `item.title`), else null (emit as
 * literal text). The expression is built ONLY from validated identifier
 * segments — never from the raw user string.
 */
export function bindingExpression(value: unknown): string | null {
  const parsed = parseItemBinding(value)
  if (!parsed) return null
  return `${parsed.root}.${parsed.path.join('.')}`
}

/** True when the value is a safe `{…}` binding (display: chips, placeholders). */
export function isItemBinding(value: unknown): boolean {
  return parseItemBinding(value) !== null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Data source coercion (props are `unknown` — be forgiving, never throw)
 * ──────────────────────────────────────────────────────────────────────────── */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asStringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** Coerce one array-editor row to a ListItem (unknown keys dropped). */
function coerceItem(v: unknown): ListItem | null {
  const rec = asRecord(v)
  if (!rec) return null
  const out: ListItem = {}
  const title = asStringOrUndef(rec.title)
  if (title !== undefined) out.title = title
  const subtitle = asStringOrUndef(rec.subtitle)
  if (subtitle !== undefined) out.subtitle = subtitle
  const image = asStringOrUndef(rec.image)
  if (image !== undefined) out.image = image
  return out
}

/** The flatlist data source: props.data coerced to rows (empty when unset). */
export function listItems(props: Record<string, unknown>): ListItem[] {
  const raw = props.data
  if (!Array.isArray(raw)) return []
  const out: ListItem[] = []
  for (const row of raw) {
    const item = coerceItem(row)
    if (item) out.push(item)
  }
  return out
}

/** The sectionlist data source: props.sections coerced (items always arrays). */
export function listSections(props: Record<string, unknown>): ListSection[] {
  const raw = props.sections
  if (!Array.isArray(raw)) return []
  const out: ListSection[] = []
  for (const row of raw) {
    const rec = asRecord(row)
    if (!rec) continue
    const section: ListSection = { items: [] }
    const header = asStringOrUndef(rec.header)
    if (header !== undefined) section.header = header
    if (Array.isArray(rec.items)) {
      for (const it of rec.items) {
        const item = coerceItem(it)
        if (item) section.items.push(item)
      }
    }
    out.push(section)
  }
  return out
}

/**
 * Data literal for codegen: only non-empty fields, in canonical key order
 * (title, subtitle, image) — the same shape the array editor writes.
 */
export function itemLiteral(item: ListItem): Record<string, string> {
  const out: Record<string, string> = {}
  if (item.title !== undefined) out.title = item.title
  if (item.subtitle !== undefined) out.subtitle = item.subtitle
  if (item.image !== undefined) out.image = item.image
  return out
}
