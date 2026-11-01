'use client'
/*
 * Hit-testing through the canvas's transparent interaction layers.
 *
 * The DOM canvas stacks transparent hit-layers ABOVE the live react-native-web
 * content so the tree stays inert while editing:
 *   - the per-artboard EDIT PANE (edit mode) — swallows every pointer event;
 *   - the PLACEMENT CAPTURE LAYER (insert tools active) — grabs clicks to
 *     place a screen/component.
 * Both opt out with `data-canvas-hit-through`. `elementAtPoint` disables them
 * for one `document.elementFromPoint` call and restores them, so callers get
 * the element the user actually aims at: a rendered node (carrying the RNW
 * testID → NODE_DOM_ATTR), the artboard chrome, or the bare canvas.
 */

import { NODE_DOM_ATTR } from '@/expoforge/preview'

/** Attribute marking transparent layers that must be see-through for hit-tests. */
export const HIT_THROUGH_ATTR = 'data-canvas-hit-through'

/** Attribute on each artboard's root element (value = screen id). */
export const ARTBOARD_ATTR = 'data-screen-artboard'

/** Attribute on the wrapper around ScreenTreePreview (value = screen id). */
export const CONTENT_ATTR = 'data-screen-content'

/**
 * The element at the viewport point, looking through every
 * `data-canvas-hit-through` layer. Safe to call from inside those layers'
 * own event handlers (pointer events are restored synchronously).
 */
export function elementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const layers = Array.from(document.querySelectorAll<HTMLElement>(`[${HIT_THROUGH_ATTR}]`))
  if (layers.length === 0) {
    return document.elementFromPoint(clientX, clientY) as HTMLElement | null
  }
  const saved = layers.map((el) => el.style.pointerEvents)
  for (const el of layers) el.style.pointerEvents = 'none'
  try {
    return document.elementFromPoint(clientX, clientY) as HTMLElement | null
  } finally {
    for (let i = 0; i < layers.length; i++) layers[i].style.pointerEvents = saved[i]
  }
}

/** CSS attribute selector for a node's DOM element (RNW renders testID → NODE_DOM_ATTR). */
export function nodeSelector(nodeId: string): string {
  return `[${NODE_DOM_ATTR}="${cssEscape(nodeId)}"]`
}

/** The node id a DOM element carries (its RNW testID), if any. */
export function nodeIdOf(el: HTMLElement | null): string | null {
  const id = el?.getAttribute(NODE_DOM_ATTR)
  return id ? id : null
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/** The artboard root element a point/element belongs to, if any. */
export function artboardElementOf(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>(`[${ARTBOARD_ATTR}]`) ?? null
}

/** The screen id an artboard element represents. */
export function screenIdOfArtboard(el: HTMLElement): string {
  return el.getAttribute(ARTBOARD_ATTR) ?? ''
}

/**
 * The nearest node-carrying ancestor (or self) of `el` that stays INSIDE
 * `artboardEl` — stops at the artboard boundary so hits on chrome (status
 * bar, header, tab bar) resolve to null rather than leaking to a neighbor.
 */
export function nodeElementWithin(el: HTMLElement | null, artboardEl: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el
  while (cur && cur !== artboardEl) {
    if (cur.getAttribute(NODE_DOM_ATTR)) return cur
    cur = cur.parentElement
  }
  return null
}

/**
 * The coordinate space a rendered node lives in: the nearest ancestor that is
 * either a node element (nested container) or the screen content wrapper
 * (root-level nodes). This mirrors how RNW positions `position: 'absolute'`
 * children inside the tree, independent of which element received the click.
 */
export type CoordinateParent =
  | { kind: 'root'; el: HTMLElement }
  | { kind: 'node'; el: HTMLElement; nodeId: string }

export function coordinateParentOf(el: HTMLElement, artboardEl: HTMLElement): CoordinateParent | null {
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== artboardEl.parentElement) {
    const nodeId = cur.getAttribute(NODE_DOM_ATTR)
    if (nodeId) return { kind: 'node', el: cur, nodeId }
    if (cur.hasAttribute(CONTENT_ATTR)) return { kind: 'root', el: cur }
    cur = cur.parentElement
  }
  return null
}

/** The content wrapper element of a given artboard (root nodes' coordinate space). */
export function contentElementOf(artboardEl: HTMLElement): HTMLElement | null {
  return artboardEl.querySelector<HTMLElement>(`[${CONTENT_ATTR}]`)
}
