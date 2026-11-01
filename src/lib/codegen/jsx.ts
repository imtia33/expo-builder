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

export type JsxChild = { kind: 'element'; el: JsxElement } | { kind: 'text'; text: string }

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
  // The value's true start column is just past `name={`; its break layout
  // (body at col+2, closing at col) shares the attribute line's indent.
  return `${a.name}={${printValue(a.value.value, col + a.name.length + 2, col)}}`
}

/** Render `element` at column `col`; returns fully indented lines. */
export function renderElement(element: JsxElement, col: number): string[] {
  const { tag, attrs } = element
  const textParts = element.children.filter((c): c is Extract<JsxChild, { kind: 'text' }> => c.kind === 'text')
  const text = textParts.length > 0 ? textParts.map((t) => t.text).join(' ') : null
  const childEls = element.children.filter((c): c is Extract<JsxChild, { kind: 'element' }> => c.kind === 'element')
  const hasText = text !== null && text.length > 0
  const selfClose = !hasText && childEls.length === 0

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
  const openSingle = singleUsable ? `<${tag}${attrs.length > 0 ? ` ${attrSingle.join(' ')}` : ''}` : ''

  const textInline = (t: string): string => (rawTextSafe(t) ? t : `{${jsStringLiteral(t)}}`)

  // Attempt 2 (no element children): the entire element on one line.
  if (childEls.length === 0 && singleUsable) {
    const single = selfClose ? `${openSingle} />` : `${openSingle}>${text ? textInline(text) : ''}</${tag}>`
    if (col + single.length <= MAX_WIDTH) return [`${' '.repeat(col)}${single}`]
  }

  const pad = ' '.repeat(col)
  const lines: string[] = []

  // Opening: inline attributes when the opening line fits, else one per line.
  if (singleUsable && col + openSingle.length + (selfClose ? 3 : 1) <= MAX_WIDTH) {
    lines.push(pad + openSingle + (selfClose ? ' />' : '>'))
  } else {
    lines.push(pad + `<${tag}`)
    for (const a of attrs) lines.push(`${' '.repeat(col + 2)}${renderAttr(a, col + 2)}`)
    lines.push(pad + (selfClose ? '/>' : '>'))
  }

  if (hasText) lines.push(`${' '.repeat(col + 2)}${textInline(text)}`)
  for (const c of childEls) lines.push(...renderElement(c.el, col + 2))
  if (!selfClose) lines.push(pad + `</${tag}>`)
  return lines
}
