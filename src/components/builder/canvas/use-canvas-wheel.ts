'use client'
/*
 * Ported from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Source: packages/vue/src/shared/input/wheel.ts — setupWheelPanZoom (lines 166–270)
 * Deviation: Vue refs replaced by a React hook over the viewport store; the
 * accumulate-on-event / flush-on-rAF logic and the settle timer are unchanged.
 */

import { useEffect } from 'react'

import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import { createRafScheduler } from '@/lib/canvas/raf-scheduler'
import {
  createWheelAccum,
  createWheelSteps,
  currentWheelPlatform,
  type WheelAccum,
  type WheelStep
} from '@/lib/canvas/wheel'

const NAVIGATION_SETTLE_DELAY_MS = 120

/**
 * Wheel pan/zoom over the canvas. `zoomSpeed` scales how far each event zooms: 1 keeps
 * Figma's rate, 0.5 zooms half as far. Flushes accumulated steps on one rAF per event burst.
 */
export function useCanvasWheel(
  targetRef: React.RefObject<HTMLElement | null>,
  zoomSpeed: () => number = () => 1,
  onSettle?: () => void
) {
  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    const wheelAccum: WheelAccum = createWheelAccum()
    const wheelStep = createWheelSteps(currentWheelPlatform(), zoomSpeed)
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    function scheduleSettle() {
      if (settleTimer !== null) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        settleTimer = null
        onSettle?.()
      }, NAVIGATION_SETTLE_DELAY_MS)
    }

    function flushWheel() {
      const store = useCanvasViewport.getState()
      if (wheelAccum.hasZoom) {
        store.setZoomAroundPoint(
          useCanvasViewport.getState().zoom * wheelAccum.zoomScale,
          wheelAccum.zoomCenterX,
          wheelAccum.zoomCenterY
        )
      } else {
        store.pan(wheelAccum.deltaX, wheelAccum.deltaY)
      }
      wheelAccum.deltaX = 0
      wheelAccum.deltaY = 0
      wheelAccum.zoomScale = 1
      wheelAccum.hasZoom = false
      scheduleSettle()
    }

    const wheelScheduler = createRafScheduler(flushWheel)

    function onWheel(event: WheelEvent) {
      if (!el) return
      const step: WheelStep = wheelStep(event)

      if (step.kind === 'zoom') {
        const rect = el.getBoundingClientRect()
        wheelAccum.zoomCenterX = event.clientX - rect.left
        wheelAccum.zoomCenterY = event.clientY - rect.top
        wheelAccum.zoomScale *= step.scale
        wheelAccum.hasZoom = true
      } else {
        // open-pencil pans by -step (screen-space pan grows downward-left); keep the sign.
        wheelAccum.deltaX -= step.dx
        wheelAccum.deltaY -= step.dy
      }
      wheelScheduler.schedule()
    }

    const listener = (event: WheelEvent) => {
      event.preventDefault()
      onWheel(event)
    }

    el.addEventListener('wheel', listener, { passive: false })
    return () => {
      el.removeEventListener('wheel', listener)
      if (settleTimer !== null) clearTimeout(settleTimer)
      wheelScheduler.cancel()
    }
  }, [targetRef, zoomSpeed, onSettle])
}
