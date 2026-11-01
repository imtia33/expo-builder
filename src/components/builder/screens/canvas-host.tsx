'use client'
/*
 * CanvasHost — the ExpoForge infinite canvas (v3 rework).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  RENDERING ARCHITECTURE (the v3 decision — do not regress)
 * ════════════════════════════════════════════════════════════════════════
 * The DOM stays the scene graph. The live react-native-web preview IS the
 * resolution-independent renderer: real vector text, real CSS borders and
 * radii, rasterized by the browser at the FINAL scale — there is no second
 * parallel renderer (no canvas2d/webgl/svg copy of every RN component).
 * Sharpness at 25%–400% zoom comes from two rules instead:
 *
 *  1. Pan/zoom is a composited CSS transform on the artboard layer with NO
 *     `will-change`. `will-change: transform` promotes the layer to a cached
 *     composited texture — at 400% the cached bitmap is stretched = the v2
 *     progressive blur. Without it, the browser re-rasterizes the live layout
 *     at the final scale, so artboards stay crisp at every zoom.
 *  2. Pan/zoom never re-renders React. The transformed layer is written
 *     imperatively by <ViewportLayer> (canvas/viewport-layer.tsx): it holds
 *     no viewport state — a `useCanvasViewport.subscribe(...)` effect batches
 *     one rAF write per frame of `style.transform`. Artboards are React.memo
 *     (canvas/screen-artboard.tsx) and re-render only when their `screen`
 *     object identity changes — a canvas drag replaces only the touched
 *     screen object, so other artboards never re-render.
 *  3. ALL constant-size chrome lives in an unscaled sibling layer,
 *     <ChromeLayer> (canvas/chrome-layer.tsx), positioned in screen
 *     coordinates via the `canvasToScreen` math (`p*zoom+pan`): group frames,
 *     artboard label rows and the selection overlay (outline, handles, snap
 *     guides, size pill, hint chips) stay 1px/11px-crisp at every zoom.
 *     Artboards render their chrome into it through a React portal so the
 *     gesture wiring (useNodeEdit, screen/group drag) stays attached to the
 *     owning component while only the DIVS move out of the scaled layer.
 *
 * Public API (integration contract):
 *   <CanvasHost activeTool="select" insertTool={tool} onPlaced={exitPlacement} />
 *
 * Structure:
 *   <root>                     — wheel/touch/gesture listeners, keymap (delete,
 *                                escape, arrow-nudge incl. groups), measures
 *                                the viewport, owns the chrome portal target
 *     <ViewportLayer>          — dot grid + translate(pan) scale(zoom);
 *                                contains the memoized <ScreenArtboard />…
 *     <ChromeLayer>            — screen-space chrome (unscaled): group frames
 *                                + the portal target for per-artboard chrome
 *     <empty state>            — first-run quick-add
 *     <placement layer>        — crosshair capture layer while an insert tool
 *                                is active (see canvas/placement.ts)
 *     <status chip>            — "Click to place X · Esc to cancel"
 *
 * Clicks on artboards OR chrome ([data-screen-artboard], [data-canvas-chrome])
 * focus the canvas keymap and are never bare-canvas deselect candidates.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/utils'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { useProjectStore } from '@/lib/project/store'
import type { InsertTool } from '@/lib/project/types'
import { getEntry } from '@/expoforge/registry'
import { SlotIcon } from '@/components/builder/icons/slots'
import { floatingSurface } from '@/app/theme/overlay'
import buttonTheme from '@/app/theme/button/button'

import { useCanvasWheel } from '../canvas/use-canvas-wheel'
import { useCanvasTouch, useSafariGestureZoom } from '@/lib/canvas/touch'
import { setCanvasPanning, useCanvasInputMode } from '../canvas/input-mode'
import { placeComponent } from '../canvas/placement'
import { ViewportLayer } from '../canvas/viewport-layer'
import { ChromeLayer } from '../canvas/chrome-layer'
import { ScreenArtboard } from './screen-artboard'

const buttonStyles = tv(buttonTheme)

export type CanvasTool = 'select' | 'hand'

export interface CanvasHostProps {
  activeTool: CanvasTool
  /** Active insert tool (screen or component placement); null/undefined = none. */
  insertTool?: InsertTool | null
  /** Fires once after a placement completes OR is cancelled (Esc) — the parent exits placement mode. */
  onPlaced?: () => void
  className?: string
}

