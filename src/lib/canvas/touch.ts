/*
 * Ported from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Sources:
 *   - packages/vue/src/shared/input/pan/zoom.ts (touch pinch + hand-pan algorithms — verbatim)
 *   - packages/vue/src/shared/input/gesture.ts  (Safari gesturestart/change — verbatim)
 * Deviation: Vue refs/lifecycle replaced by `useEffect` cleanup and a viewport store
 * (src/lib/canvas/viewport-store.ts). The gesture math is unchanged.
 */

import { useEffect } from 'react'

import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { createRafScheduler } from '@/lib/canvas/raf-scheduler'
import { PINCH_SCALE_EXPONENT } from '@/lib/canvas/wheel'

export interface TouchSyntheticMouse {
  onMouseDown: (e: MouseEvent) => void
  onMouseMove: (e: MouseEvent) => void
  onMouseUp: () => void
}

type TouchPanDrag =
  | { type: 'pan'; startScreenX: number; startScreenY: number; startPanX: number; startPanY: number }
  | null

/** Two-finger pinch + single-finger hand-pan, verbatim from open-pencil's setupPanZoom. */
export function useCanvasTouch(
  targetRef: React.RefObject<HTMLElement | null>,
  isHandTool: () => boolean,
  mouse: TouchSyntheticMouse
) {
  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    let activeTouches: Touch[] = []
    let pinchStartDist = 0
    let pinchStartZoom = 0
    let pinchMidX = 0
    let pinchMidY = 0

    const store = useCanvasViewport.getState()

    function touchDist(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    let touchAsMouse = false

    function syntheticMouse(type: string, t: Touch): MouseEvent {
      return new MouseEvent(type, {
        clientX: t.clientX,
        clientY: t.clientY,
        screenX: t.screenX,
        screenY: t.screenY,
        button: 0,
        buttons: 1,
        bubbles: true
      })
    }

    let drag: TouchPanDrag = null

    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      activeTouches = Array.from(e.touches)
      if (!el) return
      const rect = el.getBoundingClientRect()

      if (activeTouches.length === 2) {
        if (touchAsMouse) {
          mouse.onMouseUp()
          touchAsMouse = false
        }
        drag = null
        const [a, b] = activeTouches
        pinchStartDist = touchDist(a, b)
        pinchStartZoom = store.zoom
        pinchMidX = (a.clientX + b.clientX) / 2 - rect.left
        pinchMidY = (a.clientY + b.clientY) / 2 - rect.top
      } else if (activeTouches.length === 1) {
        const t = activeTouches[0]
        if (isHandTool()) {
          touchAsMouse = false
          drag = {
            type: 'pan',
            startScreenX: t.clientX,
            startScreenY: t.clientY,
            startPanX: store.panX,
            startPanY: store.panY
          }
        } else {
          touchAsMouse = true
          mouse.onMouseDown(syntheticMouse('mousedown', t))
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      activeTouches = Array.from(e.touches)
      if (!el) return
      const rect = el.getBoundingClientRect()

      if (activeTouches.length === 2) {
        const [a, b] = activeTouches
        const newMidX = (a.clientX + b.clientX) / 2 - rect.left
        const newMidY = (a.clientY + b.clientY) / 2 - rect.top

        const newDist = touchDist(a, b)
        if (pinchStartDist > 0) {
          const scale = newDist / pinchStartDist
          const newZoom = pinchStartZoom * scale
          const panDx = newMidX - pinchMidX
          const panDy = newMidY - pinchMidY

          store.setZoomAroundPoint(newZoom, pinchMidX, pinchMidY)
          store.pan(panDx, panDy)
        }

        pinchMidX = newMidX
        pinchMidY = newMidY
      } else if (activeTouches.length === 1) {
        const t = activeTouches[0]
        if (touchAsMouse) {
          mouse.onMouseMove(syntheticMouse('mousemove', t))
        } else if (drag?.type === 'pan') {
          const d = drag
          useCanvasViewport.getState().setPan(
            d.startPanX + (t.clientX - d.startScreenX),
            d.startPanY + (t.clientY - d.startScreenY)
          )
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault()
      activeTouches = Array.from(e.touches)

      if (activeTouches.length === 0) {
        if (touchAsMouse) {
          mouse.onMouseUp()
          touchAsMouse = false
        } else {
          drag = null
        }
        pinchStartDist = 0
      } else if (activeTouches.length === 1) {
        const t = activeTouches[0]
        if (!touchAsMouse) {
          drag = {
            type: 'pan',
            startScreenX: t.clientX,
            startScreenY: t.clientY,
            startPanX: useCanvasViewport.getState().panX,
            startPanY: useCanvasViewport.getState().panY
          }
        }
        pinchStartDist = 0
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [targetRef, isHandTool, mouse.onMouseDown, mouse.onMouseMove, mouse.onMouseUp])
}

/** Minimal WebKit GestureEvent shape (Safari-only, not in lib.dom for all targets). */
interface WebKitGestureEvent extends Event {
  scale: number
  clientX: number
  clientY: number
}

/** WebKit pinch (gesture events), verbatim from open-pencil's setupSafariGestureZoom. */
export function useSafariGestureZoom(
  targetRef: React.RefObject<HTMLElement | null>,
  zoomSpeed: () => number = () => 1
) {
  useEffect(() => {
    const el = targetRef.current?.parentElement ?? targetRef.current
    if (!el) return
    if (!('GestureEvent' in window)) return

    let gestureStartZoom = 1
    let pendingGesture: { scale: number; sx: number; sy: number } | null = null

    function flushGesture() {
      if (!pendingGesture) return
      const { scale, sx, sy } = pendingGesture
      pendingGesture = null
      useCanvasViewport
        .getState()
        .setZoomAroundPoint(gestureStartZoom * scale ** (PINCH_SCALE_EXPONENT * zoomSpeed()), sx, sy)
    }

    const gestureScheduler = createRafScheduler(flushGesture)

    function onGestureStart(e: Event) {
      e.preventDefault()
      gestureStartZoom = useCanvasViewport.getState().zoom
    }

    function onGestureChange(e: Event) {
      e.preventDefault()
      const ge = e as WebKitGestureEvent
      if (!el) return
      const rect = el.getBoundingClientRect()
      pendingGesture = {
        scale: ge.scale,
        sx: ge.clientX - rect.left,
        sy: ge.clientY - rect.top
      }
      gestureScheduler.schedule()
    }

    function onGestureEnd(e: Event) {
      e.preventDefault()
      gestureScheduler.cancel()
      flushGesture()
    }

    el.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false })
    el.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false })
    el.addEventListener('gestureend', onGestureEnd as EventListener, { passive: false })
    return () => {
      el.removeEventListener('gesturestart', onGestureStart as EventListener)
      el.removeEventListener('gesturechange', onGestureChange as EventListener)
      el.removeEventListener('gestureend', onGestureEnd as EventListener)
    }
  }, [targetRef, zoomSpeed])
}
