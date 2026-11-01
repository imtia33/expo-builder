'use client'
/*
 * ChromeLayer — the screen-space chrome layer of the v3 DOM canvas.
 *
 * A sibling of the scaled ViewportLayer, rendered in SCREEN coordinates
 * (never scaled): constant-size UI chrome — group frames, artboard label
 * rows and the selection overlay — stays crisp at every zoom (25%–400%).
 * The layer root is pointer-events-none; interactive children opt in.
 *
 * Structure:
 *   <GroupFrames />            — Figma-Section frames for root groups
 *   <div ref={onTargetChange}/> — portal target: per-artboard chrome
 *                                (label row + selection overlay), rendered
 *                                by ScreenArtboard via createPortal so the
 *                                gesture wiring (useNodeEdit, screen drag)
 *                                stays attached to the owning artboard while
 *                                only the DIVS move out of the scaled layer.
 *
 * The root carries `data-canvas-chrome`: CanvasHost treats clicks on it like
 * clicks on artboards (focus the canvas keymap, never a deselect candidate).
 */

import { GroupFrames } from './group-frame'

export interface ChromeLayerProps {
  /** Receives the portal-target div (mount) and null (unmount). */
  onTargetChange: (el: HTMLDivElement | null) => void
}

export function ChromeLayer({ onTargetChange }: ChromeLayerProps) {
  return (
    <div data-canvas-chrome className="pointer-events-none absolute inset-0 z-10">
      <GroupFrames />
      <div ref={onTargetChange} className="absolute inset-0" />
    </div>
  )
}
