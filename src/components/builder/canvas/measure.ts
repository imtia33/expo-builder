'use client'
/*
 * Node measurement — DOM-truth geometry for the selection overlay.
 *
 * The overlay lives INSIDE the pan/zoom transformed layer, so it positions in
 * artboard-local units (dp). A node's rendered rect is measured with
 * getBoundingClientRect against the artboard root and divided by the viewport
 * zoom — both elements share the same transform, so the difference is the
 * local offset scaled by zoom. This is scroll-safe (ScrollView content) and
 * transform-safe (pan/zoom), and reflects what the user actually sees
 * (auto-height Text, flow layouts) rather than the style record.
 *
 * Re-measure triggers: the store `revision` (every committed mutation),
 * `measureTick` (any scroll event captured from RNW ScrollViews + window
 * resize), and selection changes.
 */

import { useEffect, useLayoutEffect, useState } from 'react'

import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { useProjectStore } from '@/lib/project/store'

import { ARTBOARD_ATTR, nodeSelector } from './element-at-point'

export interface NodeMeasure {
  left: number
  top: number
  width: number
  height: number
}

function toLocal(artboardRect: DOMRect, rect: DOMRect, zoom: number): NodeMeasure {
  return {
    left: (rect.left - artboardRect.left) / zoom,
    top: (rect.top - artboardRect.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom
  }
}

/** A node's rendered rect in artboard-local dp units, or null if not rendered. */
export function measureNode(screenId: string, nodeId: string): NodeMeasure | null {
  const artboard = document.querySelector<HTMLElement>(`[${ARTBOARD_ATTR}="${cssEscape(screenId)}"]`)
  if (!artboard) return null
  const nodeEl = artboard.querySelector<HTMLElement>(nodeSelector(nodeId))
  if (!nodeEl) return null
  const zoom = useCanvasViewport.getState().zoom
  return toLocal(artboard.getBoundingClientRect(), nodeEl.getBoundingClientRect(), zoom)
}

/** `el`'s rect in `parentEl`-local dp units (snap targets, placement coords). */
export function measureAgainst(parentEl: HTMLElement, el: HTMLElement): NodeMeasure {
  const zoom = useCanvasViewport.getState().zoom
  return toLocal(parentEl.getBoundingClientRect(), el.getBoundingClientRect(), zoom)
}

/**
 * `el`'s rect in ARTBOARD-local dp — the single coordinate space every
 * overlay/guide consumer renders in (docs/12 §5). Used to convert
 * parent-local snap geometry at publish time.
 */
export function measureInArtboard(artboardEl: HTMLElement, el: HTMLElement): NodeMeasure {
  const zoom = useCanvasViewport.getState().zoom
  return toLocal(artboardEl.getBoundingClientRect(), el.getBoundingClientRect(), zoom)
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/**
 * A monotonically increasing counter bumped by every scroll (captured, so
 * RNW ScrollView containers count) and window resize — cheap change signal
 * for re-measuring overlays.
 */
export function useMeasureTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('scroll', bump, { capture: true, passive: true })
    window.addEventListener('resize', bump)
    return () => {
      window.removeEventListener('scroll', bump, { capture: true })
      window.removeEventListener('resize', bump)
    }
  }, [])
  return tick
}

/**
 * Live measure of one node (typically the selected one). Re-measures on
 * store revision changes (live drags commit per pointermove), scroll and
 * resize ticks. Returns null when the node is not currently rendered.
 */
/* eslint-disable react-hooks/set-state-in-effect -- DOM measurement is the canonical
 * useLayoutEffect case: it must read the JUST-COMMITTED DOM (before paint) and land
 * the result in state, so the overlay never trails the node by a frame. Measuring
 * during render instead would read the previous layout. */
export function useNodeMeasure(screenId: string | null, nodeId: string | null): NodeMeasure | null {
  const revision = useProjectStore((s) => s.revision)
  const tick = useMeasureTick()
  const [rect, setRect] = useState<NodeMeasure | null>(null)

  useLayoutEffect(() => {
    if (!screenId || !nodeId) {
      setRect(null)
      return
    }
    setRect(measureNode(screenId, nodeId))
  }, [screenId, nodeId, revision, tick])

  return rect
}
/* eslint-enable react-hooks/set-state-in-effect */
