'use client'
/*
 * Snapping — open-pencil snap-guide semantics, adapted to the ExpoForge DOM
 * canvas (docs/03-design.md §3.9). While a node is moved or resized, its
 * left/center/right × top/center/bottom lines are matched against the
 * container's edges/centers and every sibling's edges/centers; the nearest
 * match per axis within the tolerance wins and magenta 1px guide lines span
 * the common extent of the moving rect and the matched target. Holding Alt
 * disables snapping entirely (callers check before applying).
 */

import { NODE_DOM_ATTR } from '@/expoforge/preview'

import { measureAgainst } from './measure'

/** Snap tolerance in SCREEN px (Figma-calibrated); converted per-zoom by callers. */
export const SNAP_TOLERANCE_SCREEN_PX = 6

/** One candidate line: position + the extent of its owning rect (for guide span). */
export interface SnapTargetLine {
  pos: number
  from: number
  to: number
}

export interface SnapTargets {
  /** Vertical lines (x positions). */
  v: SnapTargetLine[]
  /** Horizontal lines (y positions). */
  h: SnapTargetLine[]
}

export interface SnapGuide {
  pos: number
  from: number
  to: number
}

/** The guides for one gesture: vertical lines (x) + horizontal lines (y). */
export interface SnapGuides {
  v: SnapGuide[]
  h: SnapGuide[]
}

export interface SnapResult {
  dx: number
  dy: number
  vGuides: SnapGuide[]
  hGuides: SnapGuide[]
}

/** Which of the moving rect's lines participate (move: all; resize: dragged edges). */
export type SnapLineSet = { x: Array<'l' | 'c' | 'r'>; y: Array<'t' | 'c' | 'b'> }

const ALL_LINES: SnapLineSet = { x: ['l', 'c', 'r'], y: ['t', 'c', 'b'] }
export { ALL_LINES }

/**
 * Best snap per axis. `moving` is the candidate rect (post-drag math), in the
 * container's local dp space; `threshold` is the max distance in the same
 * units. Ties (targets at the same position) all emit guides.
 */
export function snapRect(
  moving: { left: number; top: number; width: number; height: number },
  lines: SnapLineSet,
  targets: SnapTargets,
  threshold: number
): SnapResult {
  const mx: Record<'l' | 'c' | 'r', number> = {
    l: moving.left,
    c: moving.left + moving.width / 2,
    r: moving.left + moving.width
  }
  const my: Record<'t' | 'c' | 'b', number> = {
    t: moving.top,
    c: moving.top + moving.height / 2,
    b: moving.top + moving.height
  }

  const axis = (
    active: Array<'l' | 'c' | 'r'> | Array<'t' | 'c' | 'b'>,
    movingLines: Record<string, number>,
    targetLines: SnapTargetLine[],
    movingFrom: number,
    movingTo: number
  ): { delta: number; guides: SnapGuide[] } => {
    let bestDelta = 0
    let bestAbs = Infinity
    for (const line of active) {
      const pos = movingLines[line]
      for (const t of targetLines) {
        const delta = t.pos - pos
        const abs = Math.abs(delta)
        if (abs <= threshold && abs < bestAbs - 1e-6) {
          bestAbs = abs
          bestDelta = delta
        }
      }
    }
    if (bestAbs === Infinity) return { delta: 0, guides: [] }
    // Every target line sitting exactly at the snapped position emits a guide.
    const guides: SnapGuide[] = []
    for (const line of active) {
      const snapped = movingLines[line] + bestDelta
      for (const t of targetLines) {
        if (Math.abs(t.pos - snapped) < 0.01 && !guides.some((g) => Math.abs(g.pos - t.pos) < 0.01)) {
          guides.push({
            pos: t.pos,
            from: Math.min(movingFrom, t.from),
            to: Math.max(movingTo, t.to)
          })
        }
      }
    }
    return { delta: bestDelta, guides }
  }

  const x = axis(lines.x, mx, targets.v, moving.top, moving.top + moving.height)
  const y = axis(lines.y, my, targets.h, moving.left, moving.left + moving.width)
  return { dx: x.delta, dy: y.delta, vGuides: x.guides, hGuides: y.guides }
}

/** True when `el` is a node element whose nearest node ancestor is `containerEl`. */
function isDirectNodeChild(el: HTMLElement, containerEl: HTMLElement): boolean {
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== containerEl) {
    if (cur.getAttribute(NODE_DOM_ATTR)) return false
    cur = cur.parentElement
  }
  return cur === containerEl
}

/**
 * Collect snap targets for a node that lives in `containerEl` (a node element
 * or the screen content wrapper): the container's own edges + centers, plus
 * every direct node child's edges + centers (excluding the moving element).
 * Rects are measured from the live DOM in container-local dp units.
 */
export function collectSnapTargets(containerEl: HTMLElement, excludeEl: HTMLElement | null): SnapTargets {
  const size = measureAgainst(containerEl, containerEl)
  const v: SnapTargetLine[] = [
    { pos: 0, from: 0, to: size.height },
    { pos: size.width / 2, from: 0, to: size.height },
    { pos: size.width, from: 0, to: size.height }
  ]
  const h: SnapTargetLine[] = [
    { pos: 0, from: 0, to: size.width },
    { pos: size.height / 2, from: 0, to: size.width },
    { pos: size.height, from: 0, to: size.width }
  ]

  const descendants = containerEl.querySelectorAll<HTMLElement>(`[${NODE_DOM_ATTR}]`)
  for (const el of descendants) {
    if (el === excludeEl) continue
    if (!isDirectNodeChild(el, containerEl)) continue
    const r = measureAgainst(containerEl, el)
    if (r.width <= 0 && r.height <= 0) continue
    v.push(
      { pos: r.left, from: r.top, to: r.top + r.height },
      { pos: r.left + r.width / 2, from: r.top, to: r.top + r.height },
      { pos: r.left + r.width, from: r.top, to: r.top + r.height }
    )
    h.push(
      { pos: r.top, from: r.left, to: r.left + r.width },
      { pos: r.top + r.height / 2, from: r.left, to: r.left + r.width },
      { pos: r.top + r.height, from: r.left, to: r.left + r.width }
    )
  }
  return { v, h }
}
