/*
 * Tiny JSX IR + renderer shared by the screen emitter and the navigation
 * layout emitters. Rendering rules (Prettier-like, deterministic):
 *   - try the whole opening tag on one line; break one attribute per line
 *     when it does not fit at 80 columns;
 *   - an element with element children always breaks across lines (children
 *     indented +2); text-only children stay inline when the full element
 *     fits on one line;
 *   - childless elements self-close (`<View ... />`).
 */

import { jsStringLiteral, MAX_WIDTH, printValue } from './format'

export interface JsxAttr {
  name: string
  value: AttrValue
}

export type AttrValue =
  /** Emitted as a double-quoted JSX attribute (`name="home"`), or `name={'…'}`
   *  when the string contains characters unsafe in an attribute. */
  | { kind: 'string'; value: string }
  /** Any JS value rendered inside `name={…}` via printValue (numbers, booleans,
   *  objects, arrays, RawCode). */
  | { kind: 'raw'; value: unknown }
  /** A JSX ELEMENT in parens: `name={(<View …/>)}` — used for element-typed
   *  props such as ListHeaderComponent (Phase 2 lists). */
  | { kind: 'jsx'; value: JsxElement }
  /** An arrow function with destructured params returning an element:
   *  `name={({ item }) => (<View…/>)}` — renderItem / renderSectionHeader. */
  | { kind: 'arrow'; params: string; value: JsxElement }

export type JsxChild =
  | { kind: 'element'; el: JsxElement }
  | { kind: 'text'; text: string }
  | { kind: 'expr'; code: string }

/** Tag constant for a Fragment (`<>…</>`): multiple item-template children
 *  of a list render inside one fragment (Phase 2). */
export const FRAGMENT = ''

export interface JsxElement {
  tag: string
  attrs: JsxAttr[]
  children: JsxChild[]
}

export function el(tag: string, attrs: JsxAttr[] = [], children: JsxChild[] = []): JsxElement {
  return { tag, attrs, children }
}

export function elChild(el: JsxElement): JsxChild {
  return { kind: 'element', el }
}

export function textChild(text: string): JsxChild {
  return { kind: 'text', text }
}

/** A raw JS expression child: `<Text>{item.title}</Text>` (safe member chains
 *  from list bindings — never arbitrary user code; see lib/lists/bindings). */
export function exprChild(code: string): JsxChild {
  return { kind: 'expr', code }
}

export function styleAttr(style: Record<string, unknown>): JsxAttr {
  return { name: 'style', value: { kind: 'raw', value: style } }
}

function stringAttr(name: string, value: string): JsxAttr {
  return { name, value: { kind: 'string', value } }
}

export { stringAttr }

/** True when the text can be a raw JSX text node (no braces/tags, no trimmed edges). */
function rawTextSafe(s: string): boolean {
  return s.length > 0 && !/[{}<>\n]/.test(s) && s === s.trim()
}

function renderAttr(a: JsxAttr, col: number): string {
  if (a.value.kind === 'string') {
    const v = a.value.value
    if (/[{}<>"]|\n/.test(v)) return `${a.name}={${jsStringLiteral(v)}}`
    return `${a.name}="${v}"`
  }
  if (a.value.kind === 'jsx') {
    // `name={({ ... })}` with the body on its own lines — element-typed props
    // (ListHeaderComponent & friends, Phase 2). The returned string embeds its
    // own newlines, so the caller demotes the open tag to one-attr-per-line
    // and the indent stays absolute.
    const bodyCol = col + 2
    // renderElement returns lines already carrying their own absolute indent —
    // join with plain newlines (no extra padding).
    const body = renderElement(a.value.value, bodyCol).join('\n')
    return `${a.name}={(${'\n'}${body}${'\n'}${' '.repeat(col)})}`
  }
  if (a.value.kind === 'arrow') {
    // `name={(params) => (\n<body>\ncol)}` — renderItem / renderSectionHeader.
    const bodyCol = col + 2
    const body = renderElement(a.value.value, bodyCol).join('\n')
    return `${a.name}={(${a.value.params}) => (${'\n'}${body}${'\n'}${' '.repeat(col)})}`
  }
  // The value's true start column is just past `name={`; its break layout
  // (body at col+2, closing at col) shares the attribute line's indent.
  return `${a.name}={${printValue(a.value.value, col + a.name.length + 2, col)}}`
}

/** Render `element` at column `col`; returns fully indented lines. */
export function renderElement(element: JsxElement, col: number): string[] {
  const { tag, attrs } = element
  const isFragment = tag === FRAGMENT
  const open = isFragment ? '<>' : `<${tag}`
  const close = isFragment ? '</>' : `</${tag}>`
  const textParts = element.children.filter((c): c is Extract<JsxChild, { kind: 'text' }> => c.kind === 'text')
  const text = textParts.length > 0 ? textParts.map((t) => t.text).join(' ') : null
  const childEls = element.children.filter((c): c is Extract<JsxChild, { kind: 'element' }> => c.kind === 'element')
  const hasText = text !== null && text.length > 0
  const hasExpr = element.children.some((c) => c.kind === 'expr')
  // Fragments never self-close; expr-only children (a bound Text) also keep an
  // open/close pair: `<Text>{item.title}</Text>`.
  const selfClose = !isFragment && !hasText && !hasExpr && childEls.length === 0

  // Attempt 1: all attributes on the opening line.
  const attrSingle: string[] = []
  let singleUsable = true
  let pos = col + tag.length + 2
  for (const a of attrs) {
    const s = renderAttr(a, pos)
    if (s.includes('\n')) {
      singleUsable = false
      break
    }
    attrSingle.push(s)
    pos += s.length + 1
  }
  const openSingle = singleUsable ? `${open}${attrs.length > 0 ? ` ${attrSingle.join(' ')}` : ''}` : ''

  const textInline = (t: string): string => (rawTextSafe(t) ? t : `{${jsStringLiteral(t)}}`)

  // Attempt 2 (no element children, no expressions): the entire element on one line.
  if (childEls.length === 0 && !hasExpr && singleUsable) {
    const inner = text ? textInline(text) : ''
    const single = selfClose ? `${openSingle} />` : `${openSingle}${isFragment ? '' : '>'}${inner}${close}`
    if (col + single.length <= MAX_WIDTH) return [`${' '.repeat(col)}${single}`]
  }

  const pad = ' '.repeat(col)
  const lines: string[] = []

  // Opening: inline attributes when the opening line fits, else one per line.
  if (singleUsable && col + openSingle.length + (selfClose ? 3 : 1) <= MAX_WIDTH) {
    lines.push(pad + openSingle + (selfClose ? ' />' : isFragment ? '' : '>'))
  } else {
    lines.push(pad + open)
    for (const a of attrs) lines.push(`${' '.repeat(col + 2)}${renderAttr(a, col + 2)}`)
    lines.push(pad + (selfClose ? '/>' : isFragment ? '' : '>'))
  }

  if (hasText) lines.push(`${' '.repeat(col + 2)}${textInline(text)}`)
  for (const c of element.children) {
    if (c.kind === 'element') lines.push(...renderElement(c.el, col + 2))
    else if (c.kind === 'expr') lines.push(`${' '.repeat(col + 2)}{${c.code}}`)
  }
  if (!selfClose) lines.push(pad + close)
  return lines
}
