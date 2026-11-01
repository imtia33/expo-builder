'use client'
/*
 * Node edit gestures — move & resize wiring for the DOM canvas (edit mode).
 *
 * One drag = ONE undo entry: beginGesture at pointerdown, live setNodeStyle
 * per pointermove (the store coalesces commits inside a gesture), endGesture
 * at pointerup/cancel. Snapping (docs/03 §3.9 semantics: edges + centers vs
 * container + siblings, best-per-axis, Alt disables) runs on every move and
 * publishes magenta guide lines for the overlay to render.
 *
 * Move starts on the artboard's edit pane (pointerdown resolves the node via
 * elementAtPoint); resize starts on the overlay's handles. Both use pointer
 * capture on the element that received pointerdown.
 */

import { useCallback, useRef, useState } from 'react'

import { getEntry } from '@/expoforge/registry'
import { useProjectStore } from '@/lib/project/store'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import type { ProjectNode } from '@/lib/project/types'

import {
  coordinateParentOf,
  elementAtPoint,
  nodeElementWithin,
  nodeIdOf,
  nodeSelector
} from './element-at-point'
import { measureAgainst, measureInArtboard, type NodeMeasure } from './measure'
import {
  ALL_LINES,
  collectSnapTargets,
  snapRect,
  SNAP_TOLERANCE_SCREEN_PX,
  type SnapGuides,
  type SnapLineSet,
  type SnapTargets
} from './snap'

export type ResizeHandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Minimum resize size in dp (open-pencil-style floor). */
export const MIN_NODE_SIZE = 8

interface MoveDrag {
  kind: 'move'
  pointerId: number
  nodeId: string
  startX: number
  startY: number
  base: NodeMeasure
  targets: SnapTargets | null
  /** The coordinate parent's origin in ARTBOARD-local dp (guide space fix). */
  parentOrigin: NodeMeasure
}

interface ResizeDrag {
  kind: 'resize'
  pointerId: number
  nodeId: string
  handle: ResizeHandleId
  startX: number
  startY: number
  base: NodeMeasure
  hasExplicitHeight: boolean
  targets: SnapTargets | null
  /** The coordinate parent's origin in ARTBOARD-local dp (guide space fix). */
  parentOrigin: NodeMeasure
}

type Drag = MoveDrag | ResizeDrag

/** Live size readout during a resize (dp), for the overlay's size pill. */
export interface ResizeLive {
  width: number
  /** null when the node's height is content-sized (horizontal handles only). */
  height: number | null
}

/** Active inline text-editing session (double-click on a text node). */
export interface TextEditSession {
  screenId: string
  nodeId: string
}

export interface UseNodeEditOptions {
  screenId: string
  artboardRef: React.RefObject<HTMLElement | null>
  /** True while the hand tool or Space makes the canvas pan instead of edit. */
  panActive: () => boolean
}

function hasGuides(guides: { v: unknown[]; h: unknown[] } | null): boolean {
  return !!guides && (guides.v.length > 0 || guides.h.length > 0)
}

/**
 * Convert parent-local snap guides to ARTBOARD-local dp (docs/12 §1.2 #3).
 * `snapRect` works in the coordinate parent's space; the overlay renders in
 * artboard space — before this fix, guides inside nested containers shifted
 * by the parent's offset and appeared outside the container.
 */
function toArtboardSpace(guides: SnapGuides, parentOrigin: NodeMeasure): SnapGuides {
  return {
    v: guides.v.map((g) => ({ pos: g.pos + parentOrigin.left, from: g.from + parentOrigin.top, to: g.to + parentOrigin.top })),
    h: guides.h.map((g) => ({ pos: g.pos + parentOrigin.top, from: g.from + parentOrigin.left, to: g.to + parentOrigin.left }))
  }
}

/** A node whose registry entry exposes a 'text'-typed prop (JSX children). */
function isTextContentNode(node: ProjectNode): boolean {
  const entry = getEntry(node.type)
  return !!entry && entry.props.some((p) => p.type === 'text')
}

function handleLines(handle: ResizeHandleId): SnapLineSet {
  const x: Array<'l' | 'c' | 'r'> = []
  const y: Array<'t' | 'c' | 'b'> = []
  if (handle.includes('e')) x.push('r')
  if (handle.includes('w')) x.push('l')
  if (handle.includes('s')) y.push('b')
  if (handle.includes('n')) y.push('t')
  return { x, y }
}

