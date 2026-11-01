/*
 * Canvas overlay color constants — ported from open-pencil packages/core/src/constants.ts.
 * (MIT License, Copyright (c) 2026 Danila Poyarkov & OpenPencil contributors.)
 * The chrome itself is token-driven; these are the in-canvas overlay colors (selection,
 * snapping, component outlines) that open-pencil draws inside the canvas. Equivalent hex
 * per docs/03-design.md §1.1.
 */

export const SELECTION_COLOR = '#3b82f6' // open-pencil SELECTION_COLOR {0.23, 0.51, 0.96}
export const SNAP_COLOR = '#ff0090' // open-pencil SNAP_COLOR {1.0, 0.0, 0.56}
export const COMPONENT_COLOR = '#bb8cff' // open-pencil --color-component
export const MEASUREMENT_COLOR = '#f24822' // open-pencil MEASUREMENT_COLOR {0.949, 0.282, 0.133}

/** Snap tuning — ported from open-pencil snap-guide semantics (docs/03-design.md §3). */
export const SNAP_TOLERANCE_PX = 5
export const SNAP_MAX_GUIDES = 6