interface DragPanState {
  pointerId: number
  startX: number
  startY: number
  startPanX: number
  startPanY: number
}

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

export function CanvasHost({ activeTool, insertTool = null, onPlaced, className }: CanvasHostProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragPan = useRef<DragPanState | null>(null)
  const clickDown = useRef<{ x: number; y: number } | null>(null)

  /* Latest-value refs (stable handler identities for window listeners); kept
   * current in a passive effect so handlers never see a stale tool/callback. */
  const insertToolRef = useRef(insertTool)
  const onPlacedRef = useRef(onPlaced)
  useEffect(() => {
    insertToolRef.current = insertTool
    onPlacedRef.current = onPlaced
  }, [insertTool, onPlaced])

  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)

  /* Screen-space chrome portal target (ChromeLayer mounts the div). */
  const [chromeTarget, setChromeTarget] = useState<HTMLDivElement | null>(null)

  /* Store reads — deliberately NO viewport subscription: pan/zoom must not
   * re-render React (ViewportLayer/ChromeLayer handle it imperatively). */
  const screens = useProjectStore((s) => s.data.screens)
  const simOn = useProjectStore((s) => s.sim.on)
  const panIntent = useCanvasInputMode((s) => s.panning)

  const placing = insertTool != null && !simOn
  const placingComponentTool = placing && insertTool?.kind === 'component' ? insertTool : null
  const placeName = placingComponentTool ? (getEntry(placingComponentTool.type)?.name ?? 'component') : null

  /* ── viewport size (for zoom-to-fit math) ─────────────────────────── */

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      useCanvasViewport.getState().setViewportSize({ width: r.width, height: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── pan / zoom input (ported math — src/lib/canvas/*) ────────────── */

  useCanvasWheel(rootRef)
  useSafariGestureZoom(rootRef)
  // Single-touch pan intent comes from the input-mode store (hand tool / Space).
  const isHandTool = useCallback(() => useCanvasInputMode.getState().panning, [])
  useCanvasTouch(rootRef, isHandTool, NOOP_MOUSE)

  /* Space held anywhere → hand-pan mode (docs/03 §3.4). */
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ' || e.key === 'Space'
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSpace(e) && !isEditable(e.target)) {
        if (!e.repeat) setSpaceDown(true)
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpace(e)) setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  /* Publish hand/space pan intent for artboards (no re-renders there). */
  useEffect(() => {
    setCanvasPanning(activeTool === 'hand' || spaceDown)
  }, [activeTool, spaceDown])

  /* ── drag pan (space / hand tool / middle mouse) ──────────────────── */

  const onRootPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = useCanvasViewport.getState()
      const panButtons = e.button === 1 || (e.button === 0 && panIntent)
      if (panButtons) {
        dragPan.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startPanX: pan.panX,
          startPanY: pan.panY
        }
        clickDown.current = null
        setPanning(true)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
      // Take focus for the canvas keymap (Delete/Esc/arrows). Clicks on
      // non-focusable children (edit panes, artboard chrome, the screen-space
      // chrome layer) otherwise leave focus on <body>, where the root's
      // capture handlers never fire. A rAF lands the focus AFTER the
      // browser's default mousedown focus change.
      if (!isEditable(e.target)) {
        const root = rootRef.current
        if (root) requestAnimationFrame(() => root.focus({ preventScroll: true }))
      }
      // Bare-canvas left click (select tool, no placement): candidate for
      // deselect-on-click. Clicks on an artboard OR on canvas chrome (label
      // rows, group frames — which live in the screen-space layer, outside
      // the artboard DOM) are NOT candidates: their own handlers own the
      // click.
      if (e.button === 0 && !insertToolRef.current) {
        const target = e.target as HTMLElement
        if (
          typeof target.closest === 'function' &&
          !target.closest('[data-screen-artboard], [data-canvas-chrome]')
        ) {
          clickDown.current = { x: e.clientX, y: e.clientY }
          return
        }
      }
      clickDown.current = null
    },
    [panIntent]
  )

  const onRootPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragPan.current
    if (!d || d.pointerId !== e.pointerId) return
    useCanvasViewport.getState().setPan(d.startPanX + (e.clientX - d.startX), d.startPanY + (e.clientY - d.startY))
  }, [])

  const onRootPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // A cancelled pointer (e.g. touch scroll takeover) ends a pan but is not a click.
    if (dragPan.current?.pointerId === e.pointerId) {
      dragPan.current = null
      setPanning(false)
    }
    clickDown.current = null
  }, [])

  const onRootPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPan.current?.pointerId === e.pointerId) {
      dragPan.current = null
      setPanning(false)
    }
    const down = clickDown.current
    if (down && e.button === 0 && !insertToolRef.current) {
      clickDown.current = null
      // A click (not a drag) on bare canvas clears the selection.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
        const store = useProjectStore.getState()
        if (store.selection) store.select(null)
      }
    }
  }, [])

  /* ── placement (insert tools) ─────────────────────────────────────── */

  const onPlacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (useCanvasInputMode.getState().panning) return // space/hand: pan instead
      const tool = insertToolRef.current
      const root = rootRef.current
      if (!tool || !root) return
      const store = useProjectStore.getState()
      if (store.sim.on) return

      const rect = root.getBoundingClientRect()
      const point = useCanvasViewport.getState().screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)
      if (tool.kind === 'screen') {
        // Click anywhere (bare canvas or over an artboard): the store places
        // the new screen non-overlapping near the click.
        store.addScreen({ at: point })
        onPlacedRef.current?.()
        return
      }
      const outcome = placeComponent(tool.type, e.clientX, e.clientY, point)
      if (outcome.ok) onPlacedRef.current?.()
    },
    []
  )

  /* Esc cancels placement even when focus sits outside the canvas subtree. */
  useEffect(() => {
    if (!insertTool) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isEditable(document.activeElement)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onPlacedRef.current?.()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [insertTool])

  /* ── keyboard: delete / escape / arrow nudge (canvas focus) ───────── */

  const nudgeOpen = useRef(false)
  const heldArrows = useRef(new Set<string>())

  useEffect(
    () => () => {
      // Never leave a gesture open if the canvas unmounts mid-nudge.
      if (nudgeOpen.current) {
        nudgeOpen.current = false
        useProjectStore.getState().endGesture('keyboard')
      }
    },
    []
  )

  const onKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditable(document.activeElement) || isEditable(e.target)) return
    const store = useProjectStore.getState()

    if (e.key === 'Escape') {
      if (insertToolRef.current) {
        e.preventDefault()
        onPlacedRef.current?.()
        return
      }
      if (store.selection) {
        e.preventDefault()
        store.select(null)
      }
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !store.sim.on) {
      const sel = store.selection
      if (sel?.kind === 'node' && store.data.nodes[sel.nodeId]) {
        e.preventDefault()
        e.stopPropagation()
        store.deleteNode(sel.nodeId)
      }
      return
    }

    const delta = ARROW_DELTAS[e.key]
    if (!delta || store.sim.on) return
    const sel = store.selection
    if (!sel) return
    const step = e.shiftKey ? 10 : 1
    const [ax, ay] = delta

    if (sel.kind === 'node') {
      const node = store.data.nodes[sel.nodeId]
      // Flow-positioned and locked nodes don't nudge (mirrors drag).
      if (!node || node.locked || node.style.position !== 'absolute') return
      const left = typeof node.style.left === 'number' ? node.style.left : 0
      const top = typeof node.style.top === 'number' ? node.style.top : 0
      if (!nudgeOpen.current) {
        store.beginGesture('keyboard')
        nudgeOpen.current = true
      }
      heldArrows.current.add(e.key)
      store.setNodeStyle(sel.nodeId, { left: Math.round(left + ax * step), top: Math.round(top + ay * step) })
      e.preventDefault()
      return
    }

    if (sel.kind === 'screen') {
      const sc = store.data.screens.find((s) => s.id === sel.screenId)
      if (!sc) return
      if (!nudgeOpen.current) {
        store.beginGesture('keyboard')
        nudgeOpen.current = true
      }
      heldArrows.current.add(e.key)
      store.moveScreenCanvas(sel.screenId, sc.x + ax * step, sc.y + ay * step)
      e.preventDefault()
      return
    }

    if (sel.kind === 'group') {
      // Arrow nudge moves the whole group subtree (one undo entry per batch).
      if (!nudgeOpen.current) {
        store.beginGesture('keyboard')
        nudgeOpen.current = true
      }
      heldArrows.current.add(e.key)
      store.moveGroupCanvas(sel.groupId, ax * step, ay * step)
      e.preventDefault()
    }
  }, [])

  const onKeyUpCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ARROW_DELTAS[e.key]) return
    heldArrows.current.delete(e.key)
    if (heldArrows.current.size === 0 && nudgeOpen.current) {
      nudgeOpen.current = false
      useProjectStore.getState().endGesture('keyboard')
    }
  }, [])

  /* ── render ───────────────────────────────────────────────────────── */

  const isPanningTool = activeTool === 'hand' || spaceDown

  return (
    <div
      ref={rootRef}
      className={cn(
        // z-0 isolates the canvas's internal overlay layers (chrome z-10,
        // capture layer z-40, chips z-50) from sibling chrome — the floating
        // toolbar pill and any absolutely-positioned panels above the canvas
        // always stay clickable.
        'relative z-0 h-full w-full overflow-hidden bg-canvas outline-none',
        placing ? 'cursor-crosshair' : isPanningTool ? (panning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
        className
      )}
      tabIndex={0}
      role="region"
      aria-label="Design canvas"
      onKeyDownCapture={onKeyDownCapture}
      onKeyUpCapture={onKeyUpCapture}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerCancel}
    >
      {/* Scaled content: dot grid + artboards. Transform is written
       * imperatively by ViewportLayer — pan/zoom never re-render React. */}
      <ViewportLayer>
        {screens.map((sc) => (
          <ScreenArtboard key={sc.id} screen={sc} chromeTarget={chromeTarget} />
        ))}
      </ViewportLayer>

      {/* Screen-space chrome (unscaled): group frames + the portal target
       * for artboard label rows / the selection overlay. */}
      <ChromeLayer onTargetChange={setChromeTarget} />

      {/* Empty state — quick-add only; groups are created from the Screens panel. */}
      {screens.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            className={cn(
              'pointer-events-auto flex w-[320px] flex-col items-center gap-3 rounded-xl p-6 text-center',
              floatingSurface
            )}
          >
            <SlotIcon slot="canvas.empty-phone" size={20} className="text-muted" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-surface">Start building</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Screens are artboards with real device dimensions — drop Expo components onto them. Use the Screens
                panel to create groups with tabs or stack navigation.
              </p>
            </div>
            <button
              type="button"
              className={buttonStyles({
                color: 'primary',
                variant: 'solid',
                size: 'sm',
                shape: 'rounded',
                class: 'px-3 text-[11px] font-semibold'
              }).base()}
              onClick={() => useProjectStore.getState().addScreen()}
            >
              <SlotIcon slot="canvas.empty-plus" size={12} aria-hidden />
              New screen
            </button>
          </div>
        </div>
      )}

      {/* Placement capture layer — crosshair, owns every click while placing. */}
      {placing && (
        <div
          data-canvas-hit-through
          className={cn('absolute inset-0 z-40', panIntent ? (panning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair')}
          style={{ touchAction: 'none' }}
          onPointerDown={onPlacePointerDown}
        />
      )}

      {/* Placement status chip. */}
      {placingComponentTool && placeName && (
        <div
          className={cn(
            'pointer-events-none absolute right-3 top-3 z-50 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-surface',
            floatingSurface
          )}
          role="status"
        >
          <span>
            Click to place <strong className="font-semibold">{placeName}</strong>
          </span>
          <span className="text-muted">·</span>
          <kbd className="rounded border border-border bg-panel-field px-1 font-mono text-[10px] text-muted">Esc</kbd>
          <span className="text-muted">to cancel</span>
        </div>
      )}
    </div>
  )
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
  )
}

/**
 * Touch synthetic-mouse bridge (open-pencil pan/zoom.ts forwards single touches
 * as synthetic mouse events for the active tool). The DOM canvas handles
 * placement/selection through pointer events, so the bridge is a no-op;
 * module-level for a stable identity in useCanvasTouch's dep array.
 */
const NOOP_MOUSE = {
  onMouseDown: (_e: MouseEvent) => {},
  onMouseMove: (_e: MouseEvent) => {},
  onMouseUp: () => {}
} as const