function applyResize(
  base: NodeMeasure,
  handle: ResizeHandleId,
  dx: number,
  dy: number
): { left: number; top: number; width: number; height: number } {
  let { left, top, width, height } = base
  if (handle.includes('e')) width = base.width + dx
  if (handle.includes('w')) {
    left = base.left + dx
    width = base.width - dx
  }
  if (handle.includes('s')) height = base.height + dy
  if (handle.includes('n')) {
    top = base.top + dy
    height = base.height - dy
  }
  return { left, top, width, height }
}

/**
 * Node manipulation for one artboard. Returns the edit pane's event props,
 * a handle-pointerdown callback for the overlay, and transient gesture
 * visuals (snap guides, live resize size) for the overlay to render.
 */
export function useNodeEdit({ screenId, artboardRef, panActive }: UseNodeEditOptions) {
  const drag = useRef<Drag | null>(null)
  const [guides, setGuidesState] = useState<SnapGuides | null>(null)
  const [resizeLive, setResizeLive] = useState<ResizeLive | null>(null)
  const [editing, setEditing] = useState<TextEditSession | null>(null)

  const setGuides = useCallback((next: SnapGuides | null) => {
    setGuidesState(hasGuides(next) ? next : null)
  }, [])

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      drag.current = null
      useProjectStore.getState().endGesture(e.pointerId)
      setGuides(null)
      setResizeLive(null)
    },
    [setGuides]
  )

  /* ── move gesture (edit pane) ─────────────────────────────────────── */

  const onPanePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || panActive()) return
      const artboardEl = artboardRef.current
      if (!artboardEl) return
      const store = useProjectStore.getState()
      if (store.sim.on) return

      // The pane itself is see-through for this resolution.
      const hit = elementAtPoint(e.clientX, e.clientY)
      const nodeEl = nodeElementWithin(hit, artboardEl)
      // Never let the click reach the frame's screen-drag handler below.
      e.stopPropagation()

      if (!nodeEl) {
        store.select({ kind: 'screen', screenId })
        store.setActiveScreen(screenId)
        return
      }

      const nodeId = nodeIdOf(nodeEl)
      const node = nodeId ? store.data.nodes[nodeId] : undefined
      if (!nodeId || !node) return
      store.select({ kind: 'node', nodeId, screenId })
      store.setActiveScreen(screenId)

      // Flow-positioned and locked nodes select but never drag (the hint chip
      // in the overlay explains; no silent auto-conversion).
      if (node.locked || node.style.position !== 'absolute') return

      const parent = coordinateParentOf(nodeEl, artboardEl)
      if (!parent) return
      // One gesture per pointer: a second pointerdown while a drag is active
      // (palm/stylus) must never stack another gesture — the leaked counter
      // used to swallow every later commit into one undo entry (docs/12 §1.2).
      if (drag.current) return
      store.beginGesture(e.pointerId)
      drag.current = {
        kind: 'move',
        pointerId: e.pointerId,
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        base: measureAgainst(parent.el, nodeEl),
        targets: collectSnapTargets(parent.el, nodeEl),
        parentOrigin: measureInArtboard(artboardEl, parent.el)
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [artboardRef, panActive, screenId]
  )

  const onPanePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.kind !== 'move' || d.pointerId !== e.pointerId) return
      const { zoom } = useCanvasViewport.getState()
      const store = useProjectStore.getState()
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom
      let left = d.base.left + dx
      let top = d.base.top + dy
      let nextGuides: SnapGuides | null = null
      if (!e.altKey && d.targets) {
        const res = snapRect(
          { left, top, width: d.base.width, height: d.base.height },
          ALL_LINES,
          d.targets,
          SNAP_TOLERANCE_SCREEN_PX / zoom
        )
        left += res.dx
        top += res.dy
        nextGuides = toArtboardSpace({ v: res.vGuides, h: res.hGuides }, d.parentOrigin)
      }
      store.setNodeStyle(d.nodeId, { left: Math.round(left), top: Math.round(top) })
      setGuides(nextGuides)
    },
    [setGuides]
  )

  /* ── resize gesture (overlay handles) ─────────────────────────────── */

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, handle: ResizeHandleId, nodeId: string) => {
      if (e.button !== 0 || panActive()) return
      const artboardEl = artboardRef.current
      if (!artboardEl) return
      const store = useProjectStore.getState()
      const node = store.data.nodes[nodeId]
      const nodeEl = artboardEl.querySelector<HTMLElement>(nodeSelector(nodeId))
      if (!node || !nodeEl || node.locked || node.style.position !== 'absolute') return
      const parent = coordinateParentOf(nodeEl, artboardEl)
      if (!parent) return

      e.stopPropagation()
      // One gesture per pointer (see onPanePointerDown).
      if (drag.current) return
      store.beginGesture(e.pointerId)
      drag.current = {
        kind: 'resize',
        pointerId: e.pointerId,
        nodeId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        base: measureAgainst(parent.el, nodeEl),
        hasExplicitHeight: typeof node.style.height === 'number',
        targets: collectSnapTargets(parent.el, nodeEl),
        parentOrigin: measureInArtboard(artboardEl, parent.el)
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [artboardRef, panActive]
  )

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.kind !== 'resize' || d.pointerId !== e.pointerId) return
      const { zoom } = useCanvasViewport.getState()
      const store = useProjectStore.getState()
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom

      let { left, top, width, height } = applyResize(d.base, d.handle, dx, dy)
      let nextGuides: SnapGuides | null = null
      if (!e.altKey && d.targets) {
        const res = snapRect(
          { left, top, width, height: d.hasExplicitHeight ? height : d.base.height },
          handleLines(d.handle),
          d.targets,
          SNAP_TOLERANCE_SCREEN_PX / zoom
        )
        if (res.dx !== 0) {
          if (d.handle.includes('e')) width += res.dx
          else {
            left += res.dx
            width -= res.dx
          }
        }
        if (res.dy !== 0 && d.hasExplicitHeight) {
          if (d.handle.includes('s')) height += res.dy
          else {
            top += res.dy
            height -= res.dy
          }
        }
        nextGuides = toArtboardSpace({ v: res.vGuides, h: res.hGuides }, d.parentOrigin)
      }

      // Minimum size keeps the opposite edge anchored.
      if (width < MIN_NODE_SIZE) {
        width = MIN_NODE_SIZE
        if (d.handle.includes('w')) left = d.base.left + d.base.width - MIN_NODE_SIZE
      }
      if (d.hasExplicitHeight && height < MIN_NODE_SIZE) {
        height = MIN_NODE_SIZE
        if (d.handle.includes('n')) top = d.base.top + d.base.height - MIN_NODE_SIZE
      }

      const patch: Record<string, unknown> = {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width)
      }
      if (d.hasExplicitHeight) patch.height = Math.round(height)
      store.setNodeStyle(d.nodeId, patch)
      setGuides(nextGuides)
      setResizeLive({ width: Math.round(width), height: d.hasExplicitHeight ? Math.round(height) : null })
    },
    [setGuides]
  )

  /* ── double-click: inline text edit (text nodes) / drill-in (containers) ── */

  const onPaneDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panActive()) return
      const artboardEl = artboardRef.current
      if (!artboardEl) return
      e.stopPropagation()
      const store = useProjectStore.getState()
      const selectScreen = () => {
        store.select({ kind: 'screen', screenId })
        store.setActiveScreen(screenId)
      }

      const hit = elementAtPoint(e.clientX, e.clientY)
      const nodeEl = nodeElementWithin(hit, artboardEl)
      if (!nodeEl) {
        selectScreen()
        return
      }
      const nodeId = nodeIdOf(nodeEl)
      const node = nodeId ? store.data.nodes[nodeId] : undefined
      if (!nodeId || !node) {
        selectScreen()
        return
      }
      // Text-content nodes open INLINE TEXT EDITING (spec §4); every other
      // node keeps the drill-in-to-parent behavior.
      if (isTextContentNode(node)) {
        setEditing({ screenId, nodeId })
        return
      }
      if (node.parentId && store.data.nodes[node.parentId]) {
        store.select({ kind: 'node', nodeId: node.parentId, screenId })
        store.setActiveScreen(screenId)
        return
      }
      selectScreen()
    },
    [artboardRef, panActive, screenId]
  )

  return {
    /** Props for the artboard's edit pane element. */
    paneProps: {
      onPointerDown: onPanePointerDown,
      onPointerMove: onPanePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: onPaneDoubleClick
    },
    /** Pointerdown handler for a resize handle (overlay). */
    onHandlePointerDown,
    /** Shared pointermove/up for handle elements (they capture the pointer). */
    handleMoveProps: {
      onPointerMove: onHandlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag
    },
    /** Active snap guides (magenta lines) — rendered by the overlay. */
    guides,
    /** Live size during a resize — rendered by the overlay's size pill. */
    resizeLive,
    /** Active inline text-edit session (double-clicked text node). */
    editing,
    /** Close the inline text-edit session (after commit/cancel). */
    setEditing
  }
}
