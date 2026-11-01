'use client'
/*
 * Canvas input mode — a tiny cross-artboard signal for "the pointer belongs
 * to panning right now" (Hand tool active, or Space held). CanvasHost writes
 * it; artboards read it inside pointer handlers via getState() so tool
 * switches never re-render the artboard trees.
 */

import { create } from 'zustand'

interface CanvasInputMode {
  /** True while the hand tool or Space makes every drag a pan. */
  panning: boolean
}

export const useCanvasInputMode = create<CanvasInputMode>(() => ({ panning: false }))

export function setCanvasPanning(panning: boolean): void {
  if (useCanvasInputMode.getState().panning !== panning) {
    useCanvasInputMode.setState({ panning })
  }
}

/** Read inside pointer handlers (no subscription, no re-render). */
export function isCanvasPanning(): boolean {
  return useCanvasInputMode.getState().panning
}
