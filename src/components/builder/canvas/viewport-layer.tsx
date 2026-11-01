'use client'
/*
 * ViewportLayer — the pan/zoom composition root of the v3 DOM canvas.
 *
 * RENDERING ARCHITECTURE (the v3 decision — see canvas-host.tsx for the full
 * rationale): the DOM stays the scene graph. This layer renders the artboard
 * subtree and applies pan/zoom as a composited CSS transform, written
 * IMPERATIVELY — the component never re-renders for viewport changes:
 *
 *   - It holds no viewport state. A `useCanvasViewport.subscribe(...)` effect
 *     (NOT a hook selector) schedules one `requestAnimationFrame` batch
 *     (src/lib/canvas/raf-scheduler.ts) which writes
 *     `style.transform = translate(pan) scale(zoom)` directly on a ref'd div.
 *     Pan/zoom therefore cause ZERO React re-renders of the artboards inside.
 *   - The dot grid (screen-space, unchanged since v2) is updated by the same
 *     rAF write: background-size/position move with the viewport, hidden
 *     below 0.5 zoom.
 *   - The transformed layer deliberately has NO `will-change: transform`.
 *     `will-change` promotes the layer to a cached composited texture: at
 *     400% zoom the cached bitmap is stretched → progressive blur. Without
 *     it the browser re-rasterizes the live layout at the final scale on the
 *     GPU, so the react-native-web artboards stay crisp at every zoom.
 */

import { useLayoutEffect, useRef } from 'react'

import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { createRafScheduler } from '@/lib/canvas/raf-scheduler'

/** Dot grid visible from this zoom up (matches the v2 host's threshold). */
const GRID_MIN_ZOOM = 0.5
/** Dot grid lattice in canvas units (screen px = GRID_UNIT * zoom). */
const GRID_UNIT = 24
/** Dot grid dot (kept pixel-identical to the v2 host). */
const GRID_DOT = 'radial-gradient(rgb(58 58 58 / 0.7) 1px, transparent 1px)'

export interface ViewportLayerProps {
  /** Artboard subtree (memoized ScreenArtboards); never re-rendered by pan/zoom. */
  children?: React.ReactNode
}

/**
 * The transformed content layer + the screen-space dot grid behind it.
 * One instance per canvas host; it renders exactly once.
 */
export function ViewportLayer({ children }: ViewportLayerProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    /** Apply the current viewport to the DOM (transform + grid), pre-paint on mount. */
    const write = () => {
      const { panX, panY, zoom } = useCanvasViewport.getState()

      const layer = layerRef.current
      if (layer) layer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`

      const grid = gridRef.current
      if (!grid) return
      if (zoom < GRID_MIN_ZOOM) {
        grid.style.display = 'none'
        return
      }
      const spacing = GRID_UNIT * zoom
      grid.style.display = ''
      grid.style.backgroundImage = GRID_DOT
      grid.style.backgroundSize = `${spacing}px ${spacing}px`
      grid.style.backgroundPosition = `${panX % spacing}px ${panY % spacing}px`
    }

    // First paint: synchronous write, before the browser shows the layer.
    write()

    // Every viewport change: coalesced into one rAF write per frame.
    const scheduler = createRafScheduler(write)
    const unsubscribe = useCanvasViewport.subscribe(() => scheduler.schedule())
    return () => {
      unsubscribe()
      scheduler.cancel()
    }
  }, [])

  return (
    <>
      {/* Screen-space dot grid (canvas-space 24u lattice; hidden below 0.5 zoom). */}
      <div ref={gridRef} aria-hidden className="pointer-events-none absolute inset-0" />
      {/* Transformed layer: artboards live in canvas space. NO will-change (see header). */}
      <div
        ref={layerRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: 'translate(0px, 0px) scale(1)' }}
      >
        {children}
      </div>
    </>
  )
}
