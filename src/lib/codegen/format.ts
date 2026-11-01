/*
 * Formatting primitives for generated code.
 *
 * Locked style (Task 6-B spec, amending docs/06 §6.1 for the builder app tree):
 *   2-space indent · single-quoted JS strings · double-quoted JSX attribute
 *   strings · semicolons · trailing commas in multiline literals · 80-column
 *   single-line/multiline switching (deterministic — regeneration is diff-stable).
 */

export const MAX_WIDTH = 80

/** kebab-case → PascalCase ('sign-in' → 'SignIn'). */
export function pascalFromKebab(input: string): string {
  return input
    .split('-')
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}

/**
 * kebab-case → a valid component identifier. Slugs starting with a digit
 * ('2024-stats') get a 'Screen' prefix so the derived name stays a legal
 * JS identifier (e.g. route '2024-stats' → component Screen2024Stats).
 */
export function identifierFromKebab(input: string): string {
  const p = pascalFromKebab(input)
  return /^[0-9]/.test(p) ? `Screen${p}` : p
}

/** Single-quoted, escaped JS string literal ('It\'s'). */
export function jsStringLiteral(s: string): string {
  let out = "'"
  for (const ch of s) {
    if (ch === '\\') out += '\\\\'
    else if (ch === "'") out += "\\'"
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += ch
  }
  return out + "'"
}

/** Pre-rendered code spliced verbatim into a printed object/array (never re-quoted). */
export class RawCode {
  constructor(readonly code: string) {}
}

export function isRawCode(v: unknown): v is RawCode {
  return v instanceof RawCode
}

/** Object key as emitted: bare identifier when legal, else quoted string. */
function keyLiteral(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : jsStringLiteral(key)
}

/**
 * Print any JS value (style objects, prop objects, arrays).
 *
 * `col` is the true column where the value starts on its line (drives the
 * single-line fit test). `lineIndent` is the indent of the line the value's
 * opening delimiter sits on — when the value breaks across lines, its body
 * lands at lineIndent + 2 and its closing delimiter at lineIndent (Prettier's
 * `{{ … }}` JSX-attribute layout: the delimiters share the line's indent).
 */
export function printValue(v: unknown, col: number, lineIndent: number = col): string {
  if (isRawCode(v)) return v.code
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return jsStringLiteral(v)
  if (Array.isArray(v)) return printArray(v, col, lineIndent)
  if (typeof v === 'object') return printObject(v as Record<string, unknown>, col, lineIndent)
  return 'null'
}

/**
 * `{ a: 1, b: 2 }` or, when too wide, one key per line with trailing commas.
 * Nested values that break force the parent to break (single-line parts must
 * not contain newlines); broken children re-render at their own line indent.
 */
export function printObject(obj: Record<string, unknown>, col: number, lineIndent: number = col): string {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined)
  if (keys.length === 0) return '{}'
  const singleParts = keys.map((k) => `${keyLiteral(k)}: ${printValue(obj[k], col + 2 + k.length + 2, lineIndent + 2)}`)
  if (singleParts.some((p) => p.includes('\n'))) return multilineObject(obj, keys, lineIndent)
  const single = `{ ${singleParts.join(', ')} }`
  if (col + single.length <= MAX_WIDTH) return single
  return multilineObject(obj, keys, lineIndent)
}

function multilineObject(obj: Record<string, unknown>, keys: string[], lineIndent: number): string {
  const body = lineIndent + 2
  const lines = keys.map((k) => `${' '.repeat(body)}${keyLiteral(k)}: ${printValue(obj[k], body + k.length + 2, body)},`)
  return ['{', ...lines, ' '.repeat(lineIndent) + '}'].join('\n')
}

/** `[1, 2]` or, when too wide, one element per line with trailing commas. */
export function printArray(arr: unknown[], col: number, lineIndent: number = col): string {
  if (arr.length === 0) return '[]'
  const singleParts = arr.map((v) => printValue(v, col + 2, lineIndent + 2))
  if (singleParts.some((p) => p.includes('\n'))) return multilineArray(arr, lineIndent)
  const single = `[${singleParts.join(', ')}]`
  if (col + single.length <= MAX_WIDTH) return single
  return multilineArray(arr, lineIndent)
}

function multilineArray(arr: unknown[], lineIndent: number): string {
  const body = lineIndent + 2
  const lines = arr.map((v) => `${' '.repeat(body)}${printValue(v, body, body)},`)
  return ['[', ...lines, ' '.repeat(lineIndent) + ']'].join('\n')
}
