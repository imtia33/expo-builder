/*
 * Screen state (Phase 4, slice 2) — the ONE resolver for screen-scoped state.
 *
 * Screen.state entries are declared on the Screen tab, written by set-state
 * interaction actions, and read through `{state.<name>}` bindings in text
 * content / button titles. Preview (sim values over initials) and codegen
 * (useState variables) both resolve through THIS module — same rule as list
 * bindings (lib/lists/bindings): one resolver, two consumers, no drift.
 *
 * Safety: names are validated identifiers from a user-controlled allowlist
 * (they become generated-code identifiers). `{state.x}` bindings parse to a
 * single identifier segment — user strings can never become arbitrary code.
 */

import type { Screen, ScreenStateEntry } from '@/lib/project/types'

export type ScreenStateValue = boolean | string | number

/* ────────────────────────────────────────────────────────────────────────────
 * Names — validation + setter derivation
 * ──────────────────────────────────────────────────────────────────────────── */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Identifiers generated code already binds at component scope (router from
 * useRouter, colors from useTheme) plus React module names — state entries
 * must never shadow them.
 */
const BLOCKED_STATE_NAMES = new Set([
  'router',
  'colors',
  'useRouter',
  'useTheme',
  'useState',
  'React',
  'state'
])

export function stateNameOk(name: string): boolean {
  return IDENT.test(name) && !BLOCKED_STATE_NAMES.has(name)
}

/** `busy` → `setBusy` (the useState setter name in generated code). */
export function setterName(name: string): string {
  return `set${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

/** Coerce an initial value to the entry's declared type (never throws). */
export function coerceInitial(type: ScreenStateEntry['type'], value: unknown): ScreenStateValue {
  if (type === 'boolean') return value === true || value === 'true'
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return value === undefined || value === null ? '' : String(value)
}

/** Defensive normalize for store writes: valid identifiers, unique by name. */
export function normalizeStateEntries(raw: unknown): ScreenStateEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ScreenStateEntry[] = []
  for (const v of raw) {
    if (v === null || typeof v !== 'object') continue
    const e = v as Partial<ScreenStateEntry>
    if (typeof e.name !== 'string' || !stateNameOk(e.name) || seen.has(e.name)) continue
    if (e.type !== 'boolean' && e.type !== 'string' && e.type !== 'number') continue
    seen.add(e.name)
    out.push({
      id: typeof e.id === 'string' && e.id !== '' ? e.id : `state-${e.name}`,
      name: e.name,
      type: e.type,
      initial: coerceInitial(e.type, e.initial)
    })
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * {state.<name>} bindings
 * ──────────────────────────────────────────────────────────────────────────── */

const STATE_BINDING_RE = /^\{state\.([A-Za-z_$][A-Za-z0-9_$]*)\}$/

/** Parse a whole-string `{state.x}` binding; null otherwise. */
export function parseStateBinding(text: unknown): { name: string } | null {
  if (typeof text !== 'string') return null
  const m = STATE_BINDING_RE.exec(text.trim())
  return m ? { name: m[1] } : null
}

export function isStateBinding(value: unknown): boolean {
  return parseStateBinding(value) !== null
}

/**
 * PREVIEW substitution: resolved primitive (from the merged sim-values map)
 * → its string value; unknown/unset name → the raw `{state.x}` text — the
 * same honest unresolved signal as item bindings.
 */
export function statePreviewValue(value: unknown, values: Record<string, ScreenStateValue> | undefined): string {
  if (typeof value !== 'string') return value === undefined || value === null ? '' : String(value)
  const parsed = parseStateBinding(value)
  if (parsed) {
    const found = values?.[parsed.name]
    if (found !== undefined) return String(found)
    return value
  }
  return value
}

/**
 * CODEGEN view: `{state.x}` → the bare useState variable `x`. Callers must
 * verify the entry is declared on the relevant screen (usage-gating + the
 * honest-literal fallback for undeclared names).
 */
export function stateExpression(value: unknown): string | null {
  const parsed = parseStateBinding(value)
  return parsed ? parsed.name : null
}

/** The declared entry `name` on a screen (null when absent). */
export function stateEntry(screen: Screen | undefined, name: string): ScreenStateEntry | null {
  if (!screen || !Array.isArray(screen.state)) return null
  return screen.state.find((e) => e.name === name) ?? null
}

/**
 * The EFFECTIVE values for one screen: declared initials overlaid with live
 * sim values (set-state writes). Unknown sim keys (entry deleted mid-sim)
 * are ignored — declared entries always win.
 */
export function resolveStateValues(
  screen: Screen | undefined,
  simValues: Record<string, ScreenStateValue> | undefined
): Record<string, ScreenStateValue> {
  const out: Record<string, ScreenStateValue> = {}
  for (const e of screen?.state ?? []) out[e.name] = e.initial
  if (simValues) for (const e of screen?.state ?? []) if (simValues[e.name] !== undefined) out[e.name] = simValues[e.name]
  return out
}
