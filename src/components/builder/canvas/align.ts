'use client'
/*
 * Align-in-parent actions (Phase 1, open-pencil PositionSection parity):
 * align the selected absolute node to its coordinate parent's bounds —
 * left / center-h / right / top / middle-v / bottom. Figma semantics for a
 * single selection: alignment applies to the PARENT (container) edges, not
 * to siblings (multi-select distribute/align needs a multi-selection model
 * the builder does not have — deliberately not faked).
 *
 * Geometry is DOM-truth (measureAgainst + offsetWidth/Height, which CSS
 * transforms never touch), then written back through the same setNodeStyle
 * action the drag gestures use — one commit = one undo entry.
 */

import { useProjectStore } from '@/lib/project/store'

import { artboardElementOf, coordinateParentOf, nodeSelector } from './element-at-point'
import { measureAgainst } from './measure'

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom'

/**
 * Align one node inside its coordinate parent. Returns false (no-op) when the
 * node is missing, not rendered, locked, or not absolute-positioned.
 */
export function alignNodeInParent(nodeId: string, mode: AlignMode): boolean {
  const store = useProjectStore.getState()
  const node = store.data.nodes[nodeId]
  if (!node || node.locked || node.style.position !== 'absolute') return false

  const el = document.querySelector<HTMLElement>(nodeSelector(nodeId))
  if (!el) return false
  const artboardEl = artboardElementOf(el)
  if (!artboardEl) return false
  const parent = coordinateParentOf(el, artboardEl)
  if (!parent) return false

  const m = measureAgainst(parent.el, el)
  // offsetWidth/Height are LAYOUT sizes in dp — the pan/zoom transform on an
  // ancestor never affects them, so no zoom division is needed here.
  const parentW = parent.el.offsetWidth
  const parentH = parent.el.offsetHeight

  let left = m.left
  let top = m.top
  switch (mode) {
    case 'left':
      left = 0
      break
    case 'centerH':
      left = Math.round((parentW - m.width) / 2)
      break
    case 'right':
      left = Math.round(parentW - m.width)
      break
    case 'top':
      top = 0
      break
    case 'middleV':
      top = Math.round((parentH - m.height) / 2)
      break
    case 'bottom':
      top = Math.round(parentH - m.height)
      break
  }

  store.setNodeStyle(nodeId, { left, top })
  return true
}
