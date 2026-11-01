/*
 * Ported from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.
 * Sources:
 *   - packages/core/src/editor/viewport.ts  (pan/zoom math — verbatim)
 *   - packages/core/src/constants.ts        (zoom clamp limits 0.02–256)
 * Deviation: the Editor facade is replaced by a standalone Zustand store; every formula
 * (anchor zoom, zoomToBounds padding, centerOn, zoomToLevel center-preserving) is unchanged.
 * zoomToFit/zoomToSelection take explicit bounds instead of reading the scene graph.
 */

import { create } from 'zustand'

export const ZOOM_MIN = 0.02
export const ZOOM_MAX = 256

export interface ViewportSize {
  width: number
  height: number
}

export interface CanvasBounds {
  x: number
  y: number
  width: number
  height: number
}

const clampZoom = (level: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level))

interface CanvasViewportState {
  panX: number
  panY: number
  zoom: number
  viewportSize: ViewportSize
  /** Bumped on every viewport change; canvas host uses it to coalesce repaints. */
  version: number

  setViewportSize: (size: ViewportSize) => void
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number }
  canvasToScreen: (x: number, y: number) => { x: number; y: number }
  setZoomAroundPoint: (level: number, centerX: number, centerY: number) => void
  pan: (dx: number, dy: number) => void
  setPan: (panX: number, panY: number) => void
  zoomToBounds: (b: CanvasBounds) => void
  zoomToFit: (boundsOf: () => CanvasBounds | null) => void
  centerOn: (x: number, y: number, zoom?: number) => void
  zoomToLevel: (level: number) => void
  zoomTo100: () => void
}

export const useCanvasViewport = create<CanvasViewportState>((set, get) => ({
  panX: 0,
  panY: 0,
  zoom: 1,
  viewportSize: { width: 0, height: 0 },
  version: 0,

  setViewportSize: (size) =>
    set((s) =>
      s.viewportSize.width === size.width && s.viewportSize.height === size.height
        ? s
        : { viewportSize: size, version: s.version + 1 }
    ),

  // (sx - pan) / zoom — verbatim from viewport.ts screenToCanvas
  screenToCanvas: (sx, sy) => {
    const { panX, panY, zoom } = get()
    return { x: (sx - panX) / zoom, y: (sy - panY) / zoom }
  },

  canvasToScreen: (x, y) => {
    const { panX, panY, zoom } = get()
    return { x: x * zoom + panX, y: y * zoom + panY }
  },

  // Anchor-point zoom — verbatim from viewport.ts setZoomAroundPoint
  setZoomAroundPoint: (level, centerX, centerY) =>
    set((s) => {
      const newZoom = clampZoom(level)
      const panX = centerX - (centerX - s.panX) * (newZoom / s.zoom)
      const panY = centerY - (centerY - s.panY) * (newZoom / s.zoom)
      if (panX === s.panX && panY === s.panY && newZoom === s.zoom) return s
      return { panX, panY, zoom: newZoom, version: s.version + 1 }
    }),

  pan: (dx, dy) =>
    set((s) => ({ panX: s.panX + dx, panY: s.panY + dy, version: s.version + 1 })),

  setPan: (panX, panY) => set((s) => ({ panX, panY, version: s.version + 1 })),

  // verbatim from viewport.ts zoomToBounds (padding 80, zoom capped at 1)
  zoomToBounds: (b) =>
    set((s) => {
      const padding = 80
      const w = b.width + padding * 2
      const h = b.height + padding * 2
      const { width: viewW, height: viewH } = s.viewportSize
      const zoom = Math.min(viewW / w, viewH / h, 1)
      return {
        zoom,
        panX: (viewW - w * zoom) / 2 - b.x * zoom + padding * zoom,
        panY: (viewH - h * zoom) / 2 - b.y * zoom + padding * zoom,
        version: s.version + 1
      }
    }),

  // Pans to center the bounds when they fit at current zoom, zooms out to fit otherwise.
  zoomToFit: (boundsOf) => {
    const b = boundsOf()
    if (!b) return
    get().zoomToBounds(b)
  },

  // verbatim from viewport.ts centerOn
  centerOn: (x, y, zoom) =>
    set((s) => {
      const { width, height } = s.viewportSize
      const nextZoom = clampZoom(zoom ?? s.zoom)
      const panX = width / 2 - x * nextZoom
      const panY = height / 2 - y * nextZoom
      // A point that overflows leaves the view alone.
      if (!Number.isFinite(panX) || !Number.isFinite(panY)) return s
      return { zoom: nextZoom, panX, panY, version: s.version + 1 }
    }),

  // verbatim from viewport.ts zoomToLevel (keeps the world point at viewport center)
  zoomToLevel: (level) =>
    set((s) => {
      const { width: viewW, height: viewH } = s.viewportSize
      const centerX = (-s.panX + viewW / 2) / s.zoom
      const centerY = (-s.panY + viewH / 2) / s.zoom
      const zoom = clampZoom(level)
      return {
        zoom,
        panX: viewW / 2 - centerX * zoom,
        panY: viewH / 2 - centerY * zoom,
        version: s.version + 1
      }
    }),

  zoomTo100: () => get().zoomToLevel(1)
}))
